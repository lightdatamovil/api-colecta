import { handleInternalFlex } from "./colectaController/handlers/flex/handleInternalFlex.js";
import { handleExternalFlex } from "./colectaController/handlers/flex/handleExternalFlex.js";
import { handleExternalNoFlex } from "./colectaController/handlers/noflex/handleExternalNoFlex.js";
import { handleInternalNoFlex } from "./colectaController/handlers/noflex/handleInternalNoFlex.js";
import { executeQuery, getShipmentIdFromQr, LogisticaConfig, parseIfJson } from "lightdata-tools";
import { companiesService } from "../db.js";

export async function colectar({ db, req, company }) {
    let { dataQr, autoAssign, latitude, longitude } = req.body;
    const { userId, profile } = req.user;

    let response;
    const headers = req.headers;
    dataQr = parseIfJson(dataQr);
    //es barcode
    if (
        LogisticaConfig.hasBarcodeEnabled(company.did) &&
        // mejor usar Object.hasOwn para chequear sólo properties propias
        !Object.hasOwn(dataQr, 'local') &&
        !Object.hasOwn(dataQr, 'sender_id')
    ) {
        try {
            // obtenemos el envío
            const shipmentId = await getShipmentIdFromQr({ companyId: company.did, dataQr });
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

            const shipmentIdExterno = await getShipmentIdFromQr({ companyId: empresaVinculada, dataQr });

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
            const result = await executeQuery({ dbConnection: db, query: querySeller, values: [dataQr.id] });
            senderId = result[0].ml_vendedor_id;
            account = await companiesService.getAccountBySenderId(db, company.did, senderId);
        } else {
            account = await companiesService.getAccountBySenderId(db, company.did, dataQr.sender_id);
            senderId = dataQr.sender_id;
        }

        if (account) {
            response = await handleInternalFlex({ db, company, userId, profile, dataQr, autoAssign, account, latitude, longitude, senderId });

            /// Si la cuenta no existe, es externo
        } else if (company.did == 144 || company.did == 167) {

            const queryCheck = `
                  SELECT did
                  FROM envios
                  WHERE ml_vendedor_id = ?
                  AND ml_shipment_id = ?
                  AND superado = 0
                  AND elim = 0
                  LIMIT 1
                `;
            const resultCheck = await executeQuery({ dbConnection: db, query: queryCheck, values: [dataQr.sender_id, dataQr.id] });

            if (resultCheck.length > 0) {
                senderId = dataQr.sender_id;
                response = await handleInternalFlex({ headers, db, company, userId, profile, dataQr, autoAssign, account, latitude, longitude, senderId });
            } else {
                response = await handleExternalFlex({ headers, db, company, userId, profile, dataQr, autoAssign, latitude, longitude });
            }
        } else {
            response = await handleExternalFlex({ headers, db, company, userId, profile, dataQr, autoAssign, latitude, longitude });
        }

    } else {
        if (company.did == dataQr.empresa) {
            response = await handleInternalNoFlex({ headers, db, dataQr, company, userId, profile, autoAssign, latitude, longitude });
        } else {
            response = await handleExternalNoFlex({ headers, db, dataQr, company, userId, profile, autoAssign, latitude, longitude });
        }
    }

    return response;
}
