import { insertEnvios } from "../../functions/insertEnvios.js";
import { informe } from "../../functions/informe.js";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { assign, checkIfFulfillment, executeQuery, sendShipmentStateToStateMicroserviceAPI } from "lightdata-tools";
import { urlEstadosMicroservice } from "../../../../db.js";

/// Busco el envio
/// Si no existe, lo inserto y tomo el did
/// Checkeo si el envío ya fue colectado cancelado o entregado
/// Actualizo el estado del envío y lo envío al microservicio de estados
/// Asigno el envío al usuario si es necesario
export async function handleInternalFlex({
  db,
  company,
  userId,
  profile,
  dataQr,
  autoAssign,
  account,
  latitude,
  longitude, senderId,
}) {
  const companyId = company.did;
  const mlShipmentId = dataQr.id;
  let shipmentId;
  await checkIfFulfillment(db, mlShipmentId);
  /// Busco el envio
  const sql = `
            SELECT did , didCliente, ml_qr_seguridad 
            FROM envios 
            WHERE ml_shipment_id = ? AND ml_vendedor_id = ? and elim = 0 and superado = 0 LIMIT 1    
        `;

  let resultBuscarEnvio = await executeQuery({
    dbConnection: db,
    query: sql,
    values: [
      mlShipmentId,
      senderId,
    ]
  });
  shipmentId = resultBuscarEnvio.length > 0 ? resultBuscarEnvio[0].did : null;
  let didCLiente = resultBuscarEnvio.length > 0 ? resultBuscarEnvio[0].didCliente : null;
  let mlQrSeguridad = resultBuscarEnvio.length > 0 ? resultBuscarEnvio[0].ml_qr_seguridad : null;
  /// Si no existe, lo inserto y tomo el did
  if (resultBuscarEnvio.length === 0) {
    shipmentId = await insertEnvios({
      company,
      accountId: account.didCliente,
      clientId: account.didCuenta,
      dataQr,
      flex: 1,
      externo: 0,
      userId
    });
    resultBuscarEnvio = await executeQuery({
      dbConnection: db,
      query: sql,
      values: [
        mlShipmentId,
        senderId,
      ]
    });
  } else {


    /// Checkeo si el envío ya fue colectado cancelado o entregado
    const check = await checkearEstadoEnvio(db, shipmentId);
    if (check) return check;
  }

  const row = resultBuscarEnvio[0];

  shipmentId = row.did;


  if (!mlQrSeguridad) {
    const queryUpdateEnvios = `
                    UPDATE envios 
                    SET ml_qr_seguridad = ?
                    WHERE superado = 0 AND elim = 0 AND did = ?
                    LIMIT 1`;

    await executeQuery({
      dbConnection: db,
      query: queryUpdateEnvios,
      values: [
        JSON.stringify(dataQr),
        shipmentId,
      ]
    });
  }

  /// Actualizo el estado del envío y lo envío al microservicio de estados

  await sendShipmentStateToStateMicroserviceAPI(urlEstadosMicroservice, company, userId, shipmentId, 0, latitude, longitude);

  /// Asigno el envío al usuario si es necesario
  if (autoAssign) {
    await assign(companyId, userId, profile, dataQr, userId, "Autoasignado de colecta");
  }

  if (companyId == 144) {
    const body = await informe({
      db,
      company,
      clientId: didCLiente,
      userId
    });
    return {
      success: true,
      message: "Paquete puesto a planta  - FLEX",
      body,
    };
  }

  const body = await informe({
    db,
    company,
    clientId: account.didCliente || 0,
    userId
  });

  return {
    success: true,
    message: "Paquete insertado y colectado - FLEX",
    body: body,
  };
}
