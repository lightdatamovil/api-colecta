import { executeQuery } from "../../../../db.js";
import { assign } from "../../functions/assign.js";
import { insertEnvios } from "../../functions/insertEnvios.js";
import { informe } from "../../functions/informe.js";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { sendToShipmentStateMicroServiceAPI } from "../../functions/sendToShipmentStateMicroServiceAPI.js";
import { checkIfFulfillment } from "../../../../src/funciones/checkIfFulfillment.js";
import { fsetestadoMasivoDesde } from "../../../../src/funciones/setEstado.js";

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

  await checkIfFulfillment(dbConnection, mlShipmentId);

  const sql = `
            SELECT did , didCliente, ml_qr_seguridad 
            FROM envios 
            WHERE ml_shipment_id = ? AND ml_vendedor_id = ? and elim = 0 and superado = 0 LIMIT 1    
        `;

  let resultBuscarEnvio = await executeQuery(dbConnection, sql, [
    mlShipmentId,
    senderId,
  ]);

  let did = resultBuscarEnvio.length > 0 ? resultBuscarEnvio[0].did : null;

  if (resultBuscarEnvio.length === 0) {
    did = await insertEnvios(
      dbConnection,
      companyId,
      account.didCliente,
      account.didCuenta,
      dataQr,
      1,
      0,
      userId
    );
    resultBuscarEnvio = await executeQuery(dbConnection, sql, [
      mlShipmentId,
      senderId,
    ]);
    did = resultBuscarEnvio[0].did;
  } else {
    const check = await checkearEstadoEnvio(dbConnection, did);
    if (check) return check;
  }

  const didCliente = resultBuscarEnvio.length > 0 ? resultBuscarEnvio[0].didCliente : null;
  const mlQrSeguridad = resultBuscarEnvio.length > 0 ? resultBuscarEnvio[0].ml_qr_seguridad : null;

  if (!mlQrSeguridad) {
    const queryUpdateEnvios = `
                    UPDATE envios 
                    SET ml_qr_seguridad = ?
                    WHERE superado = 0 AND elim = 0 AND did = ?
                    LIMIT 1`;

    await executeQuery(dbConnection, queryUpdateEnvios, [
      JSON.stringify(dataQr),
      did,
    ]);
  }

  //  await sendToShipmentStateMicroServiceAPI(companyId, userId, did, latitude, longitude);

  await fsetestadoMasivoDesde({
    dbConnection,
    shipmentIds: [did],
    deviceFrom: "colectaAPP",
    dateConHora: new Date(),
    userId,
    onTheWayState: 0,
  });

  if (autoAssign) {
    await assign(companyId, userId, profile, dataQr, userId, "Autoasignado de colecta");
  }

  const body = await informe(
    dbConnection,
    company,
    companyId == 144 ? account?.didCliente ?? didCliente : didCliente,
    userId,
    did
  );

  return {
    success: true,
    message: "Paquete insertado y colectado - FLEX",
    body,
  };
}
