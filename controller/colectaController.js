
import { parseIfJson, LogisticaConfig, getShipmentIdFromQr, logCyan, executeQuery, getHeaders } from "lightdata-tools";
import { handleInternalFlex } from "./colectaController/handlers/flex/handleInternalFlex.js";
import { handleExternalFlex } from "./colectaController/handlers/flex/handleExternalFlex.js";
import { handleExternalNoFlex } from "./colectaController/handlers/noflex/handleExternalNoFlex.js";
import { handleInternalNoFlex } from "./colectaController/handlers/noflex/handleInternalNoFlex.js";
import { accountsService } from "../db.js";

function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    if (Buffer?.isBuffer?.(v)) return 'buffer'; // Node
    const t = typeof v;
    if (t !== 'object') return t; // number, string, boolean, undefined, function, symbol, bigint
    // Objetos “clase”
    if (v instanceof Date) return 'date';
    if (v instanceof RegExp) return 'regexp';
    if (v instanceof Map) return 'map';
    if (v instanceof Set) return 'set';
    if (v instanceof Promise) return 'promise';
    // Fallback genérico
    const tag = Object.prototype.toString.call(v); // "[object Something]"
    return tag.slice(8, -1).toLowerCase();        // p.ej. "object", "error", "uint8array"
}

export async function colectar(dbConnection, req, company) {
    let { dataQr, autoAssign, latitude, longitude } = req.body;
    const { userId, profile } = getHeaders(req);
    logCyan(typeOf(userId));
    let response;
    dataQr = parseIfJson(dataQr);
    //es barcode
    if (
        LogisticaConfig.hasBarcodeEnabled(company.did) &&
        (
            (typeof dataQr === "string" && dataQr.includes("MLAR")) ||
            (typeof dataQr === "object" && dataQr !== null && Object.values(dataQr).some(val => typeof val === "string" && val.includes("MLAR")))
        )
    ) {
        try {
            // obtenemos el envío
            const shipmentId = await getShipmentIdFromQr(company.did, dataQr);
            const cliente = LogisticaConfig.getSenderId(company.did);

            dataQr = {
                local: '1',
                did: shipmentId,
                cliente,
                empresa: company.did
            };

        } catch (error) {

            const cliente = LogisticaConfig.getSenderId(company.did);
            const empresaVinculada = LogisticaConfig.getEmpresaVinculada(company.did);
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
            const result = await executeQuery(dbConnection, querySeller, [dataQr.id]);

            senderId = result[0].ml_vendedor_id;
            account = await accountsService.getBySenderId(dbConnection, company.did, senderId);
            logCyan(JSON.stringify(account));
        } else {
            account = await accountsService.getBySenderId(dbConnection, company.did, dataQr.sender_id);
            senderId = dataQr.sender_id;
        }

        if (account) {
            logCyan("Es interno");
            response = await handleInternalFlex(dbConnection, company, userId, profile, dataQr, autoAssign, account, latitude, longitude, senderId);

            /// Si la cuenta no existe, es externo
        }
        else if (company.did == 144) {
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
        }
        else {
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

}
