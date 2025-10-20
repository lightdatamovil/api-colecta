import express, { json, urlencoded } from 'express';
import cors from 'cors';
import { conectarMySQLip, conectarMySQLUrl } from './pruebaChris';
import { obtenerEstadoComparado } from './test';
import { probarConexionesPlanet } from './db_test';
import { getAllActiveLocal } from './dbList';
const app = express();

app.use(json({ limit: '50mb' }));
app.use(urlencoded({ limit: '50mb', extended: true }));
app.use(json());
app.use(cors());
app.get('/active-db', (req, res) => {
    try {
        res.status(200).json(getAllActiveLocal());
    } catch (e) {
        res.status(500).json({ error: `No se pudo obtener el estado local: ${e.message}` });
    }
});
app.get('/db-url', async (_req, res) => {
    const result = await conectarMySQLUrl();
    res.status(result.ok ? 200 : 500).json({ when: new Date().toISOString(), result });
});

// GET #2 — IP
app.get('/db-ip', async (_req, res) => {
    const result = await conectarMySQLip();
    res.status(result.ok ? 200 : 500).json({ when: new Date().toISOString(), result });
});
app.get("/test", async (_req, res) => {
    try {
        const { data, status } = await obtenerEstadoComparado();
        res.status(status).json(data);
    } catch (e) {
        res.status(e.status || 502).json({
            ok: false,
            error: "No se pudo obtener el estado",
            detalle: e.message,
        });
    }
});


app.get("/dbconection", async (_req, res) => {
    try {
        const { data, status } = await probarConexionesPlanet();
        res.status(status).json(data);
    } catch (e) {
        res.status(e.status || 502).json({
            ok: false,
            error: "No se pudo obtener el estado",
            detalle: e.message,
        });
    }
});