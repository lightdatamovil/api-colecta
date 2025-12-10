import { executeQuery, getAccountBySenderId, getProdDbConfig } from "../db.js";
import { handleInternalFlex } from "./colectaController/handlers/flex/handleInternalFlex.js";
import { handleExternalFlex } from "./colectaController/handlers/flex/handleExternalFlex.js";
import { handleExternalNoFlex } from "./colectaController/handlers/noflex/handleExternalNoFlex.js";
import { handleInternalNoFlex } from "./colectaController/handlers/noflex/handleInternalNoFlex.js";
import { logRed } from "../src/funciones/logsCustom.js";
import { parseIfJson } from "../src/funciones/isValidJson.js";
import LogisticaConf from "../classes/logisticas_conf.js";
import { decrActiveLocal, incrActiveLocal } from "../src/funciones/dbList.js";
import { sendToService } from "../src/funciones/sendToService.js";
import { connectWithFallback } from "../src/funciones/connectWithFallback.js";
import { crearLogRaro } from "../src/funciones/crear_log_raro.js";

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
        const result = await sendToService('https://apimovil2.lightdata.app/api/qr/get-shipment-id', payload);
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
    incrActiveLocal(company.did);
    let dbConnection;
    try {
        dbConnection = await connectWithFallback(company);
        let response;
        dataQr = parseIfJson(dataQr);
        //es barcode
        if (
            LogisticaConf.hasBarcodeEnabled(company.did) &&
            // mejor usar Object.hasOwn para chequear sólo properties propias
            !Object.hasOwn(dataQr, 'local') &&
            !Object.hasOwn(dataQr, 'sender_id')
        ) {
            let cliente, shipmentId;
            try {
                if (LogisticaConf.getExisteSioSi(company.did)) {
                    const q = `
                    SELECT didCliente,did
                    FROM envios
                    WHERE ml_shipment_id = ? AND superado = 0 AND elim = 0
                    LIMIT 1
                  `;
                    const result = await executeQuery(dbConnection, q, [dataQr], true);
                    if (result.length > 0) {
                        cliente = result[0]?.didCliente ?? null;
                        shipmentId = result[0]?.did ?? null;
                    } else {
                        throw new Error("No se encontró el envío en la base de datos.");
                    }
                } else {
                    cliente = LogisticaConf.getSenderId(company.did, dataQr);
                    shipmentId = await getShipmentIdFromQr(company.did, dataQr);
                }

                dataQr = {
                    local: '1',
                    did: shipmentId,
                    cliente,
                    empresa: company.did
                };

            } catch (error) {
                logRed(`Error al procesar código de barras: ${error.message}`);
                const cliente = LogisticaConf.getSenderId(company.did);
                const empresaVinculada = LogisticaConf.getEmpresaVinculada(company.did);
                // que pasa si es 211 o  55 que no tienen empresa vinculada
                if (empresaVinculada === null) {
                    // preguntar a cris 
                    throw new Error("El envio no esta igresado en su sistema");
                };
                let shipmentIdExterno;
                try {

                    shipmentIdExterno = await getShipmentIdFromQr(empresaVinculada, dataQr);
                } catch (error) {
                    console.log(error);
                    throw new Error("Error envio no insertado ");
                }

                //no encontre shipmentiD : cambiar en el qr la empresa x la externa --- si no esta lo inserta 
                dataQr = {
                    local: '1',
                    did: shipmentIdExterno,
                    cliente,
                    empresa: empresaVinculada
                };
            }
        }

        const isCollectShipmentML = Object.prototype.hasOwnProperty.call(dataQr, "t");
        /// Me fijo si es flex o no
        const isFlex = Object.prototype.hasOwnProperty.call(dataQr, "sender_id") || isCollectShipmentML;

        if (isFlex) {
            /// Busco la cuenta del cliente
            let account = null;
            let senderId = null;

            if (isCollectShipmentML) {
                //! Esto quiere decir que es un envio de colecta de ML
                const querySeller = `SELECT ml_vendedor_id FROM envios WHERE ml_shipment_id = ? AND flex = 1 AND superado=0 AND elim=0`;
                const result = await executeQuery(dbConnection, querySeller, [dataQr.id]);

                senderId = result[0].ml_vendedor_id;
                account = await getAccountBySenderId(dbConnection, company.did, senderId);
            } else {
                console.log("Buscando cuenta por sender_id:", dataQr.sender_id);
                account = await getAccountBySenderId(dbConnection, company.did, dataQr.sender_id);
                console.log("Cuenta encontrada:", account);
                senderId = dataQr.sender_id;
            }

            if (account) {
                response = await handleInternalFlex(dbConnection, company, userId, profile, dataQr, autoAssign, account, latitude, longitude, senderId);

                /// Si la cuenta no existe, es externo
            } else if (company.did == 144 || company.did == 167 || company.did == 114) {
                //est verificacion admite solo envios ingresados en el sistema, de lo contrario es externo. No se ingresa

                const queryCheck = `
                  SELECT did
                  FROM envios
                  WHERE ml_vendedor_id = ?
                  AND ml_shipment_id = ?
                  AND superado = 0
                  AND elim = 0
                  LIMIT 1
                `;
                const resultCheck = await executeQuery(dbConnection, queryCheck, [dataQr.sender_id, dataQr.id]);

                if (resultCheck.length > 0) {
                    senderId = dataQr.sender_id;
                    response = await handleInternalFlex(dbConnection, company, userId, profile, dataQr, autoAssign, account, latitude, longitude, senderId);
                } else {
                    response = await handleExternalFlex(dbConnection, company, userId, profile, dataQr, autoAssign, latitude, longitude);
                }
            } else {
                response = await handleExternalFlex(dbConnection, company, userId, profile, dataQr, autoAssign, latitude, longitude);
            }

        } else {
            if (company.did == dataQr.empresa) {
                response = await handleInternalNoFlex(dbConnection, dataQr, company, userId, profile, autoAssign, latitude, longitude);
            } else {
                response = await handleExternalNoFlex(dbConnection, dataQr, company, userId, profile, autoAssign, latitude, longitude);
            }
        }

        return response;

    } catch (error) {
        console.log(error);
        const dbConfig = getProdDbConfig(company);
        await crearLogRaro({
            company,
            mensaje: `Error al conectar a MySQL: ${error.message} ${JSON.stringify(dbConfig)}`,
            detalle: JSON.stringify(company),
            nivel: "ERROR",
        });
        throw error;
    } finally {
        decrActiveLocal(company.did);
        dbConnection.end();
    }
}
