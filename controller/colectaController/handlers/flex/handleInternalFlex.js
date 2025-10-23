import { informe } from "../../functions/informe.js";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { assign, checkIfFulfillment, LightdataORM, sendShipmentStateToStateMicroserviceAPI } from "lightdata-tools";
import { urlEstadosMicroservice, axiosInstance, urlAsignacionMicroservice } from "../../../../db.js";

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

  let [rowEnvio] = LightdataORM.select({
    dbConnection: db,
    table: 'envios',
    where: {
      ml_shipment_id: mlShipmentId,
      ml_vendedor_id: senderId,
    },
  });

  shipmentId = rowEnvio.length > 0 ? rowEnvio.did : null;
  const didCliente = rowEnvio.length > 0 ? rowEnvio.didCliente : null;
  const mlQrSeguridad = rowEnvio.length > 0 ? rowEnvio.ml_qr_seguridad : null;

  if (rowEnvio) {
    // shipmentId = await insertEnvios({
    //   company,
    //   clientId: account.didCliente,
    //   accountId: account.didCuenta,
    //   dataQr,
    //   flex: 1,
    //   externo: 0,
    //   userId,
    //   cp: "",
    //   driverId: userId,
    // });

    [rowEnvio] = await LightdataORM.select({
      dbConnection: db,
      table: 'envios',
      where: {
        ml_shipment_id: mlShipmentId,
        ml_vendedor_id: senderId,
      },
    });
  } else {
    const check = await checkearEstadoEnvio(db, shipmentId);
    if (check) return check;
  }

  shipmentId = rowEnvio.did;

  if (!mlQrSeguridad) {
    await LightdataORM.update({
      dbConnection: db,
      table: 'envios',
      where: {
        did: shipmentId
      },
      values: {
        ml_qr_seguridad: JSON.stringify(dataQr)
      }
    });
  }

  await sendShipmentStateToStateMicroserviceAPI({
    urlEstadosMicroservice,
    axiosInstance,
    company,
    userId,
    shipmentId,
    estado: 0,
    latitude,
    longitude,
    desde: "Colecta App",
  });

  if (autoAssign) {
    await assign({
      url: urlAsignacionMicroservice,
      companyId,
      userId,
      profile,
      dataQr,
      driverId: userId,
      desde: "Autoasignado de colecta"
    });
  }

  const body = await informe({
    db,
    company,
    clientId: companyId == 144 ? didCliente : account.didCliente || 0,
    userId
  });

  return {
    success: true,
    message: "Paquete insertado y colectado - FLEX",
    body,
  };
}
