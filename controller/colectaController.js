import { getAccountBySenderId, getProdDbConfig } from "../db.js";
import { handleInternalFlex } from "./colectaController/handlers/flex/handleInternalFlex.js";
import { handleExternalFlex } from "./colectaController/handlers/flex/handleExternalFlex.js";
import { handleExternalNoFlex } from "./colectaController/handlers/noflex/handleExternalNoFlex.js";
import { handleInternalNoFlex } from "./colectaController/handlers/noflex/handleInternalNoFlex.js";
import mysql from "mysql";
import { logCyan, logRed, logYellow } from "../src/funciones/logsCustom.js";
import { parseIfJson } from "../src/funciones/isValidJson.js";


export async function colectar(company, dataQr, userId, profile, autoAssign, latitude, longitude) {
    const dbConfig = getProdDbConfig(company);
    const dbConnection = mysql.createConnection(dbConfig);
    dbConnection.connect();

    try {
        let response;

        dataQr = parseIfJson(dataQr);
        /// Me fijo si es flex o no
        const isFlex = dataQr.hasOwnProperty("sender_id");

        /// Si es flex
        if (isFlex) {
            logCyan("Es flex");
            /// Busco la cuenta del cliente
            const account = await getAccountBySenderId(dbConnection, company.did, dataQr.sender_id);

            /// Si la cuenta existe, es interno
            if (account) {
                logCyan("Es interno");
                response = await handleInternalFlex(dbConnection, company.did, userId, profile, dataQr, autoAssign, account, latitude, longitude);

                /// Si la cuenta no existe, es externo
            } else {
                logCyan("Es externo");
                response = await handleExternalFlex(dbConnection, company, userId, profile, dataQr, autoAssign, latitude, longitude);
            }
            /// Si no es flex
        } else {
            logCyan("No es flex");
            /// Si la empresa del QR es la misma que la empresa del usuario, es interno
            if (company.did == dataQr.empresa) {
                logCyan("Es interno");
                response = await handleInternalNoFlex(dbConnection, dataQr, company.did, userId, profile, autoAssign);

                /// Si la empresa del QR es distinta a la empresa del usuario, es externo
            } else {
                logCyan("Es externo");
                response = await handleExternalNoFlex(dbConnection, dataQr, company.did, userId, profile, autoAssign, latitude, longitude);
            }
        }

        return response;
    } catch (error) {

        logRed(`Error en colectar: ${error.stack}`);
        throw error;
    } finally {
        dbConnection.end();

    }
}
