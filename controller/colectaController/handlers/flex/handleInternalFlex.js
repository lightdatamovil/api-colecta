import { executeQuery } from "../../../../db.js";
import { assign } from "../../functions/assign.js";
import { insertEnvios } from "../../functions/insertEnvios.js";
import { informe } from "../../functions/informe.js";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { sendToShipmentStateMicroServiceAPI } from "../../functions/sendToShipmentStateMicroServiceAPI.js";
import { checkIfFulfillment } from "../../../../src/funciones/checkIfFulfillment.js";

export async function handleInternalFlex(
  dbConnection,
  company,
  userId,
  profile,
  dataQr,
  autoAssign,
  account,
  latitude,
  longitude,
  senderId,
  mlShipmentId,
  flex
) {
  console.log("entre a internal flex");
  const companyId = company.did;
  console.log("1");
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
  console.log("2");
  if (resultBuscarEnvio.length === 0) {
    did = await insertEnvios(
      dbConnection,
      companyId,
      account.didCliente,
      account.didCuenta,
      dataQr,
      flex,
      0,
      userId
    );

  } else {
    const check = await checkearEstadoEnvio(dbConnection, did);
    if (check) return check;
  }
  console.log("3");

  const didCliente = resultBuscarEnvio.length > 0 ? resultBuscarEnvio[0].didCliente : null;
  const mlQrSeguridad = resultBuscarEnvio.length > 0 ? resultBuscarEnvio[0].ml_qr_seguridad : null;
  console.log("3");
  if (!mlQrSeguridad) {
    const queryUpdateEnvios = `
                    UPDATE envios 
                    SET ml_qr_seguridad = ?
                    WHERE superado = 0 AND elim = 0 AND did = ?
                    LIMIT 1`;

    await executeQuery(dbConnection, queryUpdateEnvios, [
      JSON.stringify(dataQr),
      did,
    ], true);
  }
  console.log("4");
  await sendToShipmentStateMicroServiceAPI(companyId, userId, did, latitude, longitude);

  if (autoAssign) {
    console.log("5");
    await assign(companyId, userId, profile, dataQr, userId, "Autoasignado de colecta");
  }

  console.log("Preparando informe...");
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
