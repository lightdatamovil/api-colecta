import { assign, LightdataORM, sendShipmentStateToStateMicroserviceAPI, EstadosEnvio } from "lightdata-tools";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { informe } from "../../functions/informe.js";
import { urlAsignacionMicroservice, urlEstadosMicroservice, axiosInstance } from "../../../../db.js";

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
    const estado = await checkearEstadoEnvio({ db, shipmentId });
    if (estado) return estado;

    /// Busco el estado del envio y el chofer asignado
    const [row] = await LightdataORM.select({
        dbConnection: db,
        table: 'envios',
        where: { did: shipmentId },
        select: ['choferAsignado'],
        throwIfNotExists: true
    });

    const isAlreadyAssigned = row.choferAsignado == userId;

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
    await sendShipmentStateToStateMicroserviceAPI({
        urlEstadosMicroservice,
        axiosInstance,
        company,
        userId,
        shipmentId,
        estado: EstadosEnvio.value(EstadosEnvio.collected, companyId),
        latitude,
        longitude,
        desde: "Colecta App",
    });

    const body = await informe({
        db,
        company,
        clientId: dataQr.cliente,
        userId
    });

    return {
        success: true,
        message: "Paquete colectado correctamente",
        body
    };
}