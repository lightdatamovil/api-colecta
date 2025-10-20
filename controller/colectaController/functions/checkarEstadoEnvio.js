import { LightdataORM } from "lightdata-tools";

/// Checkea si el envio ya fue colectado, entregado o cancelado
export async function checkearEstadoEnvio({ dbConnection, shipmentId }) {
    const [estado] = await LightdataORM.select({
        dbConnection, table: 'envios',
        where: { did: shipmentId },
        select: ['estado_envio'],
    });

    if (estado.length > 0) {
        if (estado[0].estado_envio == 5 || estado[0].estado_envio == 9 || estado[0].estado_envio == 8) {
            return { success: false, message: "El paquete ya fue entregado o cancelado" };
        }

        if (estado[0].estado_envio == 0) {
            return { success: false, message: "El paquete ya se encuentra colectado" };
        }
    }
}