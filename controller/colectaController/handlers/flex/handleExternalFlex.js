import { executeQuery, getCompanyByCode } from "../../../../db.js";
import { assign } from "../../functions/assign.js";
import { insertEnvios } from "../../functions/insertEnvios.js";
import { insertEnviosExteriores } from "../../functions/insertEnviosExteriores.js";
import { checkIfExistLogisticAsDriverInExternalCompany } from "../../functions/checkIfExistLogisticAsDriverInExternalCompany.js";
import { informe } from "../../functions/informe.js";
import { logCyan, logRed } from "../../../../src/funciones/logsCustom.js";
import { insertEnviosLogisticaInversa } from "../../functions/insertLogisticaInversa.js";
import { sendToShipmentStateMicroServiceAPI } from "../../functions/sendToShipmentStateMicroServiceAPI.js";
import { checkIfFulfillment } from "lightdata-tools";
import { connectWithFallback } from "../../../../src/funciones/connectWithFallback.js";
import { crearLogRaro } from "../../../../src/funciones/crear_log_raro.js";

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
  await checkIfFulfillment(dbConnection, shipmentId);
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

  if (logisticasExternas.length === 0) {
    logRed("No hay logisticas externas");
    throw new Error(`La cuenta de ML: ${dataQr.sender_id} no está vinculada`);
  }

  for (const logistica of logisticasExternas) {
    if (logistica == undefined) {
      await crearLogRaro({
        company,
        mensaje: `Logistica undefined para la cuenta de ML: ${dataQr.sender_id}`,
        detalle: JSON.stringify(logisticasExternas),
        nivel: "WARN",
      });
    }
    if (!logistica?.did) {
      continue;
    }

    const externalLogisticId = logistica.did;
    const nombreFantasia = logistica.nombre_fantasia;
    const syncCode = logistica.codigoVinculacionLogE;

    const externalCompany = await getCompanyByCode(syncCode);
    if (!externalCompany) {
      await crearLogRaro({
        company,
        mensaje: `No se encontró la empresa externa con código ${syncCode} para la cuenta de ML: ${dataQr.sender_id}`,
        nivel: "WARN",
      });
      continue;
    }
    const externalCompanyId = externalCompany.did;

    const externalDbConnection = await connectWithFallback(externalCompany);

    try {
      const driver = await checkIfExistLogisticAsDriverInExternalCompany(
        externalDbConnection,
        codLocal
      );

      if (!driver) {
        continue;
      }

      const sqlEnvios = `
        SELECT did
        FROM envios 
        WHERE ml_shipment_id = ? AND ml_vendedor_id = ? and elim = 0 and superado = 0
        LIMIT 1
      `;
      let rowsEnvios = await executeQuery(externalDbConnection, sqlEnvios, [shipmentId, senderid]);

      let externalShipmentId;

      if (rowsEnvios.length > 0) {
        externalShipmentId = rowsEnvios[0].did;
        logCyan("Encontré el envío en la logística externa");
        //! se reporta como error que el paquete haya sifodo colecta si apenas ingreso al sistema en la logística externa - no descomentar
        // const check = await checkearEstadoEnvio(
        //   externalDbConnection,
        //   externalShipmentId
        // );
        //  if (check) return check;

      } else {

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

        const externalClientId = rowsCuentas[0].didCliente;
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
        externalShipmentId = result;
      }

      let internalShipmentId;
      const consulta = "SELECT didLocal FROM envios_exteriores WHERE didExterno = ? and didEmpresa = ? and superado = 0 and elim = 0";
      internalShipmentId = await executeQuery(
        dbConnection,
        consulta,
        [externalShipmentId, externalCompanyId],
      );

      if (internalShipmentId.length > 0 && internalShipmentId[0]?.didLocal) {
        internalShipmentId = internalShipmentId[0].didLocal;
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

        await insertEnviosExteriores(
          dbConnection,
          internalShipmentId,
          externalShipmentId,
          1,
          nombreFantasia,
          externalCompanyId
        );
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

      await sendToShipmentStateMicroServiceAPI(
        externalCompanyId,
        driver,
        externalShipmentId,
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
      }

      const dqrext = {
        did: externalShipmentId,
        empresa: externalCompanyId,
        local: 1,
        cliente: externalLogisticId,
      };

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

