import dotenv from 'dotenv';
import { formatFechaUTC3 } from '../../../src/funciones/formatFechaUTC3.js';
import { generarTokenFechaHoy } from '../../../src/funciones/generarTokenFechaHoy.js';
import CustomException from '../../../classes/custom_exception.js';
import { sendToService } from '../../../src/funciones/sendToService.js';
import { urlMicroserviciosEstado } from '../../../db.js';

dotenv.config({ path: process.env.ENV_FILE || '.env' });

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

    try {
        await sendToService(urlMicroserviciosEstado, message);
    } catch (error) {
        throw new CustomException({
            title: "Error enviando al microservicio de estados",
            message: `No se pudo enviar el estado de colecta al microservicio de estados. Error: ${error.message}`,
        })
    }
}
