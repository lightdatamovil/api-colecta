import { Router } from "express";
import { errorHandler, getProductionDbConfig, logPurple, Status, verifyAll, verifyToken, verifyHeaders } from "lightdata-tools";
import mysql2 from "mysql2";
import { companiesService, hostProductionDb, portProductionDb } from "../db.js";
import { Constants } from "../src/funciones/constans.js";
import { colectar } from "../controller/colectaController.js";
import { crearLog } from "../src/funciones/crear_log.js";

const colecta = Router();

colecta.post("/colecta", verifyToken, async (req, res) => {
    const startTime = performance.now();

    let dbConnection;

    try {
        verifyAll(req, [], ["dataQr", "latitude", "longitude", "autoAssign"]);
        verifyHeaders(req, Constants.headers);

        const companyId = req.headers['x-company-id'];

        const company = await companiesService.getById(companyId);

        const dbConfig = getProductionDbConfig(company, hostProductionDb, portProductionDb);
        dbConnection = mysql2.createConnection(dbConfig);
        dbConnection.connect();
        logPurple(`Conexión a la base de datos establecida para la empresa: ${companyId}`);

        const result = await colectar(dbConnection, req, company);

        crearLog(req, performance.now() - startTime, result, "api", true);

        res.status(Status.ok).json(result);
    } catch (error) {
        errorHandler(req, res, error);
    } finally {
        logPurple(`Tiempo de ejecución: ${performance.now() - startTime} ms`);
        if (dbConnection) dbConnection.end();
    }
});

export default colecta;
