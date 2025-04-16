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
const body = req.body;
    const { companyId, userId, profile, dataQr, autoAssign } = req.body;


    const company = await getCompanyById(companyId);
    
    console.log("hoila");
    
    try {
        const endTime = performance.now();
        const tiempo = endTime - startTime;
        const result = await colectar(company, dataQr, userId, profile, autoAssign,dbConnectionLocal);
        crearLog(dbConnectionLocal, company.did, userId, body.profile, body, tiempo, JSON.stringify(result), "api", true);

        res.status(200).json(result);
    } catch (error) {
        const endTime = performance.now();
        const tiempo = endTime - startTime;
    
      
        
        crearLog(dbConnectionLocal, company.did, userId, body.profile, body, tiempo, JSON.stringify(error), "api", false);

        res.status(500).json({ message: error.message });
    } finally {
        const endTime = performance.now();
        logPurple(`Tiempo de ejecución: ${endTime - startTime} ms`);
    }
});

export default colecta;