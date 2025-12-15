import { getProdDbConfig } from "../../db.js";
import { crearLogRaro } from "./crear_log_raro.js";
import { logRed } from "./logsCustom.js";
import mysql from "mysql";

export async function connectWithFallback(company, retries = 3) {
    let dbConfig;
    try {

        dbConfig = getProdDbConfig(company);
        const conn = mysql.createConnection(dbConfig);
        await conn.connect();
        return conn;
    } catch (err) {
        if (retries > 0) {
            console.log(`🔁 Reintentando conexión MySQL... (${retries} left)`);
            await new Promise(r => setTimeout(r, 300)); // pequeño delay
            return connectWithFallback(company, retries - 1);
        }
        logRed(`❌ Error al conectar a MySQL empresa ${company}: ${err.message}`);
        await crearLogRaro({
            company,
            mensaje: `Error al conectar a MySQL empresa ${company}: ${err.message}`,
            detalle: JSON.stringify(dbConfig),
            nivel: "ERROR",
        });
        throw new Error("No se pudo conectar a MySQL después de varios intentos.");
    }
}
