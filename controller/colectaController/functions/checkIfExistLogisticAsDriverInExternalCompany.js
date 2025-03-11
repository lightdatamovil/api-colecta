export async function checkIfExistLogisticAsDriverInExternalCompany(dbConnection, syncCode) {
    try {
        const querySelectSistemUsuariosAccesos = 'SELECT usuario FROM sistema_usuarios_accesos WHERE codvinculacion = ?';
        const chofer = await executeQuery(dbConnection, querySelectSistemUsuariosAccesos, [syncCode]);

        if (chofer.length == 0) {
            return;
        }

        return chofer[0].usuario;
    } catch (error) {
        console.error("Error en checkIfExistLogisticAsDriverInExternalShipments:", error);
        throw error;
    }
}