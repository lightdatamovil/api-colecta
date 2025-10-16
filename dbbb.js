// prueba con base de datos de planet desde local

import { getCompanyById, getProdDbConfig } from "./db.js";
import mysql from "mysql";

const did = getCompanyById(12);

const dbConfigAnt = getProdDbConfig(did);
const dbConnectionAnt = mysql.createConnection(dbConfigAnt);
dbConnectionAnt.connect();


// prueba con base de datos de planet desde 10.60.0.125

const dbConfigNew = getProdDbConfig(did);
const dbConnectionNew = mysql.createConnection(dbConfigNew);
dbConnectionNew.connect();
