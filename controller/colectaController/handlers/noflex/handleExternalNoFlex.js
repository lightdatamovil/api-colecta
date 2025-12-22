import { executeQuery, getClientsByCompany, getCompanyById } from "../../../../db.js";
import { assign } from "../../functions/assign.js";
import { insertEnvios } from "../../functions/insertEnvios.js";
import { insertEnviosExteriores } from "../../functions/insertEnviosExteriores.js";
import { checkIfExistLogisticAsDriverInExternalCompany } from "../../functions/checkIfExistLogisticAsDriverInExternalCompany.js";
import { informe } from "../../functions/informe.js";
import { insertEnviosLogisticaInversa } from "../../functions/insertLogisticaInversa.js";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { connectWithFallback } from "../../../../src/funciones/connectWithFallback.js";
import { changeState } from "../../functions/changeState.js";

/// Esta funcion se conecta a la base de datos de la empresa externa
/// Checkea si el envio ya fue colectado, entregado o cancelado
/// Busca el chofer que se crea en la vinculacion de logisticas
/// Con ese chofer inserto en envios y envios exteriores de la empresa interna
/// Asigno a la empresa externa
/// Si es autoasignacion, asigno a la empresa interna
/// Actualizo el estado del envio a colectado y envio el estado del envio en los microservicios
export async function handleExternalNoFlex(dbConnection, dataQr, company, userId, profile, autoAssign, latitude, longitude) {
    let ingresado
    const companyId = company.did;
    const shipmentIdFromDataQr = dataQr.did;
    const clientIdFromDataQr = dataQr.cliente;

    /// Busco la empresa externa
    const externalCompany = await getCompanyById(dataQr.empresa);

    /// Conecto a la base de datos de la empresa externa
    const externalDbConnection = await connectWithFallback(externalCompany);

    const companyClientList = await getClientsByCompany(externalDbConnection, externalCompany.did);

    const client = companyClientList[clientIdFromDataQr];

    const internalCompany = await getCompanyById(companyId);

    /// Busco el chofer que se crea en la vinculacion de logisticas
    const driver = await checkIfExistLogisticAsDriverInExternalCompany(externalDbConnection, internalCompany.codigo);

    if (!driver) {
        externalDbConnection.end();

        return { success: false, message: "No se encontró chofer asignado" };
    }

    const queryClient = `SELECT did  FROM clientes WHERE codigoVinculacionLogE = ?`;
    const externalClient = await executeQuery(dbConnection, queryClient, [externalCompany.codigo]);

    let internalShipmentId;
    const consulta = 'SELECT didLocal FROM envios_exteriores WHERE didExterno = ? and didEmpresa = ? and superado = 0 and elim = 0 LIMIT 1';
    internalShipmentId = await executeQuery(dbConnection, consulta, [shipmentIdFromDataQr, externalCompany.did]);

    if (internalShipmentId.length > 0 && internalShipmentId[0]?.didLocal) {
        internalShipmentId = internalShipmentId[0].didLocal;

        /// Chequeo si el envio ya fue colectado, entregado o cancelado
        const check = await checkearEstadoEnvio(dbConnection, internalShipmentId);
        if (check) {
            externalDbConnection.end();

            return check;
        }

    } else {
        internalShipmentId = await insertEnvios(
            dbConnection,
            companyId,
            externalClient[0].did,
            0,
            { id: "", sender_id: "" },
            0,
            1,
            userId
        );

        /// Inserto en envios exteriores en la empresa interna
        await insertEnviosExteriores(
            dbConnection,
            internalShipmentId,
            shipmentIdFromDataQr,
            0,
            client.nombre || "",
            externalCompany.did,
        );
        ingresado = true;
    }
    const check2 = "SELECT valor FROM envios_logisticainversa WHERE didEnvio = ?";

    const rows = await executeQuery(
        externalDbConnection,
        check2,
        [shipmentIdFromDataQr],
    );
    if (rows.length > 0) {
        await insertEnviosLogisticaInversa(
            dbConnection,
            internalShipmentId,
            rows[0].valor,
            userId,
        );
    }
    // Asigno a la empresa externa
    await assign(dataQr.empresa, userId, profile, dataQr, driver, "Autoasignado de colecta");

    if (autoAssign) {
        const dqr = {
            interno: dataQr.interno,
            did: internalShipmentId,
            cliente: clientIdFromDataQr,
            empresa: companyId,
        };

        // Asigno a la empresa interna
        await assign(companyId, userId, profile, dqr, userId, "Autoasignado de colecta");
    }

    await changeState(companyId, userId, internalShipmentId, latitude, longitude, dbConnection);

    await changeState(dataQr.empresa, driver, shipmentIdFromDataQr, latitude, longitude, externalDbConnection);

    const body = await informe(dbConnection, company, externalClient[0].did, userId, internalShipmentId);

    externalDbConnection.end();

    return { success: true, message: `Paquete ${ingresado ? "ingresado y" : ""} colectado con éxito`, body: body };
}
