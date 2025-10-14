import { executeQueryFromPool } from "lightdata-tools";
import { logGreen } from "./logsCustom.js";
import { poolColecta } from "../../db.js";

export async function crearLog(
  empresa,
  usuario,
  perfil,
  body,
  tiempo,
  resultado,
  metodo,
  exito
) {
  const sqlLog = `INSERT INTO logs_v2 (empresa, usuario, perfil, body, tiempo, resultado, metodo, exito) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  const values = [
    empresa,
    usuario,
    perfil,
    JSON.stringify(body),
    tiempo,
    JSON.stringify(resultado),
    metodo,
    exito,
  ];

  await executeQueryFromPool(poolColecta, sqlLog, values);
  logGreen(`Log creado: ${JSON.stringify(values)}`);
}
