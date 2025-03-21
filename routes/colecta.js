import { Router } from 'express';
import { colectar } from '../controller/colectaController.js';
import { getCompanyById, getLocalDbConfig } from '../db.js';
import { verifyParameters } from '../src/funciones/verifyParameters.js';
import { logPurple } from '../src/funciones/logsCustom.js';
import mysql from "mysql";
import { crearLog } from '../src/funciones/crear_log.js';

const colecta = Router();
const dbConfigLocal = getLocalDbConfig();
const dbConnectionLocal = mysql.createConnection(dbConfigLocal);
dbConnectionLocal.connect();

colecta.post('/colecta', async (req, res) => {
    const startTime = performance.now();
    const errorMessage = verifyParameters(req.body, ['dataQr', 'autoAssign', 'deviceFrom']);

    if (errorMessage) {
        const endTime = performance.now();
        logPurple(`Tiempo de ejecución: ${endTime - startTime} ms`);
        return res.status(400).json({ message: errorMessage });
    }

    const { companyId, userId, profile, dataQr, autoAssign } = req.body;

    try {
        const company = await getCompanyById(companyId);

        const result = await colectar(company, JSON.parse(dataQr), userId, profile, autoAssign,dbConnectionLocal);
crearLog(companyId,userId,dataQr.did, "colecta", req.body,userId,dbConnectionLocal);
        res.status(200).json(result);
    } catch (error) {
        crearLog(companyId,userId,dataQr.did || 0, "colecta2", { estadoRespuesta: false, mensaje: error.message },userId,dbConnectionLocal);
        res.status(500).json({ message: error.message });
    } finally {
        const endTime = performance.now();
        logPurple(`Tiempo de ejecución: ${endTime - startTime} ms`);
    }
});

export default colecta;