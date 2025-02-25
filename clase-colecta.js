const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const redis = require('redis');
const { log } = require('util');
const util = require('util'); // Importa util para promisify
let Aempresas
const redisClient = redis.createClient({
    socket: {
        host: '192.99.190.137',
        port: 50301,
    },
    password: 'sdJmdxXC8luknTrqmHceJS48NTyzExQg',
});

class Colecta {
    constructor(connectionConfig, AempresasGlobal) {
        this.connectionConfig = connectionConfig; // Configuración de la conexión a la base de datos
        this.AempresasGlobal = AempresasGlobal;  // Datos globales de empresas
        this.connection = null;                  // Conexión a la base de datos
    }

    // Método para conectar a la base de datos
    async connect() {
        this.connection = mysql.createConnection(this.connectionConfig);
        return new Promise((resolve, reject) => {
            this.connection.connect((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // Método para desconectar de la base de datos
    async disconnect() {
        if (this.connection) {
            return new Promise((resolve, reject) => {
                this.connection.end((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
    }


async  actualizarEmpresas() {
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
async  iniciarProceso() {
    try {
        // Conectar a Redis
        await redisClient.connect();

        // Actualizar empresas antes de cerrar la conexión
       let empresas = await this.actualizarEmpresas(Aempresas);

        // Cerrar la conexión de Redis
        await redisClient.quit();
        console.log("Conexión a Redis cerrada.");
        return empresas
    } catch (error) {
        console.error("Error en el proceso:", error);
    }
}

    // Método para enviar datos a Redis ML
    async sendToRedisML(jsonData) {
        try {
            const response = await axios.post('https://altaenvios.lightdata.com.ar/api/enviosMLredis', jsonData, {
                headers: { 'Content-Type': 'application/json' }
            });
            return response.data;
        } catch (error) {
            console.error('Error enviando datos a Redis ML:', error);
            throw error;
        }
    }

    // Método para obtener el informe de retiros
    async informe(perfil, quien) {
        const sql = `
            SELECT COUNT(eh.id) as total, CONCAT(su.nombre, ' ', su.apellido) as cadete
            FROM envios_historial as eh
            JOIN sistema_usuarios as su ON (su.elim = 0 AND su.superado = 0 AND su.did = eh.quien)
            WHERE eh.superado = 0 AND eh.estado = 0 AND eh.quien = ?
            GROUP BY eh.quien
        `;

        return new Promise((resolve, reject) => {
            this.connection.query(sql, [quien], (err, result) => {
                if (err) return reject(err);

                const row = result[0] || {};
                resolve({
                    namecliente: row.cadete || "",
                    aretirar: row.total || 0
                });
            });
        });
    }

    // Método para obtener el informe profesional
    async informePro(perfil, quien) {
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
            WHERE fecha_inicio > ? AND superado = 0 AND elim = 0
        `;

        return new Promise((resolve, reject) => {
            this.connection.query(sqlColectados, [hoy], (err, result) => {
                if (err) return reject(err);

                colectados = result[0]?.total || 0;

                this.connection.query(sqlNuevosColectados, [hoy], (err, result) => {
                    if (err) return reject(err);

                    nuevosColectados = result[0]?.total || 0;
                    resolve({
                        colectados: colectados.toString(),
                        nuevosColectados: nuevosColectados.toString()
                    });
                });
            });
        });
    }

    // Método para obtener los totales de un cliente
    async obtenerToTales(didCliente, quien, didenvio) {
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
            this.connection.query(sqlCliente, [didCliente], (err, result) => {
                if (err) return reject(err);

                clientename = result[0]?.nombre_fantasia || "";

                this.connection.query(sqlIngresadosHoy, [`${hoy} 00:00:00`, `${hoy} 23:59:59`, didCliente], (err, result) => {
                    if (err) return reject(err);

                    ingresadoshot = result[0]?.total || 0;

                    this.connection.query(sqlClienteTotal, [didCliente], (err, result) => {
                        if (err) return reject(err);

                        cliente_total = result[0]?.total || 0;

                        this.connection.query(sqlDatosPaquete, [didenvio], (err, result) => {
                            if (err) return reject(err);

                            choferasignado = result[0]?.chofer || "";
                            zonaentrega = result[0]?.zona || "";

                            this.connection.query(sqlRetiradosHoyMi, [quien, `${hoy} 00:00:00`, `${hoy} 23:59:59`], (err, result) => {
                                if (err) return reject(err);

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


    async insertoDataQR(didEnvio, AdataQR) {
            const ml_qr_seguridad = JSON.stringify(AdataQR);
            const sql = `
                UPDATE envios 
                SET ml_qr_seguridad = ?
                WHERE superado = 0 AND elim = 0 AND did = ?
                LIMIT 1
            `;
    
            return new Promise((resolve, reject) => {
                this.connection.query(sql, [ml_qr_seguridad, didEnvio], (err, result) => {
                    if (err) return reject(err);
                    resolve(result.affectedRows > 0);
                });
            });
        }
    
        // Método para insertar un nuevo paquete en la base de datos
        async insertarPaquete(didcliente, didcuenta, AdataQR, flex, externo, idempresa) {
            const lote = this.generarLoteExterno(); // Generar lote externo
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
                this.connection.query(sql, [did, idshipment, senderid, didcliente, quien, lote, didcuenta, ml_qr_seguridad, fecha_inicio, flex, externo, fechaunix], (err, result) => {
                    if (err) return reject(err);
    
                    idnuevo = result.insertId;
    
                    if (idnuevo > -1) {
                        const dataredis = {
                            idEmpresa: idempresa,
                            estado: 0,
                            did: idnuevo,
                            ml_shipment_id: idshipment,
                            ml_vendedor_id: senderid
                        };
    
                        // Enviar datos a Redis ML
                        this.sendToRedisML(dataredis)
                            .then(() => {
                                // Actualizar el DID del paquete
                                const updateSql = `
                                    UPDATE envios 
                                    SET did = ? 
                                    WHERE superado = 0 AND elim = 0 AND id = ? 
                                    LIMIT 1
                                `;
                                this.connection.query(updateSql, [idnuevo, idnuevo], (err, result) => {
                                    if (err) return reject(err);
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
    
        // Método para marcar un paquete como retirado
        async ponerRetirado(didpaquete, didquien) {
            const fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');
            return await this.fsetestadoConector(didpaquete, 0, fecha, didquien);
        }
    
        // Método para cambiar el estado de un paquete
        async fsetestadoConector(did, estado, fecha, didquien,connection) {
            return new Promise((resolve, reject) => {
                const sqlEstado = `
                    SELECT estado 
                    FROM envios_historial 
                    WHERE didEnvio = ? AND superado = 0 AND elim = 0
                `;
    
                connection.query(sqlEstado, [did], (err, results) => {
                    if (err) return reject(err);
    
                    const estadoActual = results.length > 0 ? results[0].estado : -1;
    
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
                        if (err) return reject(err);
    
                        // Actualizar estado en la tabla `envios`
                        const sqlActualizarEnvios = `
                            UPDATE envios 
                            SET estado_envio = ? 
                            WHERE superado = 0 AND did = ?
                        `;
    
                        connection.query(sqlActualizarEnvios, [estado, did], (err) => {
                            if (err) return reject(err);
    
                            // Obtener didCadete
                            const sqlDidCadete = `
                                SELECT operador 
                                FROM envios_asignaciones 
                                WHERE didEnvio = ? AND superado = 0 AND elim = 0
                            `;
    
                            connection.query(sqlDidCadete, [did], (err, results) => {
                                if (err) return reject(err);
    
                                const didCadete = results.length > 0 ? results[0].operador : 0;
                                const fechaT = fecha || new Date().toISOString().slice(0, 19).replace('T', ' ');
    
                                // Insertar en historial
                                const sqlInsertHistorial = `
                                    INSERT INTO envios_historial (didEnvio, estado, quien, fecha, didCadete) 
                                    VALUES (?, ?, ?, ?, ?)
                                `;
    
                                connection.query(sqlInsertHistorial, [did, estado, didquien, fechaT, didCadete], (err) => {
                                    if (err) return reject(err);
    
                                    resolve({ estado: true, mensaje: "Se guardó correctamente" });
                                });
                            });
                        });
                    });
                });
            });
        }
    
        // Método para asignar un paquete a un chofer
        async asignarPaqueteChofer(didchofer, didpaquete, autoasignar) {
            const sql = `
                UPDATE envios_asignaciones 
                SET operador = ? 
                WHERE didEnvio = ?
            `;
    
            return new Promise((resolve, reject) => {
                this.connection.query(sql, [didchofer, didpaquete], (err, result) => {
                    if (err) return reject(err);
                    resolve(result.affectedRows > 0);
                });
            });
        }
    
        // Método para crear una vinculación entre paquetes
        async crearVinculacion(didpaquete_ext, didpaquete_local, flex, nameexterno, idempresaExerna) {
            const sql = `
                INSERT INTO envios_exteriores (didLocal, didExterno, flex, cliente, didEmpresa)
                VALUES (?, ?, ?, ?, ?)
            `;
    
            return new Promise((resolve, reject) => {
                this.connection.query(sql, [didpaquete_local, didpaquete_ext, flex, nameexterno, idempresaExerna], (err, result) => {
                    if (err) return reject(err);
                    resolve(result.insertId);
                });
            });
        }
        async empresaDuenia(codigo, AempresasGlobal) {
            const empresa = Object.values(AempresasGlobal).find(empresa => empresa.codigo === codigo);
            return empresa || {}; // Retorna la empresa si la encuentra, o un objeto vacío si no.
        }
        

        async colecta(dataQR, req) {
            try {
                const Aempresas2 = await this.iniciarProceso();
                const AdataDB = Aempresas2[req.body.didempresa];
        
                if (!AdataDB) {
                    throw new Error("Empresa no encontrada en AempresasGlobal");
                }
        
                // Configurar conexión a la base de datos
                const connection = mysql.createConnection({
                    host: "bhsmysql1.lightdata.com.ar",
                    user: AdataDB.dbuser,
                    password: AdataDB.dbpass,
                    database: AdataDB.dbname
                });
        
                await new Promise((resolve, reject) => {
                    connection.connect((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
        
                const AempresasGlobal = Aempresas2 || {};
                const GLOBAL_empresa_id = req.body.didempresa || 0;
        
                // Variables globales simuladas (originalmente de PHP)
                const esflex = global.esflex || 0;
                const db_host = global.db_host || "";
                const perfil = global.perfil || 0;
                const quien = global.quien || 0;
                const codigovinculacionMIO = global.codigovinculacionMIO || "";
                const esaplantanormal = global.esaplantanormal || false;
                const aplantaNginforme = global.aplantaNginforme || false;
                const Amiscuentas = global.Amiscuentas || {};
        
                // Procesar el QR
                let AdataQR;
                if (typeof dataQR === 'object' && dataQR !== null) {
                    AdataQR = dataQR;
                } else {
                    dataQR = dataQR.replace(/ /g, "");
                    AdataQR = JSON.parse(dataQR);
                }
        
                if (!AdataQR.did && !AdataQR.id) {
                    throw new Error("Los datos escaneados no son válidos");
                }
        
                // Variables de estado
                let todobien = false;
                let paquetecargado = false;
                let didpaquete = -1;
                let didcliente = -1;
                let didcuenta = -1;
                let estado_envio = -1;
                const autoasignar = req.body.autoasignar || 0;
                const quienpaquete = quien;
                let didClienteInforme = 0;
                let didenvioInforme = 0;
        
                // Lógica para FLEX
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
        
                    // Buscar si el paquete ya está cargado
                    const sql = `
                        SELECT did, estado_envio, didCliente, didCuenta, ml_qr_seguridad 
                        FROM envios 
                        WHERE superado = 0 AND elim = 0 AND ml_shipment_id = ? AND ml_vendedor_id = ? 
                        LIMIT 1
                    `;
        
                    const [rows] = await new Promise((resolve, reject) => {
                        connection.query(sql, [idshipment, senderid], (err, results) => {
                            if (err) reject(err);
                            else resolve(results);
                        });
                    });
        
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
        
                    // Verificar si el paquete ya está colectado
                    if (didpaquete !== -1) {
                        const sqlColectado = `
                            SELECT id 
                            FROM envios_historial 
                            WHERE didEnvio = ? AND estado = 0
                        `;
                        const [rowsColectado] = await new Promise((resolve, reject) => {
                            connection.query(sqlColectado, [didpaquete], (err, results) => {
                                if (err) reject(err);
                                else resolve(results);
                            });
                        });
        
                        if (rowsColectado.length > 0) {
                            throw new Error("El paquete ya se encuentra colectado - FLEX");
                        }
                    }
        
                    // Insertar datos del QR si no están cargados
                    if (!tengoQR && paquetecargado) {
                        await this.insertoDataQR(didenvioInforme, AdataQR, connection);
                    }
        
       
                }
                if (!esflex) {
                    const esmio = (GLOBAL_empresa_id === AdataQR.empresa);
                    const didclientePaquete = AdataQR.cliente;
                    const didenvioPaquete = AdataQR.did;
                    const didempresa = AdataQR.empresa;
        
                    if (!esmio) {
                        // Buscar si el paquete ya está vinculado
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
        
                        let didenvio = 0;
                        let yaestacargado = false;
     
        
                        if (rowsExterno.length > 0) {
                            didenvio = rowsExterno[0].didLocal;
                            yaestacargado = true;
                        }
        
                        if (!yaestacargado) {
                            // Buscar clientes externos
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
                                const dataEmpresaExterna = await this.empresaDuenia(codigovinculacion, AempresasGlobal);
                                const idempresaExterna = dataEmpresaExterna.id;
                                const nombre_fantasia = clienteexterno.nombre_fantasia;
                                const didclienteExterior = clienteexterno.did;
        
                                if (idempresaExterna !== didempresa) {
                                    continue;
                                }
                                console.log("hola");
        
                                if (dataEmpresaExterna) {
                                    const temp = { id: "", sender_id: "" };
                                    const didlocal = await this.insertarPaquete(didclienteExterior, 0, temp, connection, 0, 1, idempresaExterna);
        
                                    if (autoasignar === 1) {
                                        await this.asignarPaqueteChofer(quienpaquete, didlocal, connection, 1);
                                    }
        
                                    didenvioInforme = didlocal;
        
                                    const connectionE = mysql.createConnection({
                                        host: db_host,
                                        user: dataEmpresaExterna.dbuser,
                                        password: dataEmpresaExterna.dbpass,
                                        database: dataEmpresaExterna.dbname
                                    });
        
                                    await new Promise((resolve, reject) => {
                                        connectionE.connect((err) => {
                                            if (err) reject(err);
                                            else resolve();
                                        });
                                    });
        
                                    // Buscar nombre del cliente externo
                                    const sqlNombre = `
                                        SELECT cl.nombre_fantasia 
                                        FROM envios as e 
                                        JOIN clientes as cl ON (cl.superado = 0 AND cl.elim = 0 AND cl.did = e.didCliente) 
                                        WHERE e.superado = 0 AND e.elim = 0 AND e.did = ?
                                    `;
        
                                    const [rowsNombre] = await new Promise((resolve, reject) => {
                                        connectionE.query(sqlNombre, [didenvioPaquete], (err, results) => {
                                            if (err) reject(err);
                                            else resolve(results);
                                        });
                                    });
        
                                    const nombre_fantasia_ext = rowsNombre.length > 0 ? rowsNombre[0].nombre_fantasia : "";
        
                                    // Crear vinculación
                                    await this.crearVinculacion(didenvioPaquete, didlocal, connection, 0, nombre_fantasia_ext, idempresaExterna);
        
                                    // Asignar chofer
                                    const sqlChofer = `
                                        SELECT usuario 
                                        FROM sistema_usuarios_accesos 
                                        WHERE superado = 0 AND elim = 0 AND codvinculacion = ?
                                    `;
        
                                    const [rowsChofer] = await new Promise((resolve, reject) => {
                                        connectionE.query(sqlChofer, [codigovinculacionMIO], (err, results) => {
                                            if (err) reject(err);
                                            else resolve(results);
                                        });
                                    });
        
                                    const didchofer = rowsChofer.length > 0 ? rowsChofer[0].usuario : -1;
        
                                    if (didchofer > -1) {
                                        didClienteInforme = didclienteExterior;
        
                                        await this.asignarPaqueteChofer(didchofer, didenvioPaquete, connectionE, 0);
                                        const ok = await this.ponerRetirado(didlocal, connection, quienpaquete);
                                        if (ok) {
                                            await this.ponerRetirado(didenvioPaquete, connectionE, didchofer);
                                            procesado = true;
                                        }
                                    }
        
                                    await new Promise((resolve, reject) => {
                                        connectionE.end((err) => {
                                            if (err) reject(err);
                                            else resolve();
                                        });
                                    });
                                }
                            }
        
                            if (procesado) {
                                todobien = true;
                            } else {
                                throw new Error("Error al querer insertar el paquete (FE)");
                            }
                        } else {
                            // Verificar estado del paquete
                            let estado_envio = -1;
                            const sqlEstado = `
                                SELECT estado_envio 
                                FROM envios 
                                WHERE superado = 0 AND elim = 0 AND did = ? 
                                LIMIT 1
                            `;
        
                            const [rowsEstado] = await new Promise((resolve, reject) => {
                                connection.query(sqlEstado, [didenvio], (err, results) => {
                                    if (err) reject(err);
                                    else resolve(results);
                                });
                            });
        
                            if (rowsEstado.length > 0) {
                                estado_envio = rowsEstado[0].estado_envio;
                            }
        
                            didenvioInforme = didenvio;
        
                            if (estado_envio === 0) {
                                throw new Error("El paquete ya se encuentra colectado E2");
                            } else {
                                const ok = await this.ponerRetirado(didenvio, connection, quienpaquete);
                                if (ok) {
                                    todobien = true;
                                } else {
                                    throw new Error("Paquete insertado y error de colectado (NOL2)");
                                }
                            }
                        }
                    } else {
                        // Lógica para paquetes propios (NO FLEX)
                        const sqlColectado = `
                            SELECT id 
                            FROM envios_historial 
                            WHERE didEnvio = ? AND estado = 0
                        `;
        
                        const [rowsColectado] = await new Promise((resolve, reject) => {
                            connection.query(sqlColectado, [didenvioPaquete], (err, results) => {
                                if (err) reject(err);
                                else resolve(results);
                            });
                        });
        
                        if (rowsColectado.length > 0) {
                            throw new Error("El paquete ya se encuentra colectado - NO FLEX");
                        }
        
                        const ok = await this.ponerRetirado(didenvioPaquete, connection, quienpaquete);
                        if (!ok) {
                            throw new Error("Error al marcar el paquete como retirado - NO FLEX");
                        }
        
                        todobien = true;
                    }
                }
        
                // Obtener informe si todo está bien
                if (todobien) {
                    const res = await this.informePro(perfil, quien, connection);
                    return {
                        estado: true,
                        mensaje: JSON.stringify({ mensaje: "Paquete procesado correctamente", colectados: res.colectados, nuevosColectados: res.nuevosColectados })
                    };
                } else {
                    throw new Error("Error inesperado al procesar el paquete");
                }

            } catch (error) {
                console.error("Error en colecta:", error);
                return { estado: false, mensaje: error.message };
            } finally {
                if (connection) {
                    await new Promise((resolve, reject) => {
                        connection.end((err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                }
            }
        }
         
        
      
        generarLoteExterno() {
            return Math.random().toString(36).substring(2, 15); // Ejemplo de lote aleatorio
        }

    
    }


module.exports = Colecta;