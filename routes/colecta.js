import { Router } from "express";
import { colectar } from "../controller/colectaController.js";
import { buildHandler } from "./_handler.js";

const colecta = Router();
colecta.get(
  '/aplanta',
  buildHandler({
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
