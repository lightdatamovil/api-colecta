import { executeQuery } from "lightdata-tools";




export async function fsetestadoMasivoDesde({ dbConnection, shipmentIds, deviceFrom, dateConHora, userId, onTheWayState }) {

    const query1 = `
            UPDATE envios_historial
            SET superado = 1
            WHERE superado = 0 AND didEnvio IN(${shipmentIds.join(',')})
        `;
    await executeQuery(dbConnection, query1);

    const query2 = `
            UPDATE envios
            SET estado_envio = ?
            WHERE superado = 0 AND did IN(${shipmentIds.join(',')})
        `;
    await executeQuery(dbConnection, query2, [onTheWayState]);

    const query3 = `
            INSERT INTO envios_historial (didEnvio, estado, quien, fecha, didCadete, desde)
            SELECT did, ?, ?, ?, choferAsignado, ?
            FROM envios WHERE did IN(${shipmentIds.join(',')})
        `;
    await executeQuery(dbConnection, query3, [onTheWayState, userId, dateConHora, deviceFrom]);


}