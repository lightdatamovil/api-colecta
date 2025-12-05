import { axiosInstance } from "../../db";

export async function sendToService(endpoint, message, retries = 3) {
    try {
        await axiosInstance.post(endpoint, message);
    } catch (err) {
        if (retries > 0) {
            await new Promise(r => setTimeout(r, 300 * (4 - retries))); // backoff
            return sendToService(endpoint, message, retries - 1);
        }
        throw err; // definitivamente falló
    }
}
