import { axiosInstance } from "../../../db.js";
import { senToDataML } from "./sendToDataML.js";
import { getFechaConHoraLocalDePais } from "lightdata-tools";

export async function insertEnvios({
  company,
  clientId,
  accountId,
  dataQr,
  flex,
  externo,
  userId,
  driverId
}) {
  const lote = "colecta";

  const fecha_inicio = getFechaConHoraLocalDePais(company.pais);
  const fechaunix = Math.floor(Date.now() / 1000);

  const idshipment = dataQr.id;
  const senderid = dataQr.sender_id;

  const response = await axiosInstance.post(
    "https://altaenvios.lightdata.com.ar/api/altaenvio",
    {
      data: {
        didCuenta: accountId,
        didCliente: clientId,
        idEmpresa: company.did,
        flex,
        ml_shipment_id: idshipment,
        ml_vendedor_id: senderid,
        driverId,
        userId,
        externo,
        fecha_inicio,
        fechaunix,
        dataQr,
        lote
      }
    },
    {
      headers: {
        "Content-Type": "application/json",
      }
    }
  );
  const did = response.data.did;
  if (company.did == 12 || company.did == 79 || company.did == 167) {

    await senToDataML({
      companyId: company.did,
      didEnvio: did,
      sellerId: senderid,
      shipmentId: idshipment
    });
  }


  await axiosInstance.post(
    "https://altaenvios.lightdata.com.ar/api/enviosMLredis",
    {
      idEmpresa: company.did,
      estado: 0,
      did: did,
      ml_shipment_id: idshipment,
      ml_vendedor_id: senderid,
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return did;
}
