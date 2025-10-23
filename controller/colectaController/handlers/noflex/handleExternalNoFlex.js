import { checkIfExistLogisticAsDriverInDueñaCompany } from "../../functions/checkIfExistLogisticAsDriverInDueñaCompany.js";
import { informe } from "../../functions/informe.js";
import {
    companiesService,
    hostProductionDb,
    portProductionDb,
    urlAsignacionMicroservice,
    urlEstadosMicroservice,
    axiosInstance,
    rabbitService,
    queueEstadosML,
    urlAltaEnvioMicroservice,
    urlAltaEnvioRedisMicroservice,
} from "../../../../db.js";
import {
    altaEnvioBasica,
    assign,
    connectMySQL,
    CustomException,
    EstadosEnvio,
    getProductionDbConfig,
    LightdataORM,
    sendShipmentStateToStateMicroserviceAPI,
} from "lightdata-tools";
import { logBlue, logGreen, logYellow, logRed } from "lightdata-tools"; // suponiendo que ya existen

export async function handleExternalNoFlex({
    db,
    dataQr,
    company,
    userId,
    profile,
    autoAssign,
    latitude,
    longitude,
}) {
    const globalStart = performance.now();
    logBlue(`🚀 [handleExternalNoFlex] Iniciando proceso para empresa ${company.did}`);

    const shipmentIdFromDataQr = dataQr.did;
    const clientIdFromDataQr = dataQr.cliente;
    let dbDueña;

    try {
        /* 🧩 1. Buscar empresa dueña */
        const t1 = performance.now();
        const companyDueña = await companiesService.getById(dataQr.empresa);
        const t2 = performance.now();
        logGreen(`🏢 Empresa dueña obtenida (${companyDueña.nombre}) en ${(t2 - t1).toFixed(2)} ms`);

        /* 🧩 2. Conexión DB dueña */
        const dbConfigExt = getProductionDbConfig({
            host: hostProductionDb,
            port: portProductionDb,
            company: companyDueña,
        });

        const t3 = performance.now();
        dbDueña = await connectMySQL(dbConfigExt);
        const t4 = performance.now();
        logGreen(`🔌 Conectado a DB dueña en ${(t4 - t3).toFixed(2)} ms`);

        /* 🧩 3. Obtener cliente */
        const companyClientList = await companiesService.getClientsByCompany({
            db: dbDueña,
            companyId: companyDueña.did,
        });
        const client = companyClientList[clientIdFromDataQr];
        logBlue(`👤 Cliente en empresa dueña: ${client?.nombre}`);

        /* 🧩 4. Buscar chofer */
        const driver = await checkIfExistLogisticAsDriverInDueñaCompany({
            db: dbDueña,
            syncCode: company.codigo,
        });
        if (!driver) {
            logYellow("⚠️ No se encontró chofer asignado");
            return { success: false, message: "No se encontró chofer asignado" };
        }

        /* 🧩 5. Buscar cliente vinculado */
        const [rowDueñaClient] = await LightdataORM.select({
            dbConnection: db,
            table: "clientes",
            where: { codigoVinculacionLogE: companyDueña.codigo },
            select: ["did"],
            throwIfNotExists: true,
        });

        /* 🧩 6. Buscar si ya existe envío */
        let encargadaShipmentId;
        const [rowEncargadaShipmentId] = await LightdataORM.select({
            dbConnection: db,
            table: "envios_exteriores",
            where: { didExterno: shipmentIdFromDataQr },
            select: ["didLocal"],
        });

        if (rowEncargadaShipmentId) {
            encargadaShipmentId = rowEncargadaShipmentId.didLocal;
            logBlue(`📦 Envío externo ya existente → ${encargadaShipmentId}`);
        } else {
            const startAlta = performance.now();
            encargadaShipmentId = await altaEnvioBasica({
                urlAltaEnvioMicroservice,
                urlAltaEnvioRedisMicroservice,
                axiosInstance,
                rabbitServiceInstance: rabbitService,
                queueEstadosML,
                company,
                clientId: rowDueñaClient.did,
                accountId: 0,
                dataQr,
                flex: 0,
                externo: 1,
                userId,
                driverId: driver,
                lote: "colecta",
                didExterno: shipmentIdFromDataQr,
                nombreClienteEnEmpresaDueña: client.nombre,
                empresaDueña: companyDueña.did,
            });
            const endAlta = performance.now();
            logGreen(`✅ altaEnvioBasica completado en ${(endAlta - startAlta).toFixed(2)} ms`);
        }

        /* 🧩 7. Asignar a empresa dueña */
        const startAssignDueña = performance.now();
        logBlue(urlAsignacionMicroservice);
        await assign({
            url: urlAsignacionMicroservice,
            companyId: dataQr.empresa,
            userId,
            profile,
            dataQr,
            driverId: driver,
            deviceFrom: "Autoasignado de colecta",
        });
        const endAssignDueña = performance.now();
        logGreen(`📮 Asignación a empresa dueña en ${(endAssignDueña - startAssignDueña).toFixed(2)} ms`);

        /* 🧩 8. Asignar a interna si corresponde */
        if (autoAssign) {
            const startAssignInterna = performance.now();
            const dqr = {
                interno: dataQr.interno,
                did: encargadaShipmentId,
                cliente: clientIdFromDataQr,
                empresa: company.did,
            };

            await assign({
                url: urlAsignacionMicroservice,
                companyId: company.did,
                userId,
                profile,
                dqr,
                driverId: userId,
                deviceFrom: "Autoasignado de colecta",
            });
            const endAssignInterna = performance.now();
            logGreen(`📮 Asignación interna completada en ${(endAssignInterna - startAssignInterna).toFixed(2)} ms`);
        }

        /* 🧩 9. Logística inversa */
        const startInv = performance.now();
        const [rowLogisticaInversa] = await LightdataORM.select({
            dbConnection: dbDueña,
            table: "envios_logisticainversa",
            where: { didEnvio: shipmentIdFromDataQr },
            select: ["valor"],
        });

        if (rowLogisticaInversa) {
            await LightdataORM.insert({
                dbConnection: db,
                table: "envios_logisticainversa",
                data: {
                    didEnvio: encargadaShipmentId,
                    didCampoLogistica: 1,
                    valor: rowLogisticaInversa.valor,
                },
                quien: userId,
            });
            logBlue("↩️ Logística inversa copiada correctamente");
        }
        const endInv = performance.now();
        logGreen(`🔁 Logística inversa en ${(endInv - startInv).toFixed(2)} ms`);

        logBlue(urlEstadosMicroservice);
        /* 🧩 10. Actualizar estado en microservicio */
        const startEstado = performance.now();
        await sendShipmentStateToStateMicroserviceAPI({
            urlEstadosMicroservice,
            axiosInstance,
            company,
            userId,
            driverId: userId,
            shipmentId: encargadaShipmentId,
            estado: EstadosEnvio.value(EstadosEnvio.collected, company.did),
            latitude,
            longitude,
            desde: "Colecta App",
        });

        await sendShipmentStateToStateMicroserviceAPI({
            urlEstadosMicroservice,
            axiosInstance,
            company: companyDueña,
            userId,
            driverId: driver,
            shipmentId: shipmentIdFromDataQr,
            estado: EstadosEnvio.value(EstadosEnvio.collected, companyDueña.did),
            latitude,
            longitude,
            desde: "Colecta App",
        });
        const endEstado = performance.now();
        logGreen(`🚦 Actualización de estados completada en ${(endEstado - startEstado).toFixed(2)} ms`);

        /* 🧩 11. Informe final */
        const startInforme = performance.now();
        const body = await informe({
            db,
            company,
            clientId: rowDueñaClient.did,
            userId,
        });
        const endInforme = performance.now();
        logGreen(`📊 Informe generado en ${(endInforme - startInforme).toFixed(2)} ms`);

        const totalEnd = performance.now();
        logGreen(`🏁 [handleExternalNoFlex] Finalizado en ${(totalEnd - globalStart).toFixed(2)} ms`);

        return { success: true, message: "Paquete colectado con éxito", body };
    } catch (error) {
        logRed(`❌ Error en handleExternalNoFlex: ${error.message}`);
        if (error.isAxiosError) throw error;
        throw new CustomException({
            title: "Error al procesar la colecta externa",
            message: error.message || "Error desconocido al procesar la colecta externa.",
        });
    } finally {
        if (dbDueña) await dbDueña.end();
    }
}
