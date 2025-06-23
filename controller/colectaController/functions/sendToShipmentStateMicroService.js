import { connect } from 'amqplib';
import dotenv from 'dotenv';
import { logGreen, logRed } from '../../../src/funciones/logsCustom.js';
import { formatFechaUTC3 } from '../../../src/funciones/formatFechaUTC3.js';

dotenv.config({ path: process.env.ENV_FILE || '.env' });

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const QUEUE_ESTADOS = process.env.QUEUE_ESTADOS;

let connection = null;
let channel = null;

/**
 * Devuelve un canal listo para usar, creando conexión y canal
 * solo en la primera llamada.
 */
async function getChannel() {
    if (channel) return channel;

    try {
        connection = await connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_ESTADOS, { durable: true });

        // Opcional: manejar cierre de conexión en exit
        process.on('exit', () => {
            channel.close();
            connection.close();
        });

        return channel;
    } catch (err) {
        logRed(`❌ Error al inicializar RabbitMQ: ${err.stack}`);
        throw err;
    }
}

export async function sendToShipmentStateMicroService(
    companyId,
    userId,
    shipmentId,
    latitud,
    longitud
) {
    try {
        const ch = await getChannel();

        const message = {
            didempresa: companyId,
            didenvio: shipmentId,
            estado: 0,
            subestado: null,
            estadoML: null,
            fecha: formatFechaUTC3(),
            quien: userId,
            operacion: 'colecta',
            latitud,
            longitud
        };

        const sent = ch.sendToQueue(
            QUEUE_ESTADOS,
            Buffer.from(JSON.stringify(message)),
            { persistent: true }
        );

        if (sent) {
            logGreen('✅ Mensaje enviado correctamente al microservicio de estados');
        } else {
            logYellow('⚠️ Mensaje no pudo encolarse (buffer lleno)');
        }
    } catch (error) {
        logRed(`Error en sendToShipmentStateMicroService: ${error.stack}`);
        throw error;
    }
}
