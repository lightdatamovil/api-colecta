import { insertEnvios } from "../../functions/insertEnvios.js";
import { insertEnviosExteriores } from "../../functions/insertEnviosExteriores.js";
import { checkIfExistLogisticAsDriverInDueñaCompany as checkIfExistLogisticAsDriverInDueñaCompany } from "../../functions/checkIfExistLogisticAsDriverInDueñaCompany.js";
import { informe } from "../../functions/informe.js";
import { insertEnviosLogisticaInversa } from "../../functions/insertLogisticaInversa.js";
import { companiesService, hostProductionDb, portProductionDb, urlAsignacionMicroservice, urlEstadosMicroservice, axiosInstance } from "../../../../db.js";
import { assign, connectMySQL, CustomException, EstadosEnvio, getProductionDbConfig, LightdataORM, sendShipmentStateToStateMicroserviceAPI } from "lightdata-tools";

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

    /// Busco la empresa dueña del envio y la empresa encargada de la colecta
    const companyDueña = await companiesService.getById(dataQr.empresa);

    /// Conecto a la base de datos de la empresa dueña del envío
    const dbConfigExt = getProductionDbConfig({
        host: hostProductionDb,
        port: portProductionDb,
        company: companyDueña
    });

    let dueñaDbConnection;

    try {
        dueñaDbConnection = await connectMySQL(dbConfigExt);

        const companyClientList = await companiesService.getClientsByCompany({
            db: dueñaDbConnection,
            companyId: companyDueña.did
        });

        const client = companyClientList[clientIdFromDataQr];

        /// Busco el chofer que se crea en la vinculacion de logisticas
        const driver = await checkIfExistLogisticAsDriverInDueñaCompany({
            db: dueñaDbConnection,
            syncCode: company.codigo
        });
        console.log("Driver encontrado en la empresa dueña del envío:", driver);
        if (!driver) {
            dueñaDbConnection.end();
            return { success: false, message: "No se encontró chofer asignado" };
        }

        const [rowDueñaClient] = await LightdataORM.select({
            dbConnection: dueñaDbConnection,
            table: 'clientes',
            where: { codigoVinculacionLogE: company.codigo },
            select: ['did'],
            throwIfNotExists: true,
        });

        let encargadaShipmentId;

        const [rowEncargadaShipmentId] = await LightdataORM.select({
            dbConnection: db,
            table: 'envios_exteriores',
            where: { didExterno: shipmentIdFromDataQr },
            select: ['didLocal'],
        });

        if (rowEncargadaShipmentId) {
            encargadaShipmentId = rowEncargadaShipmentId.didLocal;
        } else {
            encargadaShipmentId = await insertEnvios({
                company,
                clientId: rowDueñaClient.did,
                accountId: 0,
                dataQr: { id: "", sender_id: "" },
                externo: 1,
                flex: 0,
                userId,
                driverId: driver,
                cp: "",
            });
        }

        /// Inserto en envios exteriores en la empresa interna
        await insertEnviosExteriores(
            db,
            encargadaShipmentId,
            shipmentIdFromDataQr,
            0,
            client.nombre || "",
            companyDueña.did,
        );

        // Asigno a la empresa dueña del envío
        await assign({
            url: urlAsignacionMicroservice,
            companyId: dataQr.empresa,
            userId,
            profile,
            dataQr,
            driverId: driver,
            deviceFrom: "Autoasignado de colecta"
        });

        if (autoAssign) {
            const dqr = {
                interno: dataQr.interno,
                did: encargadaShipmentId,
                cliente: clientIdFromDataQr,
                empresa: company.did,
            };

            // Asigno a la empresa interna
            await assign({
                url: urlAsignacionMicroservice,
                companyId: company.did,
                userId,
                profile,
                dqr,
                driverId: userId,
                deviceFrom: "Autoasignado de colecta"
            });
        }

        const [rowLogisticaInversa] = await LightdataORM.select({
            dbConnection: dueñaDbConnection,
            table: 'envios_logisticainversa',
            where: { didEnvio: shipmentIdFromDataQr },
            select: ['valor'],
        });

        if (rowLogisticaInversa) {
            await insertEnviosLogisticaInversa({
                db,
                shipmentId: encargadaShipmentId,
                valor: rowLogisticaInversa.valor,
                userId,
            });
        }

        await sendShipmentStateToStateMicroserviceAPI({
            urlEstadosMicroservice,
            axiosInstance,
            company,
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
            userId
        });

        return { success: true, message: "Paquete colectado con exito", body };
    } catch (error) {
        if (error.isAxiosError) {
            throw error;
        }
        throw new CustomException({
            title: "Error al procesar la colecta externa",
            message: error.message || "Error desconocido al procesar la colecta externa.",
        });
    } finally {
        if (dueñaDbConnection) await dueñaDbConnection.end();
    }
}
