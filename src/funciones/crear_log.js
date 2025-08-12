import { executeQueryFromPool, getHeaders, logGreen } from "lightdata-tools";
import { poolLocal } from "../../db.js";

export async function crearLog(req, tiempo, resultado, metodo, exito) {
  const { companyId, userId, profile } = getHeaders(req) ?? {};

  // fallback defensivo por si algún proxy no pasó los headers esperados
  const empresa = companyId ?? req.headers["x-company-id"];
  const usuario = userId ?? req.headers["x-user-id"];
  const perfil = profile ?? req.headers["x-profile"];

  // valida antes de insertar (evitás NULL)
  if (empresa == null || usuario == null || perfil == null) {
    // podés loguear y salir sin romper la request:
    // console.warn('crearLog: faltan headers', { empresa, usuario, perfil });
    return;
  }

  const sqlLog = `
    INSERT INTO logs_v2 (empresa, usuario, perfil, body, tiempo, resultado, metodo, exito)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    Number(empresa),
    String(usuario),
    Number(perfil),
    JSON.stringify(req.body ?? {}),
    Math.round(tiempo),
    JSON.stringify(resultado ?? {}),
    String(metodo),
    !!exito,
  ];

  await executeQueryFromPool(poolLocal, sqlLog, values, true);
  logGreen(`Log creado: ${JSON.stringify(values)}`);
}
