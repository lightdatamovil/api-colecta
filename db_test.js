// prueba con base de datos de planet desde local

import { getCompanyById, getProdDbConfig } from "./db.js";
import mysql from "mysql";
import { performance } from "node:perf_hooks";
import { util } from "zod";


/**
 * Prueba “anterior” vs “nueva”.
 * - Anterior: config tal cual devuelve getProdDbConfig(company)
 * - Nueva: mismo config, pero con host/port override (por defecto 10.60.0.125:13000)
 * 
 * Variables de entorno opcionales para la "nueva":
 *   NEW_DB_HOST (default 10.60.0.125)
 *   NEW_DB_PORT (default 13000)
 *   NEW_DB_USER / NEW_DB_PASS / NEW_DB_NAME (si cambian credenciales)
// controller/planetProbe.js (ESM)
import mysql from "mysql";
import { performance } from "node:perf_hooks";
import util from "node:util";
import { getCompanyById, getProdDbConfig } from "../db.js";

/**
 * Conecta y mide tiempo de connect() con mysql (callback API + promisify)
 */
async function medirConexion(label, cfg) {
    const t0 = performance.now();
    const conn = mysql.createConnection(cfg);
    const connectAsync = util.promisify(conn.connect).bind(conn);
    const endAsync = util.promisify(conn.end).bind(conn);

    try {
        await connectAsync();                        // <-- solo conectamos
        const ms = +(performance.now() - t0).toFixed(1);
        await endAsync();                            // cerramos prolijo
        return { label, ok: true, ms, host: cfg.host, port: cfg.port };
    } catch (err) {
        const ms = +(performance.now() - t0).toFixed(1);
        try { conn.destroy(); } catch { }
        return {
            label, ok: false, ms,
            host: cfg.host, port: cfg.port,
            error: err.message, code: err.code
        };
    }
}

/**
 * Prueba "anterior" vs "nueva" (10.60.0.125[:13000]).
 * Si la nueva usa **otro puerto/credenciales**, podés pasarlos por ENV:
 *   NEW_DB_HOST, NEW_DB_PORT, NEW_DB_USER, NEW_DB_PASS, NEW_DB_NAME
 */
export async function probarConexionesPlanet() {
    // company: asegurate que este helper devuelve el objeto empresa
    const company = await getCompanyById(12);

    // Config ANTERIOR (tal como hoy)
    const cfgAnterior = getProdDbConfig(company);

    // Config NUEVA (mismo base + overrides de host/port/credenciales si aplica)
    const cfgNueva = {
        ...cfgAnterior,
        host: process.env.NEW_DB_HOST || "10.60.0.125",
        port: Number(process.env.NEW_DB_PORT || 13000),   // cambia si NO es 13000
        user: process.env.NEW_DB_USER || cfgAnterior.user,
        password: process.env.NEW_DB_PASS || cfgAnterior.password,
        database: process.env.NEW_DB_NAME || cfgAnterior.database,
    };

    const [anterior, nueva] = await Promise.all([
        medirConexion("anterior", cfgAnterior),
        medirConexion("nueva", cfgNueva),
    ]);

    return {
        inputs: {
            companyDid: 12,
            anteriorHost: cfgAnterior.host, anteriorPort: cfgAnterior.port,
            nuevaHost: cfgNueva.host, nuevaPort: cfgNueva.port,
        },
        anterior,
        nueva,
        faster: (anterior.ok && nueva.ok)
            ? (anterior.ms <= nueva.ms ? "anterior" : "nueva")
            : null,
    };
}
