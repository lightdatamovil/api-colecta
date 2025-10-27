import { assign, LightdataORM, sendShipmentStateToStateMicroserviceAPI, EstadosEnvio } from "lightdata-tools";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { informe } from "../../functions/informe.js";
import { urlAsignacionMicroservice, urlEstadosMicroservice, axiosInstance } from "../../../../db.js";

export async function handleInternalNoFlex({
    db,
    headers,
    dataQr,
    company,
    userId,
    autoAssign,
    latitude,
    longitude
}) {
    const shipmentId = dataQr.did;
    const companyId = company.did;

    const estado = await checkearEstadoEnvio({ db, shipmentId });
    if (estado) return estado;

    const [row] = await LightdataORM.select({
        dbConnection: db,
        table: 'envios',
        where: { did: shipmentId },
        select: ['choferAsignado'],
        throwIfNotExists: true
    });

    const isAlreadyAssigned = row.choferAsignado == userId;

    if (!isAlreadyAssigned && autoAssign) {
        await assign({
            headers,
            url: urlAsignacionMicroservice,
            dataQr,
            driverId: userId,
            desde: "Autoasignado de colecta",
        });
    }

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