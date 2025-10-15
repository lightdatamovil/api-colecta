import axios from "axios";

const client = axios.create({
    baseURL: "http://10.70.0.69",
    timeout: 44336,
});

export async function obtenerEstado() {
    const resp = await client.get("/test");
    return { data: resp.data, status: resp.status };
}


