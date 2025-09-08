import axios from "axios";
import { senToDataML } from "./sendToDataML.js";
import { executeQuery } from "lightdata-tools";

export async function insertEnvios(
  dbConnection,
  companyId,
  clientId,
  accountId,
  dataQr,
  flex,
  externo,
  userId
) {
  const lote = "colecta";
  const fecha_actual = new Date();
  fecha_actual.setHours(fecha_actual.getHours() - 3);

  const fecha_inicio = fecha_actual
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const idshipment = dataQr.id;
  const senderid = dataQr.sender_id;
  const fechaunix = Math.floor(Date.now() / 1000);

  const queryInsertEnvios = `
            INSERT INTO envios (did, ml_shipment_id, ml_vendedor_id, didCliente, quien, lote, didCuenta, ml_qr_seguridad, fecha_inicio, flex, exterior, fechaunix)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

  const result = await executeQuery(dbConnection, queryInsertEnvios, [
    0,
    idshipment,
    senderid,
    clientId,
    userId,
    lote,
    accountId,
    JSON.stringify(dataQr),
    fecha_inicio,
    flex,
    externo,
    fechaunix,
  ]);

  if (result.insertId) {
    const updateSql = `
                UPDATE envios 
                SET did = ? 
                WHERE superado = 0 AND elim = 0 AND id = ? 
                LIMIT 1
            `;

    await executeQuery(dbConnection, updateSql, [
      result.insertId,
      result.insertId,
    ]);

    // mensaje por rabbitMQ
    if (companyId == 12) {

      await senToDataML(
        companyId,
        result.insertId,
        senderid,
        idshipment
      );
    }


    await axios.post(
      "https://altaenvios.lightdata.com.ar/api/enviosMLredis",
      {
        idEmpresa: companyId,
        estado: 0,
        did: result.insertId,
        ml_shipment_id: idshipment,
        ml_vendedor_id: senderid,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

  }

  return result.insertId;
}
