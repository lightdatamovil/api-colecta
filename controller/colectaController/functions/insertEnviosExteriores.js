import { executeQuery } from "../../../db.js";

export async function insertEnviosExteriores(dbConnection, internoShipmentId, externalShipmentId, flex, externalName, externalCompanyId) {
    const queryInsertEnviosExteriores = `
            INSERT INTO envios_exteriores (didLocal, didExterno, flex, cliente, didEmpresa)
            VALUES (?, ?, ?, ?, ?)
        `;

    const result = await executeQuery(
        dbConnection,
        queryInsertEnviosExteriores,
        [
            internoShipmentId,
            externalShipmentId,
            flex,
            externalName,
            externalCompanyId,
        ],
    );

    return result.insertId;
}