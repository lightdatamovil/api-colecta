import { executeQuery, getProdDbConfig, getCompanyByCode } from "../../../../db.js";
import { assign } from "../../functions/assign.js";
import mysql from "mysql";
import { insertEnvios } from "../../functions/insertEnvios.js";
import { insertEnviosExteriores } from "../../functions/insertEnviosExteriores.js";
import { checkIfExistLogisticAsDriverInExternalCompany } from "../../functions/checkIfExistLogisticAsDriverInExternalCompany.js";
import { informe } from "../../functions/informe.js";
import { logCyan, logRed } from "../../../../src/funciones/logsCustom.js";
import { insertEnviosLogisticaInversa } from "../../functions/insertLogisticaInversa.js";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { sendToShipmentStateMicroServiceAPI } from "../../functions/sendToShipmentStateMicroServiceAPI.js";

/// Esta funcion busca las logisticas vinculadas
/// Reviso si el envío ya fue colectado cancelado o entregado en la logística externa
/// Si el envio existe, tomo el did
/// Si no existe, lo inserto y tomo el did
/// Tomo los datos de los clientes de la logística externa para luego insertar los envios
/// Inserto el envio en la tabla envios y envios exteriores de la logística interna
/// Actualizo el estado del envío y lo envío al microservicio de estados en la logística interna
/// Actualizo el estado del envío y lo envío al microservicio de estados en la logística externa
export async function handleExternalFlex(
  dbConnection,
  company,
  userId,
  profile,
  dataQr,
  autoAssign,
  latitude,
  longitude
) {
  const senderid = dataQr.sender_id;
  const shipmentId = dataQr.id;
  const codLocal = company.codigo;

  const queryLogisticasExternas = `
    SELECT did, nombre_fantasia, codigoVinculacionLogE 
    FROM clientes 
    WHERE superado = 0 AND elim = 0 AND codigoVinculacionLogE != ''
  `;
  const logisticasExternas = await executeQuery(
    dbConnection,
    queryLogisticasExternas,
    [],
  );
  logCyan("Me traigo las logisticas externas");

  if (logisticasExternas.length === 0) {
    logRed("No hay logisticas externas");
    throw new Error(`La cuenta de ML: ${dataQr.sender_id} no está vinculada`);
  }

  for (const logistica of logisticasExternas) {
    logCyan(`Logística externa actual: ${logistica.nombre_fantasia}`);
    if (logistica.did == undefined) {
      throw new Error(`La logística está mal vinculada`);
    }

    const externalLogisticId = logistica.did;
    const nombreFantasia = logistica.nombre_fantasia;
    const syncCode = logistica.codigoVinculacionLogE;

    const externalCompany = await getCompanyByCode(syncCode);
    const externalCompanyId = externalCompany.did;

    const dbConfigExt = getProdDbConfig(externalCompany);
    const externalDbConnection = mysql.createConnection(dbConfigExt);
    externalDbConnection.connect();

    try {
      const driver = await checkIfExistLogisticAsDriverInExternalCompany(
        externalDbConnection,
        codLocal
      );

      if (!driver) {
        return {
          success: false,
          message: "No se encontró chofer asignado",
        };
      }
      logCyan("Encontré la logística como chofer en la logística externa");

      const sqlEnvios = `
        SELECT did, didCliente
        FROM envios 
        WHERE ml_shipment_id = ? AND ml_vendedor_id = ? and elim = 0 and superado = 0
        LIMIT 1
      `;
      let rowsEnvios = await executeQuery(
        externalDbConnection,
        sqlEnvios,
        [shipmentId, senderid]
      );

      let externalShipmentId;
      let externalClientId;


      if (rowsEnvios.length > 0) {
        externalShipmentId = rowsEnvios[0].did;
        externalClientId = rowsEnvios[0].didCliente;

        logCyan("Encontré el envío en la logística externa");
        const check = await checkearEstadoEnvio(
          externalDbConnection,
          externalShipmentId
        );
        if (check) return check;

      } else {
        logCyan("No encontré el envío en la logística externa");

        const sqlCuentas = `
          SELECT did, didCliente 
          FROM clientes_cuentas 
          WHERE superado = 0 AND elim = 0 AND tipoCuenta = 1 AND ML_id_vendedor = ?
        `;
        const rowsCuentas = await executeQuery(
          externalDbConnection,
          sqlCuentas,
          [senderid]
        );

        if (rowsCuentas.length == 0) {
          continue;
        }

        externalClientId = rowsCuentas[0].didCliente;
        const didcuenta_ext = rowsCuentas[0].did;

        const result = await insertEnvios(
          externalDbConnection,
          externalCompanyId,
          externalClientId,
          didcuenta_ext,
          dataQr,
          1,
          0,
          userId
        );

        const sqlEnvios2 = `
          SELECT did, didCliente
          FROM envios 
          WHERE did = ? AND ml_vendedor_id = ? and elim = 0 and superado = 0
          LIMIT 1
        `;
        rowsEnvios = await executeQuery(
          externalDbConnection,
          sqlEnvios2,
          [result, senderid]
        );

        logCyan("Inserté el envío en la logística externa");
        externalShipmentId = rowsEnvios[0].did;
      }

      logCyan("El envío no fue colectado, cancelado ni entregado");

      let internalShipmentId;
      const consulta = "SELECT didLocal FROM envios_exteriores WHERE didExterno = ? and superado = 0 and elim=0";
      internalShipmentId = await executeQuery(
        dbConnection,
        consulta,
        [externalShipmentId],
      );

      if (internalShipmentId.length > 0 && internalShipmentId[0]?.didLocal) {
        internalShipmentId = internalShipmentId[0].didLocal;
        logCyan("Encontré el envío en envíos exteriores");
      } else {
        internalShipmentId = await insertEnvios(
          dbConnection,
          company.did,
          externalLogisticId,
          0,
          dataQr,
          1,
          1,
          userId
        );
        logCyan("Inserté el envío en envíos");

        await insertEnviosExteriores(
          dbConnection,
          internalShipmentId,
          externalShipmentId,
          1,
          nombreFantasia,
          externalCompanyId
        );
        logCyan("Inserté el envío en envíos exteriores");
      }
      const check = "SELECT valor FROM envios_logisticainversa WHERE didEnvio = ?";
      const rows = await executeQuery(
        externalDbConnection,
        check,
        [externalShipmentId],
      );
      if (rows.length > 0) {
        await insertEnviosLogisticaInversa(
          dbConnection,
          internalShipmentId,
          rows[0].valor,
          userId
        );
      }


      await sendToShipmentStateMicroServiceAPI(
        company.did,
        userId,
        internalShipmentId,
        latitude,
        longitude
      );
      logCyan("Actualicé el estado del envío interno");

      await sendToShipmentStateMicroServiceAPI(
        externalCompanyId,
        driver,
        externalShipmentId,
        latitude,
        longitude
      );
      logCyan("Actualicé el estado del envío externo");

      if (autoAssign) {
        const dqr = {
          did: internalShipmentId,
          empresa: company.did,
          local: 1,
          cliente: externalLogisticId,
        };
        await assign(company.did, userId, profile, dqr, userId, "Autoasignado de colecta");
        logCyan("Asigné el envío en la logística interna");

        await assign(externalCompany.did, userId, profile, dataQr, driver, "colecta");
        logCyan("Asigné el envío en la logística externa");
      }

      const dqrext = {
        did: externalShipmentId,
        empresa: externalCompanyId,
        local: 1,
        cliente: externalLogisticId,
      };
      logCyan("Voy a asignar el envío en la logística externa");
      //tira error aca
      await assign(externalCompanyId, userId, profile, dqrext, driver, 'colecta');

      const queryInternalClient = `
        SELECT didCliente 
        FROM envios 
        WHERE did = ? and elim = 0 and superado=0
      `;
      const internalClient = await executeQuery(
        dbConnection,
        queryInternalClient,
        [internalShipmentId],
      );
      if (internalClient.length == 0) {
        return {
          success: false,
          message: "No se encontró cliente asociado",
        };
      }

      logCyan("Encontré el cliente interno");
      const body = await informe(
        dbConnection,
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

