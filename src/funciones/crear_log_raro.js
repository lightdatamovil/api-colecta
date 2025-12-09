import { getFechaConHoraLocalDePais } from "lightdata-tools";
import { logGreen } from "./logsCustom.js";
import { poolColecta } from "../../db.js";

const REDACT = (s) =>
    typeof s === "string" && s.length > 500
        ? s.slice(0, 500) + " …[truncado]"
        : s;

/**
 * Crea schema y tabla si no existen e inserta un log raro.
 * NO rompe la request si hay errores.
 */
export async function crearLogRaro({
    company = {},
    origen = null,
    mensaje,
    detalle = null,
    nivel = "ERROR", // ERROR | WARN | INFO | CRITICAL
}) {
    try {
        // =======================================================
        // 1) Crear schema y tabla si no existen (idempotente)
        // =======================================================
        await poolColecta.query(`
      CREATE SCHEMA IF NOT EXISTS data;

      CREATE TABLE IF NOT EXISTS data.logs_raros (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        origen VARCHAR(100) NULL,
        mensaje TEXT NOT NULL,
        detalle JSON NULL,
        nivel VARCHAR(20) DEFAULT 'INFO',
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed TINYINT DEFAULT 0
      );
    `);

        // =======================================================
        // 2) Preparar SQL INSERT
        // =======================================================
        const sql = `
      INSERT INTO data.logs_raros (origen, mensaje, detalle, nivel)
      VALUES (?, ?, ?, ?)
    `;

        const values = [
            origen ?? "desconocido",
            REDACT(mensaje ?? "sin mensaje"),
            detalle ? JSON.stringify(detalle).slice(0, 20000) : null,
            nivel,
        ];

        // =======================================================
        // 3) Insertar log
        // =======================================================
        await poolColecta.execute(sql, values);

        logGreen(
            `Log raro creado ${getFechaConHoraLocalDePais(company?.pais || "AR")}`
        );
    } catch (e) {
        console.error("crearLogRaro: fallo al guardar en logs_raros", {
            msg: e?.message,
            code: e?.code,
            errno: e?.errno,
            sqlState: e?.sqlState,
            sqlMessage: e?.sqlMessage,
            formatted_sql: REDACT(e?.formatted_sql),
        });

        // NUNCA romper la request por una falla de logging.
    }
}
