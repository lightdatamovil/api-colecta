import mysql from "mysql";
import { insertEnvios } from "../../functions/insertEnvios.js";
import { insertEnviosExteriores } from "../../functions/insertEnviosExteriores.js";
import { checkIfExistLogisticAsDriverInExternalCompany } from "../../functions/checkIfExistLogisticAsDriverInExternalCompany.js";
import { informe } from "../../functions/informe.js";
import { insertEnviosLogisticaInversa } from "../../functions/insertLogisticaInversa.js";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { assign, executeQuery, getProductionDbConfig, logRed, sendShipmentStateToStateMicroserviceAPI } from "lightdata-tools";
import { companiesService, urlEstadosMicroservice } from "../../../../db.js";

/// Esta funcion busca las logisticas vinculadas
/// Reviso si el envío ya fue colectado cancelado o entregado en la logística externa
/// Si el envio existe, tomo el did
/// Si no existe, lo inserto y tomo el did
/// Tomo los datos de los clientes de la logística externa para luego insertar los envios
/// Inserto el envio en la tabla envios y envios exteriores de la logística interna
/// Actualizo el estado del envío y lo envío al microservicio de estados en la logística interna
/// Actualizo el estado del envío y lo envío al microservicio de estados en la logística externa
export async function handleExternalFlex({
  db,
  company,
  userId,
  profile,
  dataQr,
  autoAssign,
  latitude,
  longitude
}) {
  const senderid = dataQr.sender_id;
  const shipmentId = dataQr.id;
  const codLocal = company.codigo;

  const queryLogisticasExternas = `
    SELECT did, nombre_fantasia, codigoVinculacionLogE 
    FROM clientes 
    WHERE superado = 0 AND elim = 0 AND codigoVinculacionLogE != ''
  `;
  const logisticasExternas = await executeQuery({
    dbConnection: db,
    query: queryLogisticasExternas
  });

  if (logisticasExternas.length === 0) {
    throw new Error(`La cuenta de ML: ${dataQr.sender_id} no está vinculada`);
  }

  for (const logistica of logisticasExternas) {
    if (logistica.did == undefined) {
      throw new Error(`La logística está mal vinculada`);
    }

    const externalLogisticId = logistica.did;
    const nombreFantasia = logistica.nombre_fantasia;
    const syncCode = logistica.codigoVinculacionLogE;

    const externalCompany = await companiesService.getCompanyByCode(syncCode);
    const externalCompanyId = externalCompany.did;

    const dbConfigExt = getProductionDbConfig(externalCompany);
    const externalDbConnection = mysql.createConnection(dbConfigExt);
    externalDbConnection.connect();

    try {
      const sqlEnvios = `
        SELECT did, didCliente
        FROM envios 
        WHERE ml_shipment_id = ? AND ml_vendedor_id = ? and elim = 0 and superado = 0
        LIMIT 1
      `;
      let rowsEnvios = await executeQuery({
        dbConnection: externalDbConnection,
        query: sqlEnvios,
        values: [shipmentId, senderid]
      });

      let externalShipmentId;
      let externalClientId;

      const driver = await checkIfExistLogisticAsDriverInExternalCompany({
        dbConnection: externalDbConnection,
        syncCode: codLocal
      });

      if (!driver) {
        return {
          success: false,
          message: "No se encontró chofer asignado",
        };
      }

      if (rowsEnvios.length > 0) {
        externalShipmentId = rowsEnvios[0].did;
        externalClientId = rowsEnvios[0].didCliente;

        const check = await checkearEstadoEnvio(
          externalDbConnection,
          externalShipmentId
        );
        if (check) return check;

      } else {
        const sqlCuentas = `
          SELECT did, didCliente 
          FROM clientes_cuentas 
          WHERE superado = 0 AND elim = 0 AND tipoCuenta = 1 AND ML_id_vendedor = ?
        `;
        const rowsCuentas = await executeQuery({
          externalDbConnection,
          query: sqlCuentas,
          values: [senderid]
        });

        if (rowsCuentas.length == 0) {
          continue;
        }

        externalClientId = rowsCuentas[0].didCliente;
        const didcuenta_ext = rowsCuentas[0].did;

        const result = await insertEnvios({
          company: externalCompany,
          clientId: externalClientId,
          accountId: didcuenta_ext,
          dataQr,
          flex: 1,
          externo: 0,
          userId,
          driverId: driver,
        });

        const sqlEnvios2 = `
          SELECT did, didCliente
          FROM envios 
          WHERE did = ? AND ml_vendedor_id = ? and elim = 0 and superado = 0
          LIMIT 1
        `;
        rowsEnvios = await executeQuery({
          dbConnection: externalDbConnection,
          query: sqlEnvios2,
          values: [result, senderid]
        });

        externalShipmentId = rowsEnvios[0].did;
      }

      let internalShipmentId;
      const consulta = "SELECT didLocal FROM envios_exteriores WHERE didExterno = ? and superado = 0 and elim=0";
      internalShipmentId = await executeQuery({
        dbConnection: db,
        query: consulta,
        values: [externalShipmentId]
      });

      if (internalShipmentId.length > 0 && internalShipmentId[0]?.didLocal) {
        internalShipmentId = internalShipmentId[0].didLocal;
      } else {
        internalShipmentId = await insertEnvios({
          company,
          accountId: externalLogisticId,
          clientId: 0,
          dataQr,
          flex: 1,
          externo: 1,
          userId,
          driverId: 0
        });

        const check = "SELECT valor FROM envios_logisticainversa WHERE didEnvio = ?";
        const rows = await executeQuery({
          dbConnection: externalDbConnection,
          query: check,
          values: [externalShipmentId]
        });
        if (rows.length > 0) {
          await insertEnviosLogisticaInversa(
            db,
            internalShipmentId,
            rows[0].valor,
            userId
          );
        }
      }

      await insertEnviosExteriores(
        db,
        internalShipmentId,
        externalShipmentId,
        1,
        nombreFantasia,
        externalCompanyId
      );

      await sendShipmentStateToStateMicroserviceAPI(
        urlEstadosMicroservice,
        company,
        userId,
        internalShipmentId,
        0,
        latitude,
        longitude
      );

      await sendShipmentStateToStateMicroserviceAPI(
        urlEstadosMicroservice,
        externalCompanyId,
        driver,
        externalShipmentId,
        0,
        latitude,
        longitude
      );

      if (autoAssign) {
        const dqr = {
          did: internalShipmentId,
          empresa: company.did,
          local: 1,
          cliente: externalLogisticId,
        };
        await assign(company.did, userId, profile, dqr, userId, "Autoasignado de colecta");

        await assign(externalCompany.did, userId, profile, dataQr, driver, "colecta");
      }

      const dqrext = {
        did: externalShipmentId,
        empresa: externalCompanyId,
        local: 1,
        cliente: externalLogisticId,
      };
      //tira error aca
      await assign(externalCompanyId, userId, profile, dqrext, driver, 'colecta');

      const queryInternalClient = `
        SELECT didCliente 
        FROM envios 
        WHERE did = ? and elim = 0 and superado=0
      `;
      const internalClient = await executeQuery({
        dbConnection: db,
        query: queryInternalClient,
        values: [internalShipmentId]
      });
      if (internalClient.length == 0) {
        return {
          success: false,
          message: "No se encontró cliente asociado",
        };
      }

      const body = await informe(
        db,
        company,
        internalClient[0].didCliente,
        userId,
        internalShipmentId
      );

      return {
        success: true,
        message: "Paquete colectado correctamente - FLEX",
        body: body,
      };
    } catch (error) {
      logRed(`Error procesando logística externa:  ${error.message}`);
      return {
        success: false,
        message: "Error procesando logística externa",
        error: error.message
      };
    } finally {
      externalDbConnection.end((err) => {
        if (err) logRed("Error al cerrar conexión externa: ", err.message);
      });
    }
  }
  return {
    success: false,
    message: "No se encontró cuenta asociada",
  };
}

