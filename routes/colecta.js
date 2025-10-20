import { Router } from "express";
import { colectar } from "../controller/colectaController.js";
import { buildHandlerWrapper } from "../src/funciones/build_handler_wrapper.js";
import { obtenerEstadoComparado } from "../controller/test.js";
import { probarConexionesPlanet } from "../db_test.js";

const colecta = Router();

colecta.post(
  '/colecta',
  buildHandlerWrapper({
    required: [
      "dataQr",
      "autoAssign",
      "latitude",
      "longitude",
    ],
    controller: async ({ db, req, company }) => {
      const result = await colectar(db, req, company);
      return result;
    },
  })
);


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
