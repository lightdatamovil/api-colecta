import { executeQuery } from "../../../../db.js";
import { assign } from "../../functions/assign.js";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { sendToShipmentStateMicroService } from "../../functions/sendToShipmentStateMicroService.js";
import { updateLastShipmentState } from "../../functions/updateLastShipmentState.js";
import { informe } from "../../functions/informe.js";
import { logCyan, logRed } from "../../../../src/funciones/logsCustom.js";
import { crearLog } from "../../../../src/funciones/crear_log.js";


/// Esta funcion checkea si el envio ya fue colectado, entregado o cancelado
/// Busca el chofer asignado al envio
/// Si el envio no esta asignado y se quiere autoasignar, lo asigna
/// Actualiza el estado del envio en el micro servicio
/// Actualiza el estado del envio en la base de datos
export async function handleInternalNoFlex(dbConnection, dataQr, companyId, userId, profile, autoAssign,dbConnectionLocal) {
    try {
        const shipmentId = dataQr.did;

        /// Chequeo si el envio ya fue colectado, entregado o cancelado
        const check = await checkearEstadoEnvio(dbConnection, shipmentId);
        if (check) {
crearLog(companyId,userId,dataQr.did, "colecta", { estadoRespuesta: false, mensaje: "El envio ya fue colectado, entregado o cancelado" },userId,dbConnectionLocal);
            return check;

        }

        logCyan("El envio no fue colectado, entregado o cancelado");

        /// Busco el estado del envio y el chofer asignado
        const querySelectEnvios = `SELECT choferAsignado FROM envios WHERE superado = 0 AND elim = 0 AND did = ? LIMIT 1`;
        const resultChoferAsignado = await executeQuery(dbConnection, querySelectEnvios, [shipmentId]);

        /// Si no encuentro el envio mando error
        if (resultChoferAsignado.length === 0) {
            crearLog(companyId,userId,dataQr.did, "colecta", { estadoRespuesta: false, mensaje: "Paquete no encontrado" },userId,dbConnectionLocal);
            return { estadoRespuesta: false, mensaje: "Paquete no encontrado" };
        }
        logCyan("Se encontro el chofer asignado");

        const isAlreadyAssigned = resultChoferAsignado[0].choferAsignado == userId;
        /// Si el envio no esta asignado y se quiere autoasignar, lo asigno
        if (!isAlreadyAssigned && autoAssign) {
            await assign(companyId, userId, profile, dataQr, userId);
            logCyan("Se asigno el envio");
        }

        /// Actualizamos el estado del envio en el micro servicio
        await sendToShipmentStateMicroService(companyId, userId, shipmentId);
        logCyan("Se actualizo el estado del envio en el micro servicio");

      

        const body = await informe(dbConnection, companyId, dataQr.cliente, userId, shipmentId);
        crearLog(companyId,userId,dataQr.did, "colecta", {estadoRespuesta: true, mensaje: "Paquete colectado correctamente", body: body},userId,dbConnectionLocal);
        return { estadoRespuesta: true, mensaje: "Paquete colectado correctamente", body: body };
    } catch (error) {
        crearLog(companyId,userId,dataQr.did, "colecta", error.stack,userId,dbConnectionLocal);
        logRed(`Error en handleInternalNoFlex: ${error.stack}`);
        throw error;
    } 
}