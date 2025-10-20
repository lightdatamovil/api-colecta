import mysql from "mysql";
import { insertEnvios } from "../../functions/insertEnvios.js";
import { insertEnviosExteriores } from "../../functions/insertEnviosExteriores.js";
import { checkIfExistLogisticAsDriverInExternalCompany } from "../../functions/checkIfExistLogisticAsDriverInExternalCompany.js";
import { informe } from "../../functions/informe.js";
import { insertEnviosLogisticaInversa } from "../../functions/insertLogisticaInversa.js";
import { companiesService, urlEstadosMicroservice } from "../../../../db.js";
import { assign, executeQuery, getProductionDbConfig, sendShipmentStateToStateMicroserviceAPI } from "lightdata-tools";

/// Esta funcion se conecta a la base de datos de la empresa externa
/// Checkea si el envio ya fue colectado, entregado o cancelado
/// Busca el chofer que se crea en la vinculacion de logisticas
/// Con ese chofer inserto en envios y envios exteriores de la empresa interna
/// Asigno a la empresa externa
/// Si es autoasignacion, asigno a la empresa interna
/// Actualizo el estado del envio a colectado y envio el estado del envio en los microservicios
export async function handleExternalNoFlex({
    db,
    dataQr,
    company,
    userId,
    profile,
    autoAssign,
    latitude,
    longitude,
}) {
    const companyId = company.did;
    const shipmentIdFromDataQr = dataQr.did;
    const clientIdFromDataQr = dataQr.cliente;

    /// Busco la empresa externa
    const externalCompany = await companiesService.getCompanyById(dataQr.empresa);

    /// Conecto a la base de datos de la empresa externa
    const dbConfigExt = getProductionDbConfig(externalCompany);
    const externalDbConnection = mysql.createConnection(dbConfigExt);
    externalDbConnection.connect();

    /// Chequeo si el envio ya fue colectado, entregado o cancelado
    //! Se comento porque si el paquete estaba colectado en la empresa que da el paquete, no se podia ingresar en la que se lo recibe
    // const check = await checkearEstadoEnvio(externalDbConnection, shipmentIdFromDataQr);
    // if (check) {
    //     externalDbConnection.end();

    //     return check;
    // }

    const companyClientList = await companiesService.getClientsByCompany(externalDbConnection, externalCompany.did);

    const client = companyClientList[clientIdFromDataQr];

    const internalCompany = await companiesService.getCompanyById(companyId);

    /// Busco el chofer que se crea en la vinculacion de logisticas
    const driver = await checkIfExistLogisticAsDriverInExternalCompany(externalDbConnection, internalCompany.codigo);

    if (!driver) {
        externalDbConnection.end();

        return { success: false, message: "No se encontró chofer asignado" };
    }

    const queryClient = `SELECT did  FROM clientes WHERE codigoVinculacionLogE = ?`;
    const externalClient = await executeQuery({ dbConnection: db, query: queryClient, values: [externalCompany.codigo] });
    let internalShipmentId;

    const consulta = 'SELECT didLocal FROM envios_exteriores WHERE didExterno = ? and superado = 0 and elim = 0 LIMIT 1';

    internalShipmentId = await executeQuery({ dbConnection: db, query: consulta, values: [shipmentIdFromDataQr] });

    if (internalShipmentId.length > 0 && internalShipmentId[0]?.didLocal) {

        internalShipmentId = internalShipmentId[0].didLocal;
    } else {

        internalShipmentId = await insertEnvios({
            company,
            clientId: externalClient[0].did,
            accountId: 0,
            dataQr: { id: "", sender_id: "" },
            externo: 1,
            flex: 0,
            userId
        });
    }


    /// Inserto en envios exteriores en la empresa interna
    await insertEnviosExteriores(
        db,
        internalShipmentId,
        shipmentIdFromDataQr,
        0,
        client.nombre || "",
        externalCompany.did,
    );

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

    const check2 = "SELECT valor FROM envios_logisticainversa WHERE didEnvio = ?";

    const rows = await executeQuery({
        dbConnection: externalDbConnection,
        query: check2,
        values: [shipmentIdFromDataQr]
    });
    if (rows.length > 0) {
        await insertEnviosLogisticaInversa(
            db,
            internalShipmentId,
            rows[0].valor,
            userId,
        );
    }

    await sendShipmentStateToStateMicroserviceAPI(urlEstadosMicroservice, company, userId, internalShipmentId, 0, latitude, longitude);

    const dataQrCompany = await companiesService.getCompanyById(dataQr.empresa);
    await sendShipmentStateToStateMicroserviceAPI(urlEstadosMicroservice, dataQrCompany, driver, shipmentIdFromDataQr, 0, latitude, longitude);

    const body = await informe({ db, company, clientId: externalClient[0].did, userId });

    externalDbConnection.end();

    return { success: true, message: "Paquete colectado con exito", body };
}
