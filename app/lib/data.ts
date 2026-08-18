import "server-only";
import type { DashboardData } from "./types";
import { previewData } from "./preview-data";

export async function getDashboardData(): Promise<DashboardData> {
  const url = process.env.MPH_API_URL;
  const token = process.env.MPH_API_TOKEN;
  if (!url || !token) return previewData;

  try {
    const response = await fetch(url, {
      headers: { "x-mph-token": token },
      cache: "no-store",
    });
    if (!response.ok) return previewData;
    const data = (await response.json()) as DashboardData;
    return { ...data, dataMode: "live" };
  } catch {
    return previewData;
  }
}
