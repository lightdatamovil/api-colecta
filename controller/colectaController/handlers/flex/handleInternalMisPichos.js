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

export async function handleInternalMisPichos(
  dbConnection,
  dataQr,
  company,
  userId,
  profile,
  autoAssign,
  account,
  latitude,
  longitude
) {
  console.log("handleInternalFlexMisPichos");
  console.log(1);
  const companyId = company.did;
  const mlShipmentId = dataQr.id_orden;
  const senderId = dataQr.id_seller;

  console.log("mlShipmentId:", mlShipmentId);
  console.log("senderId:", senderId);

  let shipmentId;
  await checkIfFulfillment(dbConnection, mlShipmentId);
  /// Busco el envio
  const sql = `
            SELECT did , didCliente, ml_qr_seguridad 
            FROM envios 
            WHERE ml_shipment_id = ?  and elim = 0 and superado = 0 LIMIT 1    
        `;

  let resultBuscarEnvio = await executeQuery(dbConnection, sql, [
    mlShipmentId,
    senderId,
  ], true);
  console.log(2);

  shipmentId = resultBuscarEnvio.length > 0 ? resultBuscarEnvio[0].did : null;
  let didCLiente = resultBuscarEnvio.length > 0 ? resultBuscarEnvio[0].didCliente : null;
  let mlQrSeguridad = resultBuscarEnvio.length > 0 ? resultBuscarEnvio[0].ml_qr_seguridad : null;
  /// Si no existe, lo inserto y tomo el did
  if (resultBuscarEnvio.length === 0) {
    console.log("Inserting shipment...");
    shipmentId = await insertEnvios(
      dbConnection,
      companyId,
      account.didCliente,
      account.didCuenta,
      dataQr,
      21, //mis pichos flex = 21
      0,
      userId
    );
    resultBuscarEnvio = await executeQuery(dbConnection, sql, [
      mlShipmentId,
      senderId,
    ], true);
    logCyan("Inserte el envio");
  } else {

    console.log(10);
    /// Checkeo si el envío ya fue colectado cancelado o entregado
    const check = await checkearEstadoEnvio(dbConnection, shipmentId);
    if (check) return check;
    console.log("Encontre el envio");
  }


  const row = resultBuscarEnvio[0];
  console.log(row);

  shipmentId = row.did;
  console.log("El envio no fue colectado cancelado o entregado");


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
    logCyan("Actualice el ml_qr_seguridad del envio");
  }

  /// Actualizo el estado del envío y lo envío al microservicio de estados


  const startTime = performance.now();
  console.log('Antes de sendToShipmentStateMicroServiceAPI', companyId, userId, shipmentId, latitude, longitude);
  await sendToShipmentStateMicroServiceAPI(companyId, userId, shipmentId, latitude, longitude);
  logBlue(`Tiempo de espera en sendToShipmentStateMicroServiceAPI: ${performance.now() - startTime} ms`);
  logCyan(
    "Actualice el estado del envio y lo envie al microservicio de estados"
  );

  /// Asigno el envío al usuario si es necesario
  if (autoAssign) {
    await assign(companyId, userId, profile, dataQr, userId, "Autoasignado de colecta");
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
    return {
      success: true,
      message: "Paquete puesto a planta - Mis Pichos",
      body: body,
    };
  }

  const body = await informe(
    dbConnection,
    company,
    account.didCliente || 66,
    userId,
    shipmentId
  );
  console.log(13);
  return {
    success: true,
    message: "Paquete insertado y colectado - Mis Pichos",
    body: body,
  };
}