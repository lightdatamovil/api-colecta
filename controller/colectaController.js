import { executeQuery, getAccountBySenderId, getProdDbConfig } from "../db.js";
import { handleInternalFlex } from "./colectaController/handlers/flex/handleInternalFlex.js";
import { handleExternalFlex } from "./colectaController/handlers/flex/handleExternalFlex.js";
import { handleExternalNoFlex } from "./colectaController/handlers/noflex/handleExternalNoFlex.js";
import { handleInternalNoFlex } from "./colectaController/handlers/noflex/handleInternalNoFlex.js";
import mysql from "mysql";
import { logCyan, logRed } from "../src/funciones/logsCustom.js";
import { parseIfJson } from "../src/funciones/isValidJson.js";
import axios from "axios";
import LogisticaConf from "../classes/logisticas_conf.js";

async function getShipmentIdFromQr(companyId, dataQr) {
    const payload = {
        companyId: Number(companyId),
        userId: 0,
        profile: 0,
        deviceId: "null",
        brand: "null",
        model: "null",
        androidVersion: "null",
        deviceFrom: "getShipmentIdFromQr de Colecta",
        appVersion: "null",
        dataQr: dataQr
    };

    try {
        const result = await axios.post('https://apimovil2.lightdata.app/api/qr/get-shipment-id', payload);
        if (result.status == 200) {
            return result.data.body;
        } else {
            logRed("Error al obtener el shipmentId");
            throw new Error("Error al obtener el shipmentId");
        }
    } catch (error) {
        logRed(`Error al obtener el shipmentId: ${error.message}`);
        throw new Error("Error al obtener el shipmentId");
    }

}


export async function colectar(company, dataQr, userId, profile, autoAssign, latitude, longitude) {
    const dbConfig = getProdDbConfig(company);
    const dbConnection = mysql.createConnection(dbConfig);
    dbConnection.connect();

    try {
        let response;
        dataQr = parseIfJson(dataQr);
        //es barcode
        if (
            LogisticaConf.hasBarcodeEnabled(company.did) &&
            // mejor usar Object.hasOwn para chequear sólo properties propias
            !Object.hasOwn(dataQr, 'local') &&
            !Object.hasOwn(dataQr, 'sender_id')
        ) {
            try {
                // obtenemos el envío
                const shipmentId = await getShipmentIdFromQr(company.did, dataQr);
                const cliente = LogisticaConf.getSenderId(company.did);

                dataQr = {
                    local: '1',
                    did: shipmentId,
                    cliente,
                    empresa: company.did
                };

            } catch (error) {

                const cliente = LogisticaConf.getSenderId(company.did);
                const empresaVinculada = LogisticaConf.getEmpresaVinculada(company.did);
                // que pasa si es 211 o  55 que no tienen empresa vinculada
                if (empresaVinculada === null) {
                    // preguntar a cris 
                    throw new Error("El envio no esta igresado en su sistema");
                };

                const shipmentIdExterno = await getShipmentIdFromQr(empresaVinculada, dataQr);

                //no encontre shipmentiD : cambiar en el qr la empresa x la externa --- si no esta lo inserta 
                dataQr = {
                    local: '1',
                    did: shipmentIdExterno,
                    cliente,
                    empresa: empresaVinculada
                };
            }
        }
        logCyan(`Datos del QR: ${JSON.stringify(dataQr)}`);
        const isCollectShipmentML = Object.prototype.hasOwnProperty.call(dataQr, "t");
        /// Me fijo si es flex o no
        const isFlex = Object.prototype.hasOwnProperty.call(dataQr, "sender_id") || isCollectShipmentML;

        if (isFlex) {
            logCyan("Es flex");
            /// Busco la cuenta del cliente
            let account = null;
            let senderId = null;

            if (isCollectShipmentML) {
                //! Esto quiere decir que es un envio de colecta de ML
                const querySeller = `SELECT ml_vendedor_id FROM envios WHERE ml_shipment_id = ? AND flex = 1 AND superado=0 AND elim=0`;
                const result = await executeQuery(dbConnection, querySeller, [dataQr.id], true);

                senderId = result[0].ml_vendedor_id;
                account = await getAccountBySenderId(dbConnection, company.did, senderId);
                logCyan(JSON.stringify(account));
            } else {
                account = await getAccountBySenderId(dbConnection, company.did, dataQr.sender_id);
                senderId = dataQr.sender_id;
                console.log('llegue aca ')
                /** if (company.did == 167 && account == undefined) {
                     logCyan("Es JSL");
                     return await handleInternalFlex(dbConnection, company, userId, profile, dataQr, autoAssign, 0, latitude, longitude, senderId);
                 } */
            }

            if (account) {
                logCyan("Es interno");
                response = await handleInternalFlex(dbConnection, company, userId, profile, dataQr, autoAssign, account, latitude, longitude, senderId);

                /// Si la cuenta no existe, es externo
            }
            else if (company.did == 144 || company.did == 167) {
                logCyan("⚠️ Cuenta nula, verificando envío interno por empresa 144");

                const queryCheck = `
                  SELECT did
                  FROM envios
                  WHERE ml_vendedor_id = ?
                  AND superado = 0
                  AND elim = 0
                  LIMIT 1
                `;
                const resultCheck = await executeQuery(dbConnection, queryCheck, [dataQr.sender_id]);

                if (resultCheck.length > 0) {
                    senderId = dataQr.sender_id;
                    response = await handleInternalFlex(dbConnection, company, userId, profile, dataQr, autoAssign, account, latitude, longitude, senderId);
                } else {
                    logCyan("🌐 Es externo (empresa 144 sin coincidencia)");
                    response = await handleExternalFlex(dbConnection, company, userId, profile, dataQr, autoAssign, latitude, longitude);
                }
            } else {
                logCyan("Es externo");
                response = await handleExternalFlex(dbConnection, company, userId, profile, dataQr, autoAssign, latitude, longitude);
            }

        } else {
            logCyan("No es flex");
            logCyan(`Empresa: ${company.did}, Data QR: ${JSON.stringify(dataQr)}`);
            if (company.did == dataQr.empresa) {
                logCyan("Es interno");
                response = await handleInternalNoFlex(dbConnection, dataQr, company, userId, profile, autoAssign, latitude, longitude);
            } else {
                logCyan("Es externo");
                response = await handleExternalNoFlex(dbConnection, dataQr, company, userId, profile, autoAssign, latitude, longitude);
            }
        }

        return response;

    } catch (error) {
        logRed(`Error en colectar: ${error.message}`);
        throw error;

    } finally {
        dbConnection.end();
    }
}
