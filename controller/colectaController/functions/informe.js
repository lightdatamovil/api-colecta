import { executeQuery, getFechaConHoraLocalDePais, getFechaLocalDePais, logRed } from "lightdata-tools";
import { companiesService } from "../../../db.js";

// Cache en memoria con TTL simple
const cache = {};
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 días

export async function informe({ db, company, clientId = 0, userId }) {
  const hoy = getFechaLocalDePais(company.pais);
  const hoyConhora = getFechaConHoraLocalDePais(company.pais);

  if (!hoy) {
    const msg = `País (${company?.pais}) no soportado en configPaises`;
    logRed(msg);
  }

  const q1 = `
    SELECT COUNT(e.id) AS total
    FROM envios AS e
    JOIN envios_historial AS eh 
      ON eh.elim=0 AND eh.superado=0
     AND eh.estado=7
     AND eh.didEnvio = e.did
    WHERE e.superado=0
      AND e.elim=0
      AND e.didCliente = ?
      AND eh.fecha > ?
  `;

  const q2 = `
    SELECT COUNT(id) AS total 
    FROM envios 
    WHERE superado=0 
      AND elim=0 
      AND estado_envio=7
      AND autofecha > ?
      AND choferAsignado = ?
  `;

  const q3 = `
    SELECT COUNT(id) AS total 
    FROM envios 
    WHERE superado=0 
      AND elim=0 
      AND estado_envio=7
      AND autofecha > ?
  `;

  const [resTotalCliente, resColectarHoy, resRetiradosHoy] = await Promise.all([
    executeQuery({ dbConnection: db, query: q1, values: [clientId, hoyConhora] }),
    executeQuery({ dbConnection: db, query: q2, values: [hoyConhora, userId] }),
    executeQuery({ dbConnection: db, query: q3, values: [hoyConhora] }),
  ]);

  const totalARetirarCliente = resTotalCliente[0]?.total ?? 0;
  const aColectarHoy = resColectarHoy[0]?.total ?? 0;
  const retiradosHoy = resRetiradosHoy[0]?.total ?? 0;

  const cacheKey = `${hoy}:${company.did}:${userId}`;
  const now = Date.now();

  if (!cache[cacheKey] || now - cache[cacheKey].timestamp > CACHE_TTL_MS) {
    const q4 = `
      SELECT COUNT(id) AS total
      FROM envios_historial 
      WHERE elim = 0 
        AND superado = 0
        AND quien = ? 
        AND autofecha > ? 
        AND estado = 0
    `;
    const res = await executeQuery({ dbConnection: db, query: q4, values: [userId, hoyConhora] });
    cache[cacheKey] = {
      timestamp: now,
      total: res[0]?.total > 0 ? res[0].total : 1,
    };
  } else {
    cache[cacheKey].total++;
  }

  const colectadosHoyPorMi = cache[cacheKey].total;

  const companyClients = await companiesService.getClientsByCompany({ db, companyId: company.did });

  const cliente = companyClients?.[clientId]?.nombre ?? "Sin información";

  return {
    cliente,
    cliente_total: totalARetirarCliente,
    aretirarHoy: aColectarHoy,
    retiradoshoy: retiradosHoy,       // SOLO ADMINS Y COORDINADORES
    retiradoshoymi: colectadosHoyPorMi, // SOLO CHOFERES
  };
}
