import { Router } from "express";
import { colectar } from "../controller/colectaController.js";
import { buildHandlerWrapper } from "../src/funciones/build_handler_wrapper.js";

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
    controller: async ({ db, req, company }) => await colectar({ db, req, company })
  })
);

export default colecta;
