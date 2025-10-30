import { handleInternalFlex } from "./colectaController/handlers/flex/handleInternalFlex.js";
import { handleExternalFlex } from "./colectaController/handlers/flex/handleExternalFlex.js";
import { handleExternalNoFlex } from "./colectaController/handlers/noflex/handleExternalNoFlex.js";
import { handleInternalNoFlex } from "./colectaController/handlers/noflex/handleInternalNoFlex.js";
import { CustomException, getShipmentIdFromQr, LightdataORM, LogisticaConfig, parseIfJson } from "lightdata-tools";
import { companiesService, urlApimovilGetShipmentId, axiosInstance } from "../db.js";

export async function colectar({ db, req, company }) {
    let { dataQr } = req.body;

    let response;

    dataQr = parseIfJson(dataQr);
    //es barcode
    if (
        LogisticaConfig.hasBarcodeEnabled(company.did) &&
        // mejor usar Object.hasOwn para chequear sólo properties propias
        !Object.hasOwn(dataQr, 'local') &&
        !Object.hasOwn(dataQr, 'sender_id')
    ) {
        try {
            const shipmentId = await getShipmentIdFromQr({
                url: urlApimovilGetShipmentId,
                axiosInstance,
                req,
                dataQr,
                desde: 'colecta'
            });

            const cliente = LogisticaConfig.getSenderId(company.did);

            dataQr = {
                local: '1',
                did: shipmentId,
                cliente,
                empresa: company.did
            };

        } catch {

            const cliente = LogisticaConfig.getSenderId(company.did);
            const empresaVinculada = LogisticaConfig.getEmpresaVinculada(company.did);
            // que pasa si es 211 o  55 que no tienen empresa vinculada
            if (empresaVinculada === null) {
                throw new CustomException({
                    title: "El envio no esta ingresado en su sistema",
                    message: "Por favor verifique el codigo de barras"
                });
            };

            const shipmentIdExterno = await getShipmentIdFromQr({
                url: urlApimovilGetShipmentId,
                axiosInstance,
                req,
                dataQr,
                desde: 'colecta',
                companyId: empresaVinculada
            });

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
            const [result] = await LightdataORM.select({
                dbConnection: db,
                where: {
                    ml_shipment_id: dataQr.id,
                    flex: 1,
                },
                table: 'envios',
            });
            senderId = result.ml_vendedor_id;
            account = await companiesService.getAccountBySenderId(db, company.did, senderId);
        } else {
            account = await companiesService.getAccountBySenderId(db, company.did, dataQr.sender_id);
            senderId = dataQr.sender_id;
        }

        if (account) {
            response = await handleInternalFlex({ db, company, account, senderId });

            /// Si la cuenta no existe, es externo
        } else if (company.did == 144 || company.did == 167) {

            const row = await LightdataORM.select({
                dbConnection: db,
                table: 'envios',
                where: {
                    ml_vendedor_id: dataQr.sender_id,
                    ml_shipment_id: dataQr.id
                },
            });

            if (row.length > 0) {
                senderId = dataQr.sender_id;
                response = await handleInternalFlex({ req, db, company, account, senderId });
            } else {
                response = await handleExternalFlex({ req, db, company });
            }
        } else {
            response = await handleExternalFlex({ req, db, company });
        }

    } else {
        if (company.did == dataQr.empresa) {
            response = await handleInternalNoFlex({ req, db, company });
        } else {
            response = await handleExternalNoFlex({ req, db, company });
        }
    }

    return response;
}
