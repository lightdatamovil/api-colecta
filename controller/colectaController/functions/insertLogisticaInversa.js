import { LightdataORM } from "lightdata-tools";

export async function insertEnviosLogisticaInversa({ dbConnection, shipmentId, valor, userId }) {
    await LightdataORM.insert({
        dbConnection,
        table: 'envios_logisticainversa',
        data: {
            didEnvio: shipmentId,
            didCampoLogistica: 1,
            valor
        },
        quien: userId
    });
}