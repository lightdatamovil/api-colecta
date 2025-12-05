import mysql2 from 'mysql2/promise';
import { logGreen } from './logsCustom.js';
import { poolColecta } from '../../db.js';

const REDACT = (s) => (typeof s === 'string' && s.length > 500 ? s.slice(0, 500) + ' …[truncado]' : s);

export async function crearLog(
  empresa, usuario, perfil, body, tiempo, resultado, metodo, exito
) {
  const sql = `
    INSERT INTO logs_v2
      (empresa, usuario, perfil, body, tiempo, resultado, metodo, exito)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    empresa,
    usuario,
    Number(perfil) || 0,
    JSON.stringify(body ?? {}).slice(0, 20000),
    Math.round(Number(tiempo) || 0),
    (typeof resultado === 'string' ? resultado : JSON.stringify(resultado ?? {})).slice(0, 20000),
    metodo ?? 'api',
    exito ? 1 : 0, // aseguramos tinyint
  ];

  // formateo solo para debug seguro (no loguees en prod si no hace falta)
  const formatted = mysql2.format(sql, values);

  try {
    await poolColecta.execute(sql, values);
    logGreen(`Log creado ${new Date().toISOString()}`);
  } catch (e) {
    // logueá TODO, no solo e.message
    console.error('crearLog: fallo insert logs_v2', {
      msg: e?.message,
      code: e?.code,
      errno: e?.errno,
      sqlState: e?.sqlState,
      sqlMessage: e?.sqlMessage,
      // ¡OJO! mostrás la query solo en stage/dev:
      formatted_sql: REDACT(formatted),
    });
    // no re-lances: el log no debe romper la request
  }
}
