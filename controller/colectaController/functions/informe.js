import { executeQuery, getClientsByCompany } from "../../../db.js";
import { getFechaLocalDePais } from "../../../src/funciones/getFechaLocalByPais.js";
import { logCyan } from "../../../src/funciones/logsCustom.js";

const cache = {};

export async function informe(dbConnection, company, clientId, userId) {
  const hoy = getFechaLocalDePais(company.pais);

  const sql2 = `
            SELECT count(e.id) as total
            FROM envios as e
            JOIN envios_historial as eh on ( eh.elim=0 and eh.superado=0
            AND eh.estado=7
            AND eh.didEnvio = e.did ) 
            WHERE e.superado=0
            AND e.elim=0
            AND e.didCliente = ?
            AND eh.fecha > ?
        `;
  const resultsql2 = await executeQuery(dbConnection, sql2, [clientId, `${hoy} 00:00:00`]);
  let totalARetirarCliente = resultsql2.length > 0 ? resultsql2[0].total : 0;


  // -------2----------------

  // Ingresados hoy
  const sql3 = `SELECT COUNT(id) as total FROM envios 
                      WHERE superado=0 AND elim=0 
                      AND estado_envio=7
                      AND autofecha > ?
                      AND choferAsignado = ?`;
  const resultsql3 = await executeQuery(dbConnection, sql3, [`${hoy} 00:00:00`, userId], true);
  let aColectarHoy = resultsql3.length > 0 ? resultsql3[0].total : 0;


  // ------------3--------------------


  const sql1 = `SELECT COUNT(id) as total FROM envios WHERE superado=0 AND elim=0 AND autofecha > ? AND estado_envio=7`;
  const resultsql1 = await executeQuery(dbConnection, sql1, [`${hoy} 00:00:00`, clientId]);
  let retiradoshoy = resultsql1.length > 0 ? resultsql1[0].total : 0;


  // ----------4------------
  const cacheKey = `${hoy}>${company.did}>${userId}`;

  if (!(cacheKey in cache)) {
    const sql4 = `
                SELECT COUNT(id) as total
                FROM envios_historial 
                WHERE elim=0
                AND quien = ? 
                AND autofecha > ? 
                AND estado=0
            `;
    const resultsql4 = await executeQuery(dbConnection, sql4, [userId, `${hoy} 00:00:00`]);
    cache[cacheKey] =
      resultsql4.length > 0 && resultsql4[0].total > 0
        ? resultsql4[0].total
        : 1;
  } else {
    cache[cacheKey] += 1;
  }

  let colectadosHoyPorMi = cache[cacheKey];


  const companyClients = await getClientsByCompany(dbConnection, company.did);

  if (companyClients[clientId] === undefined) {
    throw new Error("Cliente no encontrado");
  }
  logCyan("El cliente fue encontrado");

  logCyan("Se generó el informe");
  return {
    cliente: companyClients[clientId].nombre || "Sin informacion",
    cliente_total: totalARetirarCliente,
    aretirarHoy: aColectarHoy,
    retiradoshoy: retiradoshoy,// SOLO PARA ADMINS Y COORDINADORES
    retiradoshoymi: colectadosHoyPorMi, // SOLO PARA CHOFERES
  };
}
