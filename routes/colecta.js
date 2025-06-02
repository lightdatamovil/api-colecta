import { Router } from "express";
import { colectar } from "../controller/colectaController.js";
import { getCompanyById, getLocalDbConfig } from "../db.js";
import { verifyParameters } from "../src/funciones/verifyParameters.js";
import { logPurple } from "../src/funciones/logsCustom.js";
import mysql from "mysql";
import { crearLog } from "../src/funciones/crear_log.js";

const colecta = Router();
const dbConfigLocal = getLocalDbConfig();
const dbConnectionLocal = mysql.createConnection(dbConfigLocal);
dbConnectionLocal.connect();

colecta.post("/colecta", async (req, res) => {
  const startTime = performance.now();
  const errorMessage = verifyParameters(req.body, [
    "dataQr",
    "autoAssign",
    "ilat",
    "ilong"
  ]);

  if (errorMessage) {
    const endTime = performance.now();
    logPurple(`Tiempo de ejecución: ${endTime - startTime} ms`);
    return res.status(400).json({ message: errorMessage });
  }

  const body = req.body;
  const { companyId, userId, profile, dataQr, autoAssign, ilat, ilong } = req.body;

  try {
    const company = await getCompanyById(companyId);

    const result = await colectar(
      company,
      dataQr,
      userId,
      profile,
      autoAssign,
      ilat,
      ilong
    );
    const endTime = performance.now();
    crearLog(
      dbConnectionLocal,
      companyId,
      userId,
      profile || 0,
      body,
      endTime - startTime,
      result,
      "api",
      true
    );
    res.status(200).json(result);
  } catch (error) {
    const endTime = performance.now();
    crearLog(
      dbConnectionLocal,
      companyId,
      userId,
      profile || 0,
      body,
      endTime - startTime,
      error.stack || error.message,
      "api",
      false
    );
    res.status(500).json({ message: error.message });
  } finally {
    const endTime = performance.now();

    logPurple(`Tiempo de ejecución: ${endTime - startTime} ms`);
  }
});

export default colecta;
