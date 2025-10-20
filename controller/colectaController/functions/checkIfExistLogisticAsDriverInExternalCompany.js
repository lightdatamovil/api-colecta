import { LightdataORM } from "lightdata-tools";

export async function checkIfExistLogisticAsDriverInExternalCompany({ dbConnection, syncCode }) {

    const [chofer] = await LightdataORM.select({
        dbConnection,
        table: 'sistema_usuarios_accesos',
        where: { codvinculacion: syncCode },
        select: ['usuario'],
    });

    if (!chofer || chofer.length === 0) {
        return;
    }

    return chofer.usuario;
}