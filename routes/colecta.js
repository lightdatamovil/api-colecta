import { Router } from "express";
import { colectar } from "../controller/colectaController.js";
import { buildHandlerWrapper } from "../src/funciones/build_handler_wrapper.js";

const colecta = Router();
colecta.get(
  '/aplanta',
  buildHandlerWrapper({
    required: [
      "dataQr",
      "autoAssign",
      "ilat",
      "ilong",
    ],
    controller: async ({ db, req, company }) => {
      const result = await colectar(db, req, company);
      return result;
    },
  })
);

export default colecta;
