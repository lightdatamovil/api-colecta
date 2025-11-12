import { Router } from "express";
import { colectar } from "../controller/colectaController.js";
import { getCompanyById } from "../db.js";
import { verifyParameters } from "../src/funciones/verifyParameters.js";
import { logPurple } from "../src/funciones/logsCustom.js";
import { crearLog } from "../src/funciones/crear_log.js";
import { obtenerEstadoComparado } from "../controller/test.js";
import { probarConexionesPlanet } from "../db_test.js";


const colecta = Router();

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
    console.log("Company ID:", companyId);
    const company = await getCompanyById(companyId);
    console.log("Company Data:", company);
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


colecta.get("/test", async (_req, res) => {
  try {
    const { data, status } = await obtenerEstadoComparado();
    res.status(status).json(data);        // o res.status(200).json(data) si querés forzar 200
  } catch (e) {
    res.status(e.status || 502).json({
      ok: false,
      error: "No se pudo obtener el estado",
      detalle: e.message,
    });
  }
});


colecta.get("/dbconection", async (_req, res) => {
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

export default colecta;
