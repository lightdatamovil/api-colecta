import { assign, executeQuery, logCyan, sendShipmentStateToStateMicroserviceAPI } from "lightdata-tools";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { informe } from "../../functions/informe.js";
import { urlEstadosMicroservice } from "../../../../db.js";

/// Esta funcion checkea si el envio ya fue colectado, entregado o cancelado
/// Busca el chofer asignado al envio
/// Si el envio no esta asignado y se quiere autoasignar, lo asigna
/// Actualiza el estado del envio en el micro servicio
/// Actualiza el estado del envio en la base de datos
export async function handleInternalNoFlex(dbConnection, dataQr, company, userId, profile, autoAssign, latitude, longitude) {
    const shipmentId = dataQr.did;
    const companyId = company.did;

    /// Chequeo si el envio ya fue colectado, entregado o cancelado
    const check = await checkearEstadoEnvio(dbConnection, shipmentId);
    if (check) {
        return check;
    }

    logCyan("El envio no fue colectado, entregado o cancelado");

    /// Busco el estado del envio y el chofer asignado
    const querySelectEnvios = `SELECT choferAsignado FROM envios WHERE superado = 0 AND elim = 0 AND did = ? LIMIT 1`;
    const resultChoferAsignado = await executeQuery(dbConnection, querySelectEnvios, [shipmentId]);

    /// Si no encuentro el envio mando error
    if (resultChoferAsignado.length === 0) {
        return { success: false, message: "Paquete no encontrado" };
    }

    logCyan("Se encontro el chofer asignado");

    const isAlreadyAssigned = resultChoferAsignado[0].choferAsignado == userId;

    /// Si el envio no esta asignado y se quiere autoasignar, lo asigno
    if (!isAlreadyAssigned && autoAssign) {
        await assign(companyId, userId, profile, dataQr, userId, "Autoasignado de colecta");
        logCyan("Se asigno el envio");
    }

    /// Actualizamos el estado del envio en el micro servicio
    await sendShipmentStateToStateMicroserviceAPI(urlEstadosMicroservice, company, userId, shipmentId, 0, latitude, longitude);
    logCyan("Se actualizo el estado del envio en el micro servicio");

    const body = await informe(dbConnection, company, dataQr.cliente, userId, shipmentId);

    return { success: true, message: "Paquete colectado correctamente", body: body };
}