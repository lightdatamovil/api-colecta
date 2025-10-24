import dotenv from 'dotenv';
import { logCyan, logGreen, logRed } from '../../../src/funciones/logsCustom.js';
import { formatFechaUTC3 } from '../../../src/funciones/formatFechaUTC3.js';
import { generarTokenFechaHoy } from '../../../src/funciones/generarTokenFechaHoy.js';
import { sendToShipmentStateMicroService } from './sendToShipmentStateMicroService.js';
import { axiosInstance } from '../../../db.js';
dotenv.config({ path: process.env.ENV_FILE || '.env' });

const BACKUP_ENDPOINT = "http://10.70.0.69:13000/estados"


export async function sendToShipmentStateMicroServiceAPI(
    companyId,
    quien,
    shipmentId,
    latitud,
    longitud
) {
    const message = {
        didempresa: companyId,
        didenvio: shipmentId,
        estado: 0,
        subestado: null,
        estadoML: null,
        fecha: formatFechaUTC3(),
        quien: quien,
        operacion: 'colecta',
        latitud,
        longitud,
        desde: "APP NUEVA Colecta",
        tkn: generarTokenFechaHoy(),
    };

    logCyan(`Enviando mensaje a RabbitMQ: ${JSON.stringify(message)}`);
    try {
        const response = await axiosInstance.post(BACKUP_ENDPOINT, message);
        logGreen(`✅ Enviado por HTTP con status ${response.status}`);
    } catch (httpError) {
        try {
            await sendToShipmentStateMicroService(
                companyId, quien, shipmentId, latitud, longitud
            );
            logGreen("↩️ Enviado por RabbitMQ (fallback)");
        } catch (mqError) {
            logRed(`❌ Falló HTTP y también MQ: ${httpError.message} | ${mqError.message}`);
            throw mqError; // cortás sólo si fallan ambos
        }
    }
}
