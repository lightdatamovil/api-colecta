import { assign, executeQuery, sendShipmentStateToStateMicroserviceAPI } from "lightdata-tools";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { informe } from "../../functions/informe.js";
import { urlAsignacionMicroservice, urlEstadosMicroservice } from "../../../../db.js";

/// Esta funcion checkea si el envio ya fue colectado, entregado o cancelado
/// Busca el chofer asignado al envio
/// Si el envio no esta asignado y se quiere autoasignar, lo asigna
/// Actualiza el estado del envio en el micro servicio
/// Actualiza el estado del envio en la base de datos
export async function handleInternalNoFlex({
    db,
    dataQr,
    company,
    userId,
    profile,
    autoAssign,
    latitude,
    longitude
}) {
    const shipmentId = dataQr.did;
    const companyId = company.did;

    /// Chequeo si el envio ya fue colectado, entregado o cancelado
    const check = await checkearEstadoEnvio(db, shipmentId);
    if (check) {
        return check;
    }

    /// Busco el estado del envio y el chofer asignado
    const querySelectEnvios = `SELECT choferAsignado FROM envios WHERE superado = 0 AND elim = 0 AND did = ? LIMIT 1`;
    const resultChoferAsignado = await executeQuery({ dbConnection: db, query: querySelectEnvios, values: [shipmentId] });

    /// Si no encuentro el envio mando error
    if (resultChoferAsignado.length === 0) {
        return { success: false, message: "Paquete no encontrado" };
    }

    const isAlreadyAssigned = resultChoferAsignado[0].choferAsignado == userId;

    /// Si el envio no esta asignado y se quiere autoasignar, lo asigno
    if (!isAlreadyAssigned && autoAssign) {
        await assign({
            url: urlAsignacionMicroservice,
            companyId,
            userId,
            profile,
            dataQr,
            deviceFrom: "Autoasignado de colecta",
        });
    }

    /// Actualizamos el estado del envio en el micro servicio
    await sendShipmentStateToStateMicroserviceAPI(urlEstadosMicroservice, company, userId, shipmentId, 0, latitude, longitude);

    const body = await informe(db, company, dataQr.cliente, userId, shipmentId);

    return { success: true, message: "Paquete colectado correctamente", body: body };
}