import { informe } from "../../functions/informe.js";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { altaEnvioBasica, assign, checkIfFulfillment, EstadosEnvio, LightdataORM, sendShipmentStateToStateMicroserviceAPI } from "lightdata-tools";
import { urlEstadosMicroservice, axiosInstance, urlAsignacionMicroservice, urlAltaEnvioMicroservice, urlAltaEnvioRedisMicroservice, rabbitService, queueEstadosML } from "../../../../db.js";

export async function handleInternalFlex({
  db,
  headers,
  company,
  userId,
  dataQr,
  autoAssign,
  account,
  latitude,
  longitude, senderId,
}) {
  const companyId = company.did;
  const mlShipmentId = dataQr.id;

  let shipmentId;

  await checkIfFulfillment({ db, mlShipmentId });

  let [rowEnvio] = LightdataORM.select({
    dbConnection: db,
    table: 'envios',
    where: {
      ml_shipment_id: mlShipmentId,
      ml_vendedor_id: senderId,
    },
  });

  shipmentId = rowEnvio.length > 0 ? rowEnvio.did : null;

  let didCliente = rowEnvio.length > 0 ? rowEnvio.didCliente : null;
  let mlQrSeguridad = rowEnvio.length > 0 ? rowEnvio.ml_qr_seguridad : null;

  if (rowEnvio) {
    shipmentId = await altaEnvioBasica({
      urlAltaEnvioMicroservice,
      urlAltaEnvioRedisMicroservice,
      axiosInstance,
      rabbitServiceInstance: rabbitService,
      queueEstadosML,
      company,
      clientId: account.didCliente,
      accountId: account.didCuenta,
      dataQr,
      flex: 1,
      externo: 0,
      userId,
      driverId: userId,
      lote: "colecta",
    });

    [rowEnvio] = await LightdataORM.select({
      dbConnection: db,
      table: 'envios',
      where: {
        ml_shipment_id: mlShipmentId,
        ml_vendedor_id: senderId,
      },
    });
  } else {
    const check = await checkearEstadoEnvio({ db, shipmentId });
    if (check) return check;
  }

  shipmentId = rowEnvio.did;
  didCliente = rowEnvio.didCliente;
  mlQrSeguridad = rowEnvio.ml_qr_seguridad;

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
    estado: EstadosEnvio.value(EstadosEnvio.collected, company.did),
    latitude,
    longitude,
    desde: "Colecta App",
  });

  if (autoAssign) {
    await assign({
      headers,
      url: urlAsignacionMicroservice,
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
