import { Router } from "express";
import { clientList } from "../db.js";
import { clearClientList } from "../controller/colectaController/functions/resetCache.js";

const clear = Router();


clear.post("/clear", async (req, res) => {
    clearClientList();

    console.log(clientList);

    res.status(200).json({ message: "Cache limpiada" });
})
export default clear;
