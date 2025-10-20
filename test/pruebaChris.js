// db.js
import mysql from 'mysql2/promise';

export async function conectarMySQLUrl() {
    let conn;
    const out = { host: 'bhsmysql1.lightdata.com.ar', connectMs: null, queryMs: null, serverTime: null, ok: false, error: null };
    try {
        const t0 = Date.now();
        conn = await mysql.createConnection({
            host: 'bhsmysql1.lightdata.com.ar',
            port: 3306,
            user: 'lightdat_uplanet',
            password: 'uplanet123456*',
            database: 'lightdat_tt_planet',
            connectTimeout: 5000,
        });
        out.connectMs = Date.now() - t0;

        const t1 = Date.now();
        const [rows] = await conn.execute('SELECT NOW() AS tiempo');
        out.queryMs = Date.now() - t1;
        out.serverTime = rows?.[0]?.tiempo ?? null;

        out.ok = true;
        return out;
    } catch (err) {
        out.error = err?.message ?? String(err);
        return out;
    } finally {
        if (conn) { try { await conn.end(); } catch { } }
    }
}

export async function conectarMySQLip() {
    let conn;
    const out = { host: '10.60.0.125', connectMs: null, queryMs: null, serverTime: null, ok: false, error: null };
    try {
        const t0 = Date.now();
        conn = await mysql.createConnection({
            host: '10.60.0.125',
            port: 3306,
            user: 'lightdat_uplanet',
            password: 'uplanet123456*',
            database: 'lightdat_tt_planet',
            connectTimeout: 5000,
        });
        out.connectMs = Date.now() - t0;

        const t1 = Date.now();
        const [rows] = await conn.execute('SELECT NOW() AS tiempo');
        out.queryMs = Date.now() - t1;
        out.serverTime = rows?.[0]?.tiempo ?? null;

        out.ok = true;
        return out;
    } catch (err) {
        out.error = err?.message ?? String(err);
        return out;
    } finally {
        if (conn) { try { await conn.end(); } catch { } }
    }
}
