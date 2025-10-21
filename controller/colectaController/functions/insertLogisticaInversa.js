import { LightdataORM } from "lightdata-tools";

export async function insertEnviosLogisticaInversa({ db, shipmentId, valor, userId }) {
    await LightdataORM.insert({
        dbConnection: db,
        table: 'envios_logisticainversa',
        data: {
            didEnvio: shipmentId,
            didCampoLogistica: 1,
            valor
        },
        quien: userId
    });
}