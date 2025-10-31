import request from "./request";

export async function r2d2Get<R = any>(url: string, params?: any, isEncodeURI = true): Promise<R> {
  return await request.get(`https://cors.r2d2.to/?${isEncodeURI ? encodeURIComponent(url) : url}`, { params });
}

export async function r2d2Post<R = any>(url: string, data?: any, isEncodeURI = true): Promise<R> {
  return await request.post(`https://cors.r2d2.to/?${isEncodeURI ? encodeURIComponent(url) : url}`, data);
}
