import { connect } from 'amqplib';
import dotenv from 'dotenv';
import { logGreen, logRed } from 'lightdata-tools';
import { queueEstadosML, rabbitUrl } from '../../../db.js';

dotenv.config({ path: process.env.ENV_FILE || '.env' });

let connection = null;
let channel = null;

async function getChannel() {
    if (channel) return channel;

    try {
        connection = await connect(rabbitUrl);
        channel = await connection.createChannel();
        await channel.assertQueue(queueEstadosML, { durable: true });

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

export async function senToDataML({
    companyId,
    didEnvio,
    sellerId,
    shipmentId
}) {
    const message = {
        idEmpresa: companyId,
        did: didEnvio,
        sellerId: sellerId,
        shipmentId: shipmentId
    };
    const ch = await getChannel();
    const sent = ch.sendToQueue(
        queueEstadosML,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
    );

    if (sent) {
        logGreen('✅ Mensaje enviado correctamente al microservicio de dataML');
    } else {
        throw new Error('Buffer lleno en RabbitMQ');
    }
}
