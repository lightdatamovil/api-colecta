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
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";

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
    const shipmentIdFromDataQr = dataQr.did;
    const clientIdFromDataQr = dataQr.cliente;

    let dbDueña;

    try {
        const [rowEncargadaShipmentId] = await LightdataORM.select({
            dbConnection: db,
            table: "envios_exteriores",
            where: { didExterno: shipmentIdFromDataQr },
            select: ["didLocal"],
        });

        if (rowEncargadaShipmentId.didLocal) {
            /// Chequeo si el envio ya fue colectado, entregado o cancelado
            const estado = await checkearEstadoEnvio({ db, shipmentId: rowEncargadaShipmentId.didLocal });
            if (estado) return estado;
        }

        const companyDueña = await companiesService.getById(dataQr.empresa);

        /* 🧩 2. Conexión DB dueña */
        const dbConfigExt = getProductionDbConfig({
            host: hostProductionDb,
            port: portProductionDb,
            company: companyDueña,
        });

        dbDueña = await connectMySQL(dbConfigExt);

        const companyClientList = await companiesService.getClientsByCompany({
            db: dbDueña,
            companyId: companyDueña.did,
        });
        const client = companyClientList[clientIdFromDataQr];

        const driver = await checkIfExistLogisticAsDriverInDueñaCompany({
            db: dbDueña,
            syncCode: company.codigo,
        });

        if (!driver) {
            return { success: false, message: "No se encontró chofer asignado" };
        }

        const [rowDueñaClient] = await LightdataORM.select({
            dbConnection: db,
            table: "clientes",
            where: { codigoVinculacionLogE: companyDueña.codigo },
            select: ["did"],
            throwIfNotExists: true,
        });

        let encargadaShipmentId;

        if (rowEncargadaShipmentId) {
            encargadaShipmentId = rowEncargadaShipmentId.didLocal;
        } else {
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
        }

        await assign({
            url: urlAsignacionMicroservice,
            companyId: dataQr.empresa,
            userId,
            profile,
            dataQr,
            driverId: driver,
            deviceFrom: "Autoasignado de colecta",
        });

        if (autoAssign) {
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
        }

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
        }

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

        const body = await informe({
            db,
            company,
            clientId: rowDueñaClient.did,
            userId,
        });

        return { success: true, message: "Paquete colectado con éxito", body };
    } catch (error) {
        if (error.isAxiosError) throw error;
        throw new CustomException({
            title: "Error al procesar la colecta externa",
            message: error.message || "Error desconocido al procesar la colecta externa.",
        });
    } finally {
        if (dbDueña) await dbDueña.end();
    }
}
