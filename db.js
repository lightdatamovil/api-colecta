import redis from 'redis';
import dotenv from 'dotenv';
import { CompaniesService, logRed } from 'lightdata-tools';
import mysql2 from 'mysql2';

dotenv.config({ path: process.env.ENV_FILE || ".env" });

/// Redis para obtener las empresas
const redisHost = process.env.REDIS_HOST;
const redisPort = process.env.REDIS_PORT;
const redisPassword = process.env.REDIS_PASSWORD;

export const redisClient = redis.createClient({
    socket: {
        host: redisHost,
        port: redisPort,
    },
    password: redisPassword,
});

/// Base de datos de colecta
const colectaDBHost = process.env.COLECTA_DB_HOST;
const colectaDBPort = process.env.COLECTA_DB_PORT;

/// Usuario y contraseña para los logs de la base de datos de colecta
const colectaDbUserForLogs = process.env.COLECTA_DB_USER_FOR_LOGS;
const colectaDbPasswordForLogs = process.env.COLECTA_DB_PASSWORD_FOR_LOGS;
const colectaDbNameForLogs = process.env.COLECTA_DB_NAME_FOR_LOGS;

// Produccion
export const hostProductionDb = process.env.PRODUCTION_DB_HOST;
export const portProductionDb = process.env.PRODUCTION_DB_PORT;

// JWT
export const jwtSecret = process.env.JWT_SECRET;

// Servicio de empresas
export const companiesService = new CompaniesService({ redisClient, redisKey: "empresasData" })


/// MICROSERVICIO DE ESTADOS
export const rabbitUrl = process.env.RABBIT_URL;
export const queueEstados = process.env.QUEUE_ESTADOS;
export const urlEstadosMicroservice = process.env.URL_ESTADOS_MICROSERVICE;

redisClient.on('error', (err) => {
    logRed(`Error al conectar con Redis: ${err.message}`);
});

export const poolLocal = mysql2.createPool({
    host: colectaDBHost,
    user: colectaDbUserForLogs,
    password: colectaDbPasswordForLogs,
    database: colectaDbNameForLogs,
    port: colectaDBPort,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
