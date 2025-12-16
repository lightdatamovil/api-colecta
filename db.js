import redis from 'redis';
import dotenv from 'dotenv';
import { logRed, logYellow } from './src/funciones/logsCustom.js';
import mysql2 from 'mysql2/promise';
import https from 'https';
import axios from 'axios';
import { RabbitService } from "./classes/rabbit_service.js";
import { MicroservicioEstadosService } from "./classes/microservicio_estados.js";

dotenv.config({ path: process.env.ENV_FILE || ".env" });

/// Redis para obtener las empresas
const redisHost = process.env.REDIS_HOST;
const redisPort = process.env.REDIS_PORT;
const redisPassword = process.env.REDIS_PASSWORD;

/// Base de datos de colecta
const colectaDBHost = process.env.COLECTA_DB_HOST;
const colectaDBPort = process.env.COLECTA_DB_PORT;

/// Usuario y contraseña para los logs de la base de datos de colecta
const colectaDbUserForLogs = process.env.COLECTA_DB_USER_FOR_LOGS;
const colectaDbPasswordForLogs = process.env.COLECTA_DB_PASSWORD_FOR_LOGS;
const colectaDbNameForLogs = process.env.COLECTA_DB_NAME_FOR_LOGS;

// Produccion
const hostProductionDb = process.env.PRODUCTION_DB_HOST;
export const portProductionDb = process.env.PRODUCTION_DB_PORT;

export const urlMicroserviciosEstado = process.env.LOCAL == "true" ? process.env.URL_MICROSERVICIOS_ESTADO : process.env.URL_MICROSERVICIOS_ESTADO_NODO;
export const urlMicroserviciosAsignaciones = process.env.LOCAL == "true" ? process.env.URL_MICROSERVICIOS_ASIGNACIONES : process.env.URL_MICROSERVICIOS_ASIGNACIONES_NODO;


export const urlRabbitMQ = process.env.RABBITMQ_URL;
export const queueEstados = process.env.QUEUE_ESTADOS;
export const rabbitService = new RabbitService(urlRabbitMQ);

// 🔹 Agente HTTPS con keep-alive y hasta 100 conexiones simultáneas
export const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 100,
    timeout: 10000, // tiempo máximo de socket en ms
    family: 4, // fuerza IPv4, evita delay IPv6
});

// 🔹 Axios preconfigurado (usa el agente y timeout)
export const axiosInstance = axios.create({
    httpsAgent,
    timeout: 20000, // 5 segundos máximo por request
});

export const microservicioEstadosService = new MicroservicioEstadosService(60000, axiosInstance, urlMicroserviciosEstado);

// pool
export const poolColecta = mysql2.createPool({
    host: colectaDBHost,
    user: colectaDbUserForLogs,
    password: colectaDbPasswordForLogs,
    database: colectaDbNameForLogs,
    port: colectaDBPort,
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true,
    queueLimit: 0
});

export const redisClient = redis.createClient({
    socket: {
        host: redisHost,
        port: redisPort,
    },
    password: redisPassword,
});

redisClient.on('error', (err) => {
    logRed(`Error al conectar con Redis: ${err.message}`);
});

let companiesList = {};
export let clientList = {};
let accountList = {};
let driverList = {};

export function getProdDbConfig(company) {
    return {
        host: hostProductionDb,
        user: company.dbuser,
        password: company.dbpass,
        database: company.dbname,
        port: portProductionDb,
    };
}

async function loadCompaniesFromRedis() {
    const companiesListString = await redisClient.get('empresasData');

    companiesList = JSON.parse(companiesListString);
}

export async function getCompanyById(companyId) {
    let company = companiesList[companyId];

    if (company == undefined || Object.keys(companiesList).length === 0) {
        await loadCompaniesFromRedis();

        company = companiesList[companyId];
    }

    return company;
}

export async function getCompanyByCode(companyCode) {
    let company;

    if (Object.keys(companiesList).length === 0) {
        await loadCompaniesFromRedis();
    }

    for (const key in companiesList) {
        if (Object.prototype.hasOwnProperty.call(companiesList, key)) {
            const currentCompany = companiesList[key];
            if (String(currentCompany.codigo) === String(companyCode)) {
                company = currentCompany;
                break;
            }
        }
    }

    return company;
}

async function loadAccountList(dbConnection, companyId, senderId) {
    const querySelectClientesCuentas = `
            SELECT did, didCliente, ML_id_vendedor 
            FROM clientes_cuentas 
            WHERE superado = 0 AND elim = 0 AND tipoCuenta = 1 AND ML_id_vendedor != ''
        `;

    const result = await executeQuery(dbConnection, querySelectClientesCuentas);

    if (!accountList[companyId]) {
        accountList[companyId] = {};
    }

    result.forEach(row => {
        const keySender = row.ML_id_vendedor;

        if (!accountList[companyId][keySender]) {
            accountList[companyId][keySender] = {};
        }

        accountList[companyId][keySender] = {
            didCliente: row.didCliente,
            didCuenta: row.did,
        };
    });

    return accountList[companyId] ? accountList[companyId][senderId] : null;
}

export async function getAccountBySenderId(dbConnection, companyId, senderId) {
    try {
        if (accountList === undefined || accountList === null || Object.keys(accountList).length === 0 || !accountList[companyId]) {
            await loadAccountList(dbConnection, companyId, senderId);
        }

        let account = accountList[companyId][senderId];
        if (!account) {
            await loadAccountList(dbConnection, companyId, senderId);
            account = accountList[companyId][senderId];
        }

        return account;
    } catch (error) {
        logRed(`Error en getAccountBySenderId: ${error.stack}`);
        throw error;
    }
}

async function loadClients(dbConnection, companyId) {
    if (!clientList[companyId]) {
        clientList[companyId] = {}
    }

    const queryUsers = "SELECT * FROM clientes";
    const resultQueryUsers = await executeQuery(dbConnection, queryUsers, []);

    resultQueryUsers.forEach(row => {
        const client = row.did;

        if (!clientList[companyId][client]) {
            clientList[companyId][client] = {};
        }

        clientList[companyId][client] = {
            fecha_sincronizacion: row.fecha_sincronizacion,
            did: row.did,
            codigo: row.codigoVinculacionLogE,
            nombre: row.nombre_fantasia,
        };
    });
}

export async function getClientsByCompany(dbConnection, companyId) {
    let companyClients = clientList[companyId];

    if (companyClients == undefined || Object.keys(clientList).length === 0) {
        await loadClients(dbConnection, companyId);

        companyClients = clientList[companyId];
    }

    return companyClients;
}

async function loadDrivers(dbConnection, companyId) {
    if (!driverList[companyId]) {
        driverList[companyId] = {}
    }

    const queryUsers = `
            SELECT sistema_usuarios.did, sistema_usuarios.usuario 
            FROM sistema_usuarios_accesos
            INNER JOIN sistema_usuarios ON sistema_usuarios_accesos.did = sistema_usuarios.did
            WHERE sistema_usuarios_accesos.perfil IN (3, 6)
            AND sistema_usuarios_accesos.elim = 0
            AND sistema_usuarios_accesos.superado = 0
            AND sistema_usuarios.elim = 0
            AND sistema_usuarios.superado = 0
        `;

    const resultQueryUsers = await executeQuery(dbConnection, queryUsers, []);

    for (let i = 0; i < resultQueryUsers.length; i++) {
        const row = resultQueryUsers[i];

        if (!driverList[companyId][row.did]) {
            driverList[companyId][row.did] = {};
        }

        driverList[companyId][row.did] = {
            id: row.id,
            id_origen: row.id_origen,
            fecha_sincronizacion: row.fecha_sincronizacion,
            did: row.did,
            codigo: row.codigo_empleado,
            nombre: row.usuario,
        };
    }
}

export async function getDriversByCompany(dbConnection, companyId) {
    let companyDrivers = driverList[companyId];

    if (companyDrivers == undefined || Object.keys(driverList).length === 0) {

        await loadDrivers(dbConnection, companyId);

        companyDrivers = driverList[companyId];

    }

    return companyDrivers;
}

export async function executeQuery(connection, query, values, log) {
    // Utilizamos connection.format para obtener la query completa con valores
    const formattedQuery = connection.format(query, values);

    return new Promise((resolve, reject) => {
        connection.query(query, values, (err, results) => {
            if (log) {
                logYellow(`Ejecutando query: ${formattedQuery}`);
            }
            if (err) {
                if (log) {
                    logRed(`Error en executeQuery: ${err.message} en query: ${formattedQuery}`);
                }
                reject(err);
            } else {
                if (log) {
                    logYellow(`Query ejecutado con éxito: ${formattedQuery} - Resultados: ${JSON.stringify(results)}`);
                }
                resolve(results);
            }
        });
    });
}
