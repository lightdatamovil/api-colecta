import { Router } from "express";
import { colectar } from "../controller/colectaController.js";
import { clientList, getCompanyById, getLocalDbConfig } from "../db.js";
import { verifyParameters } from "../src/funciones/verifyParameters.js";
import { logPurple } from "../src/funciones/logsCustom.js";
import mysql from "mysql";
import { crearLog } from "../src/funciones/crear_log.js";
import { clearClientList } from "../controller/colectaController/functions/resetCache.js";

const clear = Router();


clear.post("/clear", async (req, res) => {
    clearClientList();

    console.log(clientList);

    res.status(200).json({ message: "Cache limpiada" });
})
export default clear;
