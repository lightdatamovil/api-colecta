import { axiosInstance, urlAltaEnvioMicroservice, urlAltaEnvioRedisMicroservice } from "../../../db.js";

import { senToDataML } from "./sendToDataML.js";
import { getFechaConHoraLocalDePais, CustomException, EstadosEnvio } from "lightdata-tools";

/**
 * Inserta un envío en la base principal y sincroniza con Redis y MercadoLibre si corresponde.
 * @returns {Promise<number>} did del envío creado
 */
export async function insertEnvios({
  company,
  clientId,
  accountId,
  dataQr,
  flex = 0,
  externo = 0,
  userId,
  cp,
  driverId,
}) {
  const lote = "colecta";

  const fecha_inicio = getFechaConHoraLocalDePais(company.pais);
  const fechaunix = Math.floor(Date.now() / 1000);

  const idshipment = dataQr.id ?? null;
  const senderid = dataQr.sender_id ?? null;
  const payloadAltaEnvio = {
    data: {
      didCuenta: accountId,
      didCliente: clientId,
      idEmpresa: company.did,
      flex,
      externo,
      driverId,
      userId,
      fecha_inicio,
      fechaunix,
      dataQr,
      lote,
      cp,
      ml_shipment_id: idshipment,
      ml_vendedor_id: senderid,
    },
  }

  const response = await axiosInstance.post(
    urlAltaEnvioMicroservice,
    payloadAltaEnvio,
    { headers: { "Content-Type": "application/json" } }
  );

  const did = response.data?.did;

  if (!did) {
    throw new CustomException({
      title: "Error en alta de envío",
      message: "El microservicio no devolvió un ID de envío válido.",
    });
  }

  const tasks = [];

  if ([12, 79, 167].includes(company.did)) {
    tasks.push(
      senToDataML({
        companyId: company.did,
        didEnvio: did,
        sellerId: senderid,
        shipmentId: idshipment,
      })
    );
  }

  tasks.push(
    axiosInstance.post(
      urlAltaEnvioRedisMicroservice,
      {
        idEmpresa: company.did,
        estado: EstadosEnvio.value(EstadosEnvio.collected, company.did),
        did,
        ml_shipment_id: idshipment,
        ml_vendedor_id: senderid,
      },
      { headers: { "Content-Type": "application/json" } }
    )
  );

  await Promise.allSettled(tasks);

  return did;
}
