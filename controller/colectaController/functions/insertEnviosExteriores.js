import { LightdataORM } from "lightdata-tools";

export async function insertEnviosExteriores({ dbConnection, internoShipmentId, externalShipmentId, flex, externalName, externalCompanyId }) {
    const result = await LightdataORM.upsert({
        dbConnection,
        table: 'envios_exteriores',
        data: {
            didLocal: internoShipmentId,
            didExterno: externalShipmentId,
            flex,
            cliente: externalName,
            didEmpresa: externalCompanyId,
        },
        where: { didExterno: externalShipmentId },
    });

    return result.insertId;
}