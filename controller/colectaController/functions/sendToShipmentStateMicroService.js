import { connect } from 'amqplib';
import dotenv from 'dotenv';
import { logGreen, logRed, logYellow } from '../../../src/funciones/logsCustom.js';
import { formatFechaUTC3 } from '../../../src/funciones/formatFechaUTC3.js';
import { generarTokenFechaHoy } from '../../../src/funciones/generarTokenFechaHoy.js';
import { sendToService } from '../../../src/funciones/sendToService.js';
import { urlMicroserviciosEstado } from '../../../db.js';
dotenv.config({ path: process.env.ENV_FILE || '.env' });

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const QUEUE_ESTADOS = process.env.QUEUE_ESTADOS;

let connection = null;
let channel = null;

async function getChannel() {
    if (channel) return channel;

    try {
        connection = await connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_ESTADOS, { durable: true });

        process.on('exit', () => {
            if (channel) channel.close();
            if (connection) connection.close();
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
        longitud,
        desde: "colectaAPP",
        tkn: generarTokenFechaHoy(),
    };
    try {
        if (process.env.LOCAL == 'true') {
            throw new Error();
        }
        const ch = await getChannel();
        const sent = ch.sendToQueue(
            QUEUE_ESTADOS,
            Buffer.from(JSON.stringify(message)),
            { persistent: true }
        );

        if (sent) {
            logGreen('✅ Mensaje enviado correctamente al microservicio de estados');
        } else {
            logYellow('⚠️ Mensaje no pudo encolarse (buffer lleno)');
            throw new Error('Buffer lleno en RabbitMQ');
        }
    } catch (error) {
        logRed(`❌ Falló RabbitMQ, intentando enviar por HTTP: ${error.message}`);

        try {
            const response = await sendToService(urlMicroserviciosEstado, message);
            logGreen(`✅ Enviado por HTTP con status ${response.status}`);
        } catch (httpError) {
            logRed(`❌ Falló el envío por HTTP también: ${httpError.message}`);
            throw httpError;
        }
    }
}
