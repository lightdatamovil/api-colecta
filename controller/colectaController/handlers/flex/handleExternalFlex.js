import { checkIfExistLogisticAsDriverInDueñaCompany } from "../../functions/checkIfExistLogisticAsDriverInDueñaCompany.js";
import { informe } from "../../functions/informe.js";
import { checkearEstadoEnvio } from "../../functions/checkarEstadoEnvio.js";
import { altaEnvioBasica, assign, connectMySQL, CustomException, EstadosEnvio, executeQuery, getProductionDbConfig, LightdataORM, sendShipmentStateToStateMicroserviceAPI } from "lightdata-tools";
import { axiosInstance, companiesService, hostProductionDb, portProductionDb, queueEstadosML, rabbitService, urlAltaEnvioMicroservice, urlAltaEnvioRedisMicroservice, urlEstadosMicroservice, urlAsignacionMicroservice } from "../../../../db.js";

export async function handleExternalFlex({
  db,
  headers,
  company,
  userId,
  dataQr,
  autoAssign,
  latitude,
  longitude
}) {
  const senderid = dataQr.sender_id;
  const shipmentId = dataQr.id;
  const codLocal = company.codigo;

  const queryLogisticasExternas = `
    SELECT did, nombre_fantasia, codigoVinculacionLogE 
    FROM clientes 
    WHERE superado = 0 AND elim = 0 AND codigoVinculacionLogE != ''
  `;
  const logisticasExternas = await executeQuery({
    dbConnection: db,
    query: queryLogisticasExternas
  });

  if (logisticasExternas.length === 0) {
    throw new CustomException({
      title: `La cuenta de ML: ${dataQr.sender_id} no está vinculada`,
      message: `No se encontró ninguna logística externa vinculada a la cuenta de ML: ${dataQr.sender_id}`,
    });
  }

  for (const logistica of logisticasExternas) {
    if (logistica.did == undefined) {
      throw new CustomException({
        title: `La logística está mal vinculada`,
        message: `La logística externa vinculada a la cuenta de ML: ${dataQr.sender_id} está mal vinculada`,
      });
    }

    const externalLogisticId = logistica.did;
    const nombreFantasia = logistica.nombre_fantasia;
    const syncCode = logistica.codigoVinculacionLogE;

    const externalCompany = await companiesService.getCompanyByCode(syncCode);
    const externalCompanyId = externalCompany.did;

    const dbConfigExt = getProductionDbConfig({
      host: hostProductionDb,
      port: portProductionDb,
      company: externalCompany
    });

    const dbDueña = await connectMySQL(dbConfigExt);

    try {
      const [rowsEnvios] = await LightdataORM.select({
        dbConnection: dbDueña,
        table: 'envios',
        where: {
          ml_shipment_id: shipmentId,
          ml_vendedor_id: senderid
        },
        select: ['did', 'didCliente']
      });

      let externalShipmentId;
      let externalClientId;

      const driver = await checkIfExistLogisticAsDriverInDueñaCompany({
        db: dbDueña,
        syncCode: codLocal
      });

      if (!driver) {
        throw new CustomException({
          title: `Error en la vinculación`,
          message: `No se encontró un conductor vinculado en la empresa dueña para la logística externa: ${nombreFantasia}`,
        });
      }

      if (rowsEnvios.length > 0) {
        externalShipmentId = rowsEnvios[0].did;
        externalClientId = rowsEnvios[0].didCliente;

        const check = await checkearEstadoEnvio({
          db: dbDueña,
          shipmentId: externalShipmentId
        });
        if (check) return check;

      } else {
        const rowsCuentas = await LightdataORM.select({
          db: dbDueña,
          table: 'clientes_cuentas',
          where: { ML_id_vendedor: senderid, tipoCuenta: 1 },
          select: ['did', 'didCliente']
        });

        if (rowsCuentas.length == 0) {
          continue;
        }

        externalClientId = rowsCuentas.didCliente;
        const didcuenta_ext = rowsCuentas.did;

        externalShipmentId = await altaEnvioBasica({
          urlAltaEnvioMicroservice,
          urlAltaEnvioRedisMicroservice,
          axiosInstance,
          rabbitServiceInstance: rabbitService,
          queueEstadosML,
          externalCompany,
          clientId: externalClientId,
          accountId: didcuenta_ext,
          dataQr,
          flex: 1,
          externo: 0,
          userId,
          driverId: driver,
          lote: "colecta",
        });
      }

      let internalShipmentId;
      internalShipmentId = await LightdataORM.select({
        dbConnection: db,
        table: 'envios_exteriores',
        where: { didExterno: externalShipmentId },
        select: ['didLocal']
      });

      if (internalShipmentId.length > 0 && internalShipmentId[0]?.didLocal) {
        internalShipmentId = internalShipmentId[0].didLocal;
      } else {
        internalShipmentId = await altaEnvioBasica({
          urlAltaEnvioMicroservice,
          urlAltaEnvioRedisMicroservice,
          axiosInstance,
          rabbitServiceInstance: rabbitService,
          queueEstadosML,
          company,
          clientId: 0,
          accountId: externalLogisticId,
          dataQr,
          flex: 1,
          externo: 1,
          userId,
          driverId: driver,
          lote: "colecta",
          didExterno: externalShipmentId,
          nombreClienteEnEmpresaDueña: nombreFantasia,
          empresaDueña: externalCompanyId,
        });
      }

      await sendShipmentStateToStateMicroserviceAPI({
        urlEstadosMicroservice,
        axiosInstance,
        company,
        userId,
        shipmentId: internalShipmentId,
        estado: EstadosEnvio.value(EstadosEnvio.collected, company.did),
        latitude,
        longitude,
        desde: 'colecta'
      });

      await sendShipmentStateToStateMicroserviceAPI({
        urlEstadosMicroservice,
        axiosInstance,
        externalCompany,
        driver,
        shipmentId: externalShipmentId,
        estado: EstadosEnvio.value(EstadosEnvio.collected, externalCompany.did),
        latitude,
        longitude,
        desde: 'colecta'
      });

      if (autoAssign) {
        const dqr = {
          did: internalShipmentId,
          empresa: company.did,
          local: 1,
          cliente: externalLogisticId,
        };

        await assign({
          headers,
          urlAsignacionMicroservice,
          dataQr: dqr,
          driverId: userId,
          desde: 'Autoasignado de colecta'
        });
      }

      const dqrext = {
        did: externalShipmentId,
        empresa: externalCompanyId,
        local: 1,
        cliente: externalLogisticId,
      };

      await assign({
        headers,
        urlAsignacionMicroservice,
        dataQr: dqrext,
        driverId: driver,
        desde: 'colecta'
      });

      const [internalClient] = await LightdataORM.select({
        dbConnection: db,
        table: 'envios',
        where: { did: internalShipmentId },
        select: ['didCliente']
      });
      if (internalClient.length == 0) {
        return {
          success: false,
          message: "No se encontró cliente asociado",
        };
      }

      const body = await informe({
        db,
        company,
        clientId: internalClient.didCliente,
        userId
      });

      return {
        success: true,
        message: "Paquete colectado correctamente - FLEX",
        body: body,
      };
    } catch (error) {
      throw new CustomException({
        title: `Error al procesar la logística externa ${nombreFantasia}`,
        message: error.message,
      });
    } finally {
      if (dbDueña) await dbDueña.end();
    }
  }
  return {
    success: false,
    message: "No se encontró cuenta asociada",
  };
}

