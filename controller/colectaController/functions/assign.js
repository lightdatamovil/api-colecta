import axios from 'axios';
import { logGreen, logRed } from '../../../src/funciones/logsCustom.js';

export async function assign(companyId, userId, profile, dataQr, driverId, deviceFrom) {

    const payload = {
        companyId: Number(companyId),
        userId: userId,
        profile: profile,
        appVersion: "null",
        brand: "null",
        model: "null",
        androidVersion: "null",
        deviceId: "null",
        dataQr: dataQr,
        driverId: driverId,
        deviceFrom: deviceFrom
    };

    // console.log("[assign] payload:", JSON.stringify(payload));
    try {
        const result = await axios.post('https://asignaciones.lightdata.app/api/asignaciones/asignar', payload);
        if (result.status == 200) {
            logGreen("Asignado correctamente");
        }
    } catch (err) {
        logRed("Error al asignar");
        //  debugHttpError(err, "assign");
        throw new Error("Error al asignar");

    }
}


export function debugHttpError(err, ctx = "http") {
    const status = err.response?.status;
    const statusText = err.response?.statusText;
    const body = err.response?.data;

    console.error(`[${ctx}] AxiosError ${status ?? "(sin status)"} ${statusText ?? ""}`.trim());
    if (body !== undefined) {
        console.error(`[${ctx}] body:`, typeof body === "string" ? body : JSON.stringify(body));
    }
    console.error(`[${ctx}] message:`, err.message);

}