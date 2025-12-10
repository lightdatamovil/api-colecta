import CustomException from '../../../classes/custom_exception.js';
import { urlMicroserviciosAsignaciones } from '../../../db.js';
import { sendToService } from '../../../src/funciones/sendToService.js';

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

    try {
        await sendToService(urlMicroserviciosAsignaciones, payload);
    } catch (err) {
        throw new CustomException({
            title: "Error al asignar conductor",
            message: `Error al asignar conductor ${err.message}`,
        });
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