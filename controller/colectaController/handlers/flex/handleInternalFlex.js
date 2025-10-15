import { executeQuery } from "../../../../db.js";
import { assign } from "../../functions/assign.js";
import { insertEnvios } from "../../functions/insertEnvios.js";
import { informe } from "../../functions/informe.js";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { logBlue, logCyan } from "../../../../src/funciones/logsCustom.js";
import { sendToShipmentStateMicroServiceAPI } from "../../functions/sendToShipmentStateMicroServiceAPI.js";
import { checkIfFulfillment } from "../../../../src/funciones/checkIfFulfillment.js";

/// Busco el envio
/// Si no existe, lo inserto y tomo el did
/// Checkeo si el envío ya fue colectado cancelado o entregado
/// Actualizo el estado del envío y lo envío al microservicio de estados
/// Asigno el envío al usuario si es necesario
export async function handleInternalFlex(
  dbConnection,
  company,
  userId,
  profile,
  dataQr,
  autoAssign,
  account,
  latitude,
  longitude, senderId,
) {
  const companyId = company.did;
  const mlShipmentId = dataQr.id;
  const startTime = performance.now();
  let shipmentId;
  await checkIfFulfillment(dbConnection, mlShipmentId);
  logBlue(`Tiempo de espera en checkIfFulfillment: ${performance.now() - startTime} ms`);
  /// Busco el envio
  const sql = `
            SELECT did , didCliente, ml_qr_seguridad 
            FROM envios 
            WHERE ml_shipment_id = ? AND ml_vendedor_id = ? and elim = 0 and superado = 0 LIMIT 1    
        `;

  let resultBuscarEnvio = await executeQuery(dbConnection, sql, [
    mlShipmentId,
    senderId,
  ]);
  logBlue(`Tiempo de espera en executeQuery: ${performance.now() - startTime} ms`);
  shipmentId = resultBuscarEnvio.length > 0 ? resultBuscarEnvio[0].did : null;
  let didCLiente = resultBuscarEnvio.length > 0 ? resultBuscarEnvio[0].didCliente : null;
  let mlQrSeguridad = resultBuscarEnvio.length > 0 ? resultBuscarEnvio[0].ml_qr_seguridad : null;
  /// Si no existe, lo inserto y tomo el did
  if (resultBuscarEnvio.length === 0) {
    shipmentId = await insertEnvios(
      dbConnection,
      companyId,
      account.didCliente,
      account.didCuenta,
      dataQr,
      1,
      0,
      userId
    );
    logBlue(`Tiempo de espera en insertEnvios: ${performance.now() - startTime} ms`);
    resultBuscarEnvio = await executeQuery(dbConnection, sql, [
      mlShipmentId,
      senderId,
    ]);
    logBlue(`Tiempo de espera en executeQuery: ${performance.now() - startTime} ms`);
    logCyan("Inserte el envio");
  } else {


    /// Checkeo si el envío ya fue colectado cancelado o entregado
    const check = await checkearEstadoEnvio(dbConnection, shipmentId);
    logBlue(`Tiempo de espera en checkearEstadoEnvio: ${performance.now() - startTime} ms`);
    if (check) return check;
    logCyan("Encontre el envio");
  }

  const row = resultBuscarEnvio[0];

  shipmentId = row.did;
  logCyan("El envio no fue colectado cancelado o entregado");


  if (!mlQrSeguridad) {
    const queryUpdateEnvios = `
                    UPDATE envios 
                    SET ml_qr_seguridad = ?
                    WHERE superado = 0 AND elim = 0 AND did = ?
                    LIMIT 1`;

    await executeQuery(dbConnection, queryUpdateEnvios, [
      JSON.stringify(dataQr),
      shipmentId,
    ]);
    logBlue(`Tiempo de espera en executeQuery: ${performance.now() - startTime} ms`);
    logCyan("Actualice el ml_qr_seguridad del envio");
  }

  /// Actualizo el estado del envío y lo envío al microservicio de estados

  await sendToShipmentStateMicroServiceAPI(companyId, userId, shipmentId, latitude, longitude);
  logBlue(`Tiempo de espera en sendToShipmentStateMicroServiceAPI: ${performance.now() - startTime} ms`);
  logCyan(
    "Actualice el estado del envio y lo envie al microservicio de estados"
  );

  /// Asigno el envío al usuario si es necesario
  if (autoAssign) {
    await assign(companyId, userId, profile, dataQr, userId, "Autoasignado de colecta");
    logBlue(`Tiempo de espera en assign: ${performance.now() - startTime} ms`);
    logCyan("Asigne el envio");
  }

  if (companyId == 144) {
    const body = await informe(
      dbConnection,
      company,
      didCLiente,
      userId,
      shipmentId
    );
    logBlue(`Tiempo de espera en informe2: ${performance.now() - startTime} ms`);
    return {
      success: true,
      message: "Paquete puesto a planta  - FLEX",
      body: body,
    };
  }

  const body = await informe(
    dbConnection,
    company,
    account.didCliente || 0,
    userId,
    shipmentId
  );
  logBlue(`Tiempo de espera en informe: ${performance.now() - startTime} ms`);
  return {
    success: true,
    message: "Paquete insertado y colectado - FLEX",
    body: body,
  };
}
