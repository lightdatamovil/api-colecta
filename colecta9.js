const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mysql = require('mysql');
const redis = require('redis');
const { log } = require('util');
const util = require('util'); // Importa util para promisify

let Aempresas;
const app = express();
app.use(express.json());

// Configuración de la conexión a MySQL

const redisClient = redis.createClient({
    socket: {
        host: '192.99.190.137',
        port: 50301,
    },
    password: 'sdJmdxXC8luknTrqmHceJS48NTyzExQg',
});

// Middleware para manejar la solicitud POST
app.post('/procesarQR', (req, res) => {
    const dataQR = req.body.dataQR || req.body.data;

    let codigovinculacionMIO = "";
    const sql = "SELECT codigo FROM lightdata_clientes WHERE id = ?";
    connection.query(sql, [GLOBAL_empresa_id], (err, result) => {
        if (err) {
            return res.status(500).json({ estado: false, mensaje: "Error en la consulta SQL" });
        }

        if (result.length > 0) {
            codigovinculacionMIO = result[0].codigo;
        }

        const AdataQR = JSON.parse(dataQR);
        let colectado = false;
        const esflex = AdataQR.hasOwnProperty("local") ? false : true;

        if (!AdataQR.hasOwnProperty("local")) {
            if (!AdataQR.hasOwnProperty("sender_id")) {
                return res.json({ estado: false, mensaje: "Error en el QR" });
            }
        }

        // Verificar y manejar el archivo de fechas
        const fechaFilePath = path.join(__dirname, `miscuentasclientes_${GLOBAL_empresa_id}_fecha.txt`);
        if (!fs.existsSync(fechaFilePath)) {
            fs.writeFileSync(fechaFilePath, new Date().toISOString());
        } else {
            const fechacuentas = fs.readFileSync(fechaFilePath, 'utf8');
            const ahora = new Date().toISOString();

            const datetime1 = new Date(fechacuentas);
            const datetime2 = new Date(ahora);

            const horas_diff = Math.abs(datetime2 - datetime1) / 36e5; // Diferencia en horas

            if (horas_diff >= 2) {
                fs.unlinkSync(path.join(__dirname, `miscuentasclientes_${GLOBAL_empresa_id}.json`));
            }
        }

    });
});

app.post('/procesarQR2', async (req, res) => {
    try {
        const data= req.body
        const dataQR = req.body.dataQR || req.body.data;
console.log(dataQR);

        // Llamar a la función colecta
        const resultado = await colecta(dataQR,req);
        return res.json(resultado);
    } catch (error) {
        console.error('Error en procesarQR:', error);
        return res.status(500).json({ estado: false, mensaje: "Error en el procesamiento" });
    }
});

async function actualizarEmpresas() {
    const empresasDataJson = await redisClient.get('empresas');
   let   Aempresas = JSON.parse(empresasDataJson);
   return Aempresas
   async function iniciarProceso() {
    try {
        // Conectar a Redis
        await redisClient.connect();

        // Actualizar empresas antes de cerrar la conexión
       let empresas = await actualizarEmpresas(Aempresas);

        // Cerrar la conexión de Redis
        await redisClient.quit();
        console.log("Conexión a Redis cerrada.");
        return empresas
    } catch (error) {
        console.error("Error en el proceso:", error);
    }
}
}
async function iniciarProceso() {
    try {
        // Conectar a Redis
        await redisClient.connect();

        // Actualizar empresas antes de cerrar la conexión
       let empresas = await actualizarEmpresas(Aempresas);

        // Cerrar la conexión de Redis
        await redisClient.quit();
        console.log("Conexión a Redis cerrada.");
        return empresas
    } catch (error) {
        console.error("Error en el proceso:", error);
    }
}

// Función para enviar datos a Redis ML
async function sendToRedisML(jsonData) {
    try {
        const response = await axios.post('https://altaenvios.lightdata.com.ar/api/enviosMLredis', jsonData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error enviando datos a Redis ML:', error);
        throw error;
    }
}

// Función para obtener el informe de retiros
async function informe(perfil, quien, connection) {
    const sql = `
        SELECT COUNT(eh.id) as total, CONCAT(su.nombre, ' ', su.apellido) as cadete
        FROM envios_historial as eh
        JOIN sistema_usuarios as su ON (su.elim = 0 AND su.superado = 0 AND su.did = eh.quien)
        WHERE eh.superado = 0 AND eh.estado = 0 AND eh.quien = ?
        GROUP BY eh.quien
    `;

    return new Promise((resolve, reject) => {
        connection.query(sql, [quien], (err, result) => {
            if (err) {
                return reject(err);
            }

            const row = result[0] || {};
            resolve({
                namecliente: row.cadete || "",
                aretirar: row.total || 0
            });
        });
    });
}

// Función para obtener el informe profesional
async function informePro(perfil, quien, connection) {
    const hoy = new Date().toISOString().split('T')[0] + " 00:00:00";
    let colectados = 0;
    let nuevosColectados = 0;

    const sqlColectados = `
        SELECT COUNT(id) as total 
        FROM envios_historial 
        WHERE autofecha > ? AND estado = 1
    `;

    const sqlNuevosColectados = `
        SELECT COUNT(id) as total 
        FROM envios 
        WHERE fecha_inicio > ?  AND superado = 0 AND elim = 0
    `;

    return new Promise((resolve, reject) => {
        connection.query(sqlColectados, [hoy, quien], (err, result) => {
            if (err) {
                return reject(err);
            }

            colectados = result[0]?.total || 0;

            connection.query(sqlNuevosColectados, [hoy, quien], (err, result) => {
                if (err) {
                    return reject(err);
                }

                nuevosColectados = result[0]?.total || 0;
                resolve({
                    colectados: colectados.toString(),
                    nuevosColectados: nuevosColectados.toString()
                });
            });
        });
    });
}

// Función para obtener los totales de un cliente
async function obtenerToTales(didCliente, quien, didenvio, connection) {
    const hoy = new Date().toISOString().split('T')[0];
    let clientename = "";
    let ingresadoshot = 0;
    let cliente_total = 0;
    let choferasignado = "";
    let zonaentrega = "";
    let retiradoshoymi = 0;

    const sqlCliente = `
        SELECT nombre_fantasia 
        FROM clientes 
        WHERE superado = 0 AND elim = 0 AND did = ?
    `;

    const sqlIngresadosHoy = `
        SELECT COUNT(id) as total 
        FROM envios 
        WHERE superado = 0 AND elim = 0 AND (autofecha > ? AND autofecha < ?) AND didCliente = ?
    `;

    const sqlClienteTotal = `
        SELECT COUNT(e.id) as total
        FROM envios as e
        JOIN envios_historial as eh ON (eh.elim = 0 AND eh.superado = 0 AND eh.estado = 7 AND eh.didEnvio = e.did)
        WHERE e.superado = 0 AND e.elim = 0 AND e.didCliente = ?
    `;

    const sqlDatosPaquete = `
        SELECT ez.nombre as zona, CONCAT(su.nombre, ' ', su.apellido) as chofer
        FROM envios as e
        LEFT JOIN envios_zonas as ez ON (ez.elim = 0 AND ez.superado = 0 AND ez.did = e.didEnvioZona)
        LEFT JOIN envios_asignaciones as ea ON (ea.elim = 0 AND ea.superado = 0 AND ea.didEnvio = e.did)
        LEFT JOIN sistema_usuarios as su ON (su.superado = 0 AND su.elim = 0 AND su.did = ea.operador)
        WHERE e.superado = 0 AND e.elim = 0 AND e.did = ?
    `;

    const sqlRetiradosHoyMi = `
        SELECT COUNT(id) as total 
        FROM envios_historial 
        WHERE superado = 0 AND elim = 0 AND quien IN (?) AND (autofecha > ? AND autofecha < ?) AND estado = 0
    `;

    return new Promise((resolve, reject) => {
        connection.query(sqlCliente, [didCliente], (err, result) => {
            if (err) {
                return reject(err);
            }

            clientename = result[0]?.nombre_fantasia || "";

            connection.query(sqlIngresadosHoy, [`${hoy} 00:00:00`, `${hoy} 23:59:59`, didCliente], (err, result) => {
                if (err) {
                    return reject(err);
                }

                ingresadoshot = result[0]?.total || 0;

                connection.query(sqlClienteTotal, [didCliente], (err, result) => {
                    if (err) {
                        return reject(err);
                    }

                    cliente_total = result[0]?.total || 0;

                    connection.query(sqlDatosPaquete, [didenvio], (err, result) => {
                        if (err) {
                            return reject(err);
                        }

                        choferasignado = result[0]?.chofer || "";
                        zonaentrega = result[0]?.zona || "";

                        connection.query(sqlRetiradosHoyMi, [quien, `${hoy} 00:00:00`, `${hoy} 23:59:59`], (err, result) => {
                            if (err) {
                                return reject(err);
                            }

                            retiradoshoymi = result[0]?.total || 0;

                            resolve({
                                cliente: clientename,
                                cliente_total: cliente_total,
                                retiradoshoymi: retiradoshoymi,
                                aingresarhoy: 0, // Ajustar según lógica
                                ingresadoshoy: ingresadoshot,
                                ingresadosahora: 0, // Ajustar según lógica
                                choferasignado: choferasignado,
                                zonaentrega: zonaentrega
                            });
                        });
                    });
                });
            });
        });
    });
}

// Función para obtener la empresa dueña
function empresaDuenia(codigo, AempresasGlobal) {
    const empresa = Object.values(AempresasGlobal).find(empresa => empresa.codigo === codigo);
    return empresa || {}; // Retorna la empresa si la encuentra, o un objeto vacío si no.
}


// Función para insertar datos del QR en la base de datos
async function insertoDataQR(didEnvio, AdataQR, connection) {
    const ml_qr_seguridad = JSON.stringify(AdataQR);
    const sql = `
        UPDATE envios 
        SET ml_qr_seguridad = ?
        WHERE superado = 0 AND elim = 0 AND did = ?
        LIMIT 1
    `;

    return new Promise((resolve, reject) => {
        connection.query(sql, [ml_qr_seguridad, didEnvio], (err, result) => {
            if (err) {
                return reject(err);
            }
            resolve(result.affectedRows > 0);
        });
    });
}

// Función para insertar un nuevo paquete en la base de datos
async function insertarPaquete(didcliente, didcuenta, AdataQR, connection, flex, externo, idempresa) {
    console.log(idempresa,"llegue");
    
    const GLOBAL_empresa_id = idempresa; // Ajustar según tu lógica global
    const lote = generarLoteExterno(); // Implementar esta función
    const fecha_inicio = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let idnuevo = -1;
    const quien = 1;
    const did = 0;
    const idshipment = AdataQR.id;
    const senderid = AdataQR.sender_id;
    const ml_qr_seguridad = JSON.stringify(AdataQR);
    const fechaunix = Math.floor(Date.now() / 1000);

    const sql = `
        INSERT INTO envios (did, ml_shipment_id, ml_vendedor_id, didCliente, quien, lote, didCuenta, ml_qr_seguridad, fecha_inicio, flex, exterior, fechaunix)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
        connection.query(sql, [did, idshipment, senderid, didcliente, quien, lote, didcuenta, ml_qr_seguridad, fecha_inicio, flex, externo, fechaunix], (err, result) => {
            if (err) {
                return reject(err);
            }

            idnuevo = result.insertId;

            if (idnuevo > -1) {
                const dataredis = {
                    idEmpresa: GLOBAL_empresa_id,
                    estado: 0,
                    did: idnuevo,
                    ml_shipment_id: idshipment,
                    ml_vendedor_id: senderid
                };

                // Enviar datos a Redis ML
                sendToRedisML(dataredis)
                    .then(() => {
                        // Actualizar el DID del paquete
                        const updateSql = `
                            UPDATE envios 
                            SET did = ? 
                            WHERE superado = 0 AND elim = 0 AND id = ? 
                            LIMIT 1
                        `;
                        connection.query(updateSql, [idnuevo, idnuevo], (err, result) => {
                            if (err) {
                                return reject(err);
                            }
                            resolve(idnuevo);
                        });
                    })
                    .catch((error) => {
                        console.error('Error enviando a Redis ML:', error);
                        resolve(idnuevo); // Continuar a pesar del error
                    });
            } else {
                resolve(idnuevo);
            }
        });
    });
}

// Función para marcar un paquete como retirado
async function ponerRetirado(didpaquete, connection, didquien) {
    const fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');
    console.log(didpaquete, "DSFDS");

    // Simular $_SESSION["user"]
    global.session = global.session || {};
    global.session["user"] = didquien;

    return await fsetestadoConector(didpaquete, 0, fecha, connection);
}

async function fsetestadoConector(did, estado, fecha, connection) {
    return new Promise((resolve, reject) => {
        // Obtener el usuario (simulando $_SESSION["user"] de PHP)
        const quien = global.session?.user || 0;
        // Obtener el estado actual
        const sqlEstado = `
        SELECT estado 
        FROM envios_historial 
        WHERE didEnvio = ? AND superado = 0 AND elim = 0
        `;
        
        connection.query(sqlEstado, [did], (err, results) => {
            if (err) {
                console.error("Error obteniendo estado actual:", err);
                return reject(err);
            }
            
            const estadoActual = results.length > 0 ? results[0].estado : -1;
console.log(estadoActual);


            // Si el estado es 5 o 9, no permite cambiarlo
            if (estadoActual === 5 || estadoActual === 9 || estadoActual === estado) {
                return resolve({ estado: false, mensaje: "No se pudo actualizar el estado." });
            }

            // Marcar registros anteriores como superados
            const sqlSuperado = `
                UPDATE envios_historial 
                SET superado = 1 
                WHERE superado = 0 AND didEnvio = ?
            `;

  
            connection.query(sqlSuperado, [did], (err) => {
                if (err) {
                    console.error("Error actualizando historial:", err);
                    return reject(err);
                }

                // Actualizar estado en la tabla `envios`
                const sqlActualizarEnvios = `
                    UPDATE envios 
                    SET estado_envio = ? 
                    WHERE superado = 0 AND did = ?
                `;

                connection.query(sqlActualizarEnvios, [estado, did], (err) => {
                    if (err) {
                        console.error("Error actualizando envíos:", err);
                        return reject(err);
                    }

                    // Obtener didCadete
                    const sqlDidCadete = `
                        SELECT operador 
                        FROM envios_asignaciones 
                        WHERE didEnvio = ? AND superado = 0 AND elim = 0
                    `;

                    connection.query(sqlDidCadete, [did], (err, results) => {
                        if (err) {
                            console.error("Error obteniendo didCadete:", err);
                            return reject(err);
                        }

                        const didCadete = results.length > 0 ? results[0].operador : 0;
                        const fechaT = fecha || new Date().toISOString().slice(0, 19).replace('T', ' ');

                        // Insertar en historial
                        const sqlInsertHistorial = `
                            INSERT INTO envios_historial (didEnvio, estado, quien, fecha, didCadete) 
                            VALUES (?, ?, ?, ?, ?)
                        `;

                        connection.query(sqlInsertHistorial, [did, estado, quien, fechaT, didCadete], (err) => {
                            if (err) {
                                console.error("Error insertando historial:", err);
                                return reject(err);
                            }

                            resolve({ estado: true, mensaje: "Se guardó correctamente" });
                        });
                    });
                });
            });
        });
    });
}



// Función para asignar un paquete a un chofer
async function asignarPaqueteChofer(didchofer, didpaquete, connection, autoasignar) {
    const AdidEnvio = [didpaquete];
    const user = autoasignar === 1 ? didchofer : 0;

    // Implementar la lógica de asignación de operador
    const sql = `
        UPDATE envios_asignaciones 
        SET operador = ? 
        WHERE didEnvio = ?
    `;

    return new Promise((resolve, reject) => {
        connection.query(sql, [didchofer, didpaquete], (err, result) => {
            if (err) {
                return reject(err);
            }
            resolve(result.affectedRows > 0);
        });
    });
}

// Función para crear una vinculación entre paquetes externos y locales
async function crearVinculacion(didpaquete_ext, didpaquete_local, connection, flex, nameexterno, idempresaExerna) {
    const sql = `
        INSERT INTO envios_exteriores (didLocal, didExterno, flex, cliente, didEmpresa)
        VALUES (?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
        connection.query(sql, [didpaquete_local, didpaquete_ext, flex, nameexterno, idempresaExerna], (err, result) => {
            if (err) {
                return reject(err);
            }
            resolve(result.insertId);
        });
    });
}

// Función auxiliar para generar un lote externo (simulación)
function generarLoteExterno() {
    return Math.random().toString(36).substring(2, 15); // Ejemplo de lote aleatorio
}






// Función principal `colecta`
async function colecta(dataQR,req) {
    const Aempresas2 = await iniciarProceso();
const AdataDB = Aempresas2[req.body.didempresa];


let response = "";
const connection = mysql.createConnection({
    host: "bhsmysql1.lightdata.com.ar",
    user: AdataDB.dbuser,
    password: AdataDB.dbpass,
    database: AdataDB.dbname
});
    
    const AempresasGlobal = Aempresas2 || {};
    //console.log(AempresasGlobal);
 
    const GLOBAL_empresa_id = req.body.didempresa || 0; 
    console.log(GLOBAL_empresa_id);// Asegurar que esté definido
 // console.log(AempresasGlobal[GLOBAL_empresa_id],"aa");
  
    
    const esflex = global.esflex || 0; // Asegurar que esté definido
    const db_host = global.db_host || ""; // Asegurar que esté definido
    const perfil = global.perfil || 0; // Asegurar que esté definido
    const quien = global.quien || 0; // Asegurar que esté definido
    const codigovinculacionMIO = global.codigovinculacionMIO || ""; // Asegurar que esté definido
    const esaplantanormal = global.esaplantanormal || false; // Asegurar que esté definido
    const aplantaNginforme = global.aplantaNginforme || false; // Asegurar que esté definido
    const Amiscuentas = global.Amiscuentas || {}; // Asegurar que esté definido

console.log(dataQR);


let AdataQR; // Declara AdataQR fuera del bloque if/else

if (typeof dataQR === 'object' && dataQR !== null) {
    // Si ya es un objeto, no necesitas hacer JSON.parse
    AdataQR = dataQR;
} else {
    // Si es una cadena, entonces procede con el replace y JSON.parse
    dataQR = dataQR.replace(/ /g, "");
    AdataQR = JSON.parse(dataQR);
}

    if (!AdataQR.did && !AdataQR.id) {

        return { estado: false, mensaje: "Los datos escaneados no son válidos" };
    }
    
    let todobien = false;
    let paquetecargado = false;
    let didpaquete = -1;
    let didcliente = -1;
    let didcuenta = -1;
    let estado_envio = -1;
    const autoasignar = req.body.autoasignar || 0; // Ajustar según tu contexto
    const quienpaquete = quien;
    let didClienteInforme = 0;
    let didenvioInforme = 0;
    
    if (AempresasGlobal[GLOBAL_empresa_id]) {
        const AdataEmpresaLocal = AempresasGlobal[GLOBAL_empresa_id];
        

        if (esflex) {
            if (GLOBAL_empresa_id == 149 || GLOBAL_empresa_id == 150) {
                AdataQR = JSON.parse(AdataQR.data);
            }

            const senderid = AdataQR.sender_id.replace(/ /g, "");
            const idshipment = AdataQR.id;
            const ml_qr_seguridad = dataQR;
            let tengoQR = false;

            if (Amiscuentas[senderid]) {
                didcliente = Amiscuentas[senderid].didcliente;
                didcuenta = Amiscuentas[senderid].didcuenta;
                didClienteInforme = didcliente;
            }

            // Busco si ya tengo el paquete en mi base de datos
            const sql = `
                SELECT did, estado_envio, didCliente, didCuenta, ml_qr_seguridad 
                FROM envios 
                WHERE superado = 0 AND elim = 0 AND ml_shipment_id = ? AND ml_vendedor_id = ? 
                LIMIT 1
            `;

            const [rows] = await connection.query(sql, [idshipment, senderid]);
            if (rows.length > 0) {
                const row = rows[0];
                didpaquete = row.did;
                didenvioInforme = didpaquete;
                estado_envio = row.estado_envio * 1;
                didcliente = row.didCliente;
                didcuenta = row.didCuenta;
                if (row.ml_qr_seguridad !== '') {
                    tengoQR = true;
                }
                paquetecargado = true;
            }

            if (didpaquete !== -1) {
                const sqlColectado = `
                    SELECT id 
                    FROM envios_historial 
                    WHERE didEnvio = ? AND estado = 0
                `;
                const [rowsColectado] = await connection.query(sqlColectado, [didpaquete]);
                if (rowsColectado.length > 0) {
                    return { estado: false, mensaje: "El paquete ya se encuentra colectado - FLEX" };
                }
            }

            if (!tengoQR && paquetecargado) {
                await insertoDataQR(didenvioInforme, AdataQR, connection);
            }

            // Me traigo todos los clientes externos que manejo en mi sistema
            if (didcliente === -1) {
                const Aexternas = [];
                const sqlExternas = `
                    SELECT did, nombre_fantasia, codigoVinculacionLogE 
                    FROM clientes 
                    WHERE superado = 0 AND elim = 0 AND codigoVinculacionLogE != ''
                `;
                const [rowsExternas] = await connection.query(sqlExternas);
                rowsExternas.forEach(row => Aexternas.push(row));

                let paqueteExternoInsertdo = false;

                for (const clienteexterno of Aexternas) {
                    const codigovinculacion = clienteexterno.codigoVinculacionLogE;
                    const dataEmpresaExterna = await empresaDuenia(codigovinculacion);
                    const didclienteLocal_ext = clienteexterno.did;
                    const idempresaExterna = dataEmpresaExterna.id;
                    const nombre_fantasia = clienteexterno.nombre_fantasia;

                    if (dataEmpresaExterna) {
                        let clienteExiste_ext = false;
                        let didcliente_ext = -1;
                        let didcuenta_ext = -1;

                        const connectionE = await mysql.createConnection({
                            host: db_host,
                            user: dataEmpresaExterna.dbuser,
                            password: dataEmpresaExterna.dbpass,
                            database: dataEmpresaExterna.dbname
                        });

                        const sqlCuentas = `
                            SELECT did, didCliente 
                            FROM clientes_cuentas 
                            WHERE superado = 0 AND elim = 0 AND tipoCuenta = 1 AND ML_id_vendedor = ?
                        `;
                        const [rowsCuentas] = await connectionE.query(sqlCuentas, [senderid]);
                        if (rowsCuentas.length > 0) {
                            const row = rowsCuentas[0];
                            didcliente_ext = row.didCliente;
                            didcuenta_ext = row.did;
                            clienteExiste_ext = true;
                        }

                        if (clienteExiste_ext) {
                            let paqueteExistente = false;
                            let didpaquete_ext = -1;

                            const sqlEnvios = `
                                SELECT did, estado_envio, didCliente, didCuenta 
                                FROM envios 
                                WHERE superado = 0 AND elim = 0 AND ml_shipment_id = ? AND ml_vendedor_id = ? 
                                LIMIT 1
                            `;
                            const [rowsEnvios] = await connectionE.query(sqlEnvios, [idshipment, senderid]);
                            if (rowsEnvios.length > 0) {
                                didpaquete_ext = rowsEnvios[0].did;
                                paqueteExistente = true;
                            }

                            if (!paqueteExistente) {
                                didpaquete_ext = await insertarPaquete(didcliente_ext, didcuenta_ext, AdataQR, connectionE, 1, 0, idempresaExterna);
                            }

                            if (didpaquete_ext !== -1) {
                                const didpaquete_local = await insertarPaquete(didclienteLocal_ext, 0, AdataQR, connection, 1, 1, GLOBAL_empresa_id);
                                
                                if (didpaquete_local !== -1) {
                                    await crearVinculacion(didpaquete_ext, didpaquete_local, connection, 1, nombre_fantasia, idempresaExterna);

                                    const sqlChofer = `
                                        SELECT usuario 
                                        FROM sistema_usuarios_accesos 
                                        WHERE superado = 0 AND elim = 0 AND codvinculacion = ?
                                    `;
                                    const [rowsChofer] = await connectionE.query(sqlChofer, [codigovinculacionMIO]);
                                    const didchofer = rowsChofer.length > 0 ? rowsChofer[0].usuario : -1;

                                    if (didchofer > -1) {
                                        didClienteInforme = didclienteLocal_ext;
                                        didenvioInforme = didpaquete_local;

                                        await asignarPaqueteChofer(didchofer, didpaquete_ext, connectionE, 0);
                                        await ponerRetirado(didpaquete_local, connection, quienpaquete);
                                        await ponerRetirado(didpaquete_ext, connectionE, didchofer);
                                        paqueteExternoInsertdo = true;
                                    }
                                }
                            }
                        }
                        await connectionE.end();
                    }
                }


                if (!paqueteExternoInsertdo) {
                   
                    if (Aexternas.length === 0) {
                        return { estado: false, mensaje: "NO hay datos cargados para este ID de vendedor" };
                    } else {
                 
                        return { estado: false, mensaje: "Error al querer insertar el paquete (FE) - FLEX" };
                    }
                }
            } else {
                // Verifico si está cargado
                if (paquetecargado) {
            
                    if (estado_envio === 0) {
                        return { estado: false, mensaje: "El paquete ya se encuentra colectado - FLEX" };
                    } else {
                        didenvioInforme = didpaquete;
                        const ok = await ponerRetirado(didpaquete, connection, quienpaquete);
                        if (ok) {
                            todobien = true;
                        } else {
                            return { estado: true, mensaje: "Paquete insertado y error de puesto a planta (L1)- FLEX" };
                        }
                    }
                } else {
                   
                    
                    const didpaquete_local = await insertarPaquete(didcliente, 0, AdataQR, connection, 1, 0, GLOBAL_empresa_id);
                    await insertoDataQR(didpaquete_local, AdataQR, connection);
                    if (didpaquete_local !== -1) {
                        didenvioInforme = didpaquete_local;
                        const ok = await ponerRetirado(didpaquete_local, connection, quienpaquete);
                        if (autoasignar === 1) {
                            await asignarPaqueteChofer(quienpaquete, didpaquete_local, connection, 1);
                        }
                        if (ok) {
                            todobien = true;
                        } else {
                            return { estado: false, mensaje: "Paquete insertado y error de puesto a planta (L2) - FLEX" };
                        }
                    } else {
                        return { estado: false, mensaje: "Error al querer insertar el paquete - FLEX" };
                    }
                }
            }
        } else {
         
         
            
            // Lógica para el caso NOFLEX
            const esmio = (GLOBAL_empresa_id === AdataQR.empresa);
            const didclientePaquete = AdataQR.cliente;
            const didenvioPaquete = AdataQR.did;
            const didempresa = AdataQR.empresa;
            
            if (esmio) {
              
                didClienteInforme = didclientePaquete;
                didenvioInforme = didenvioPaquete;

                if (didenvioPaquete !== -1) {
                    const sqlColectado = `
                        SELECT id 
                        FROM envios_historial 
                        WHERE didEnvio = ? AND estado = 0
                    `;
                   
                    
                    const query = connection.query(sqlColectado, [didenvioPaquete], (error, rowsColectado, fields) => {
                        if (error) {
                            console.error("Error en la consulta SQL:", error);
                            return { estado: false, mensaje: "Error en la consulta SQL" };
                        }
                        console.log(rowsColectado.length,"a");
                    
                        // Verificar si hay resultados
                        if (rowsColectado.length>0) {
                            console.log("gola");
                            
                            return { estado: false, mensaje: "El paquete ya se encuentra colectado - NOFLEX" };
                        }
                    
                        // Si no hay ningún paquete colectado, puedes proceder con otra lógica
                        // Aquí puedes agregar la lógica adicional para manejar cuando el paquete no esté colectado.
                    });
                    
                
                
                }

                // Si es mío
               // let estado_envio = -1;
                const sqlEstado = `
                    SELECT estado_envio 
                    FROM envios 
                    WHERE superado = 0 AND elim = 0 AND did = ? 
                    LIMIT 1
                `;

                
           
                        try {
                            // Extraer datos del paquete
                            const esmio = (GLOBAL_empresa_id === AdataQR.empresa);
                            const didclientePaquete = AdataQR.cliente;
                            const didenvioPaquete = AdataQR.did;
                    
                            if (!esmio) {
                                return { estado: false, mensaje: "No es tu paquete" };
                            }
                    
                            // Verificar si el paquete ya está colectado
                            const sqlColectado = `SELECT id FROM envios_historial WHERE didEnvio = ? AND estado = 0`;
                            console.log(didenvioPaquete, "didi");
                    
                            const rowsColectado = await connection.query(sqlColectado, [didenvioPaquete]);
                            if (rowsColectado.length > 0) {
                                return { estado: false, mensaje: "El paquete ya se encuentra colectado - NOFLEX" };
                            }
                    
                            // Verificar estado del envío
                            const sqlEstado = `SELECT estado_envio FROM envios WHERE superado = 0 AND elim = 0 AND did = ? LIMIT 1`;
                            const rowsEstado = await connection.query(sqlEstado, [didenvioPaquete]);
                    
                            if (rowsEstado.length === 0) {
                                return { estado: false, mensaje: "Paquete no encontrado" };
                            }
            //        console.log(rowsEstado[0]);
                    
              //              const estado_envio = rowsEstado[0].estado_envio;
                //            if (estado_envio === 0) {
                  //              return { estado: false, mensaje: "El paquete ya se encuentra retirado" };
                    //        }
                    
                            // Marcar como retirado
                            const ok = await ponerRetirado(didenvioPaquete, connection, quienpaquete);
                           
                         
                           
                            if (ok) {
                                todobien= true
                            } else {
                                return { estado: false, mensaje: "Paquete insertado y error de puesto a planta (NOL2)" };
                            }
                        } catch (error) {
                            console.error("Error en la consulta SQL:", error);
                            return { estado: false, mensaje: "Error en la consulta SQL" };
                        }
                    }
                    
            else {
      
                let yaestacargado = false;
                let didenvio = 0;

                const sqlExterno = `
                    SELECT didLocal 
                    FROM envios_exteriores 
                    WHERE superado = 0 AND elim = 0 AND didExterno = ? AND didEmpresa = ?
                `;

                const rowsExterno = await new Promise((resolve, reject) => {
                    connection.query(sqlExterno, [didenvioPaquete, didempresa], (err, results) => {
                        if (err) return reject(err);
                        resolve(results);
                    });
                });
                
                
                if (rowsExterno.length > 0) {
                    didenvio = rowsExterno[0].didLocal;
                    yaestacargado = true;
                }

                if (!yaestacargado) {
                    // BUSCO EN MIS CLIENTES
                    const Aexternas = [];
                    const sqlExternas = `
                        SELECT did, nombre_fantasia, codigoVinculacionLogE 
                        FROM clientes 
                        WHERE superado = 0 AND elim = 0 AND codigoVinculacionLogE != ''
                    `;
                    const rowsExternas = await new Promise((resolve, reject) => {
                        connection.query(sqlExternas, (err, results) => {
                            if (err) return reject(err);
                            resolve(results);
                        });
                    });
                    
                    rowsExternas.forEach(row => Aexternas.push(row));

                    let procesado = false;
                    
                    for (const clienteexterno of Aexternas) {
                        const codigovinculacion = clienteexterno.codigoVinculacionLogE;
                        
                        
                        
                        const dataEmpresaExterna = await empresaDuenia(codigovinculacion,AempresasGlobal);
                        const idempresaExterna = dataEmpresaExterna.id;
                        const nombre_fantasia = clienteexterno.nombre_fantasia;
                        const didclienteExterior = clienteexterno.did;
                        
                        if (idempresaExterna !== didempresa) {
                            continue;  
                        }
                        if (dataEmpresaExterna) {
                            const temp = { id: "", sender_id: "" };
                       
                            
                            const didlocal = await insertarPaquete(didclienteExterior, 0, temp, connection, 0, 1, idempresaExterna);
                    

                            if (autoasignar === 1) {
                             
                                await asignarPaqueteChofer(quienpaquete, didlocal, connection, 1);
                            }

                            didenvioInforme = didlocal;

                            const connectionE = await mysql.createConnection({
                                host: db_host,
                                user: dataEmpresaExterna.dbuser,
                                password: dataEmpresaExterna.dbpass,
                                database: dataEmpresaExterna.dbname
                            });

                            // Busco el nombre del cliente externo
                            const sqlNombre = `
                                SELECT cl.nombre_fantasia 
                                FROM envios as e 
                                JOIN clientes as cl ON (cl.superado = 0 AND cl.elim = 0 AND cl.did = e.didCliente) 
                                WHERE e.superado = 0 AND e.elim = 0 AND e.did = ?
                            `;
                            const [rowsNombre] = await connectionE.query(sqlNombre, [didenvioPaquete]);
                            const nombre_fantasia_ext = rowsNombre.length > 0 ? rowsNombre[0].nombre_fantasia : "";

                            // Insertar datos vinculantes
                            await crearVinculacion(didenvioPaquete, didlocal, connection, 0, nombre_fantasia_ext, idempresaExterna);

                            const sqlChofer = `
                                SELECT usuario 
                                FROM sistema_usuarios_accesos 
                                WHERE superado = 0 AND elim = 0 AND codvinculacion = ?
                            `;
                            const [rowsChofer] = await connectionE.query(sqlChofer, [codigovinculacionMIO]);
                    
                            
                            const didchofer = rowsChofer.length > 0 ? rowsChofer[0].usuario : -1;

                            if (didchofer > -1) {
                              
                                
                                didClienteInforme = didclienteExterior;

                                await asignarPaqueteChofer(didchofer, didenvioPaquete, connectionE, 0);
                                const ok = await ponerRetirado(didlocal, connection, quienpaquete);
                                if (ok) {
                                    await ponerRetirado(didenvioPaquete, connectionE, didchofer);
                                    procesado = true;
                                }
                            }
                            await connectionE.end();
                        }
                    }


                    if (procesado) {
                        todobien = true;
                    } else {
                     
                        
                        return { estado: false, mensaje: "Error al querer insertar el paquete (FE)" };
                    }
                } else {
                    // ESTO ES PARA VER SI YA TENGO UN EXTERNO NOFLEX EN MI BASE Y ACTUALIZO ESTADO
                    let estado_envio = -1;
                    const sqlEstado = `
                        SELECT estado_envio 
                        FROM envios 
                        WHERE superado = 0 AND elim = 0 AND did = ? 
                        LIMIT 1
                    `;
             
                    
                    const [rowsEstado] = await connection.query(sqlEstado, [didenvio]);
                    console.log(rowsEstado);
                    if (rowsEstado.length > 0) {
            
                        
                        estado_envio = rowsEstado[0].estado_envio;
                    }

                    didenvioInforme = didenvio;

                    if (estado_envio === 0) {
                        return { estado: false, mensaje: "El paquete ya se encuentra colectado E2", cliente: 0 };
                    } else {
                        const ok = await ponerRetirado(didenvio, connection, quienpaquete);
                  
                        
                        if (ok) {
                            todobien = true;
                        } else {
                            
                            return { estado: false, mensaje: "Paquete insertado y error de colectado (NOL2)" };
                        }
                    }
                }
            }
       
        }
    
        // Obtengo los totales del chofer
        if (todobien) {
          
            if (!esaplantanormal) {
          
                
               
                const res = await informePro(perfil, quien, connection);
                const { colectados, nuevosColectados } = res;
                console.log(res);
                


                return {
                    
                    estado: true,
                    mensaje: JSON.stringify({ mensaje: "Paquete insertado y colectado", colectados, nuevosColectados })
                };
            } else {
             
                if (!aplantaNginforme) {
                    const res = await informe(perfil, quien, connection);
                    const { aretirar, didCliente, namecliente } = res;
                    const soy = quien;
                    return {
                        estado: true,
                        mensaje: "ingresado",
                        aretirar,
                        didcliente: didCliente,
                        namecliente,
                        soy
                    };
                } else {                    if (perfil === 3 && autoasignar === 1) {
                    const res = await informe(perfil, quien, connection);
                    const { aretirar, didCliente, namecliente } = res;
                    return {
                        estado: true,
                        mensaje: "Paquete ingresado y asignado automáticamente",
                        aretirar,
                        didcliente: didCliente,
                        namecliente,
                        soy: quien
                    };
                } else {
                    return {
                        estado: true,
                        mensaje: "Paquete ingresado, pero no se asignó automáticamente",
                    };
                }
            }
        }
    }

} else {
    return { estado: false, mensaje: "Error: La empresa no está registrada" };
}

return { estado: false, mensaje: "Error inesperado" };
}

             

// Iniciar el servidor
app.listen(3000, () => {
    console.log('Servidor Node.js escuchando en el puerto 3000');
});