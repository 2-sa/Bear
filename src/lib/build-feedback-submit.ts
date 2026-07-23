import { safeFetch } from "@/lib/safe-fetch";
import { APP_VERSION, IS_BETA_BUILD } from "@/lib/build-info";
import { workerRoutes } from "@/lib/network-config";

export async function submitBuildFeedback(rating: number): Promise<boolean> {
  const url = workerRoutes.buildFeedback();
  if (!url) return false;
  try {
    const res = await safeFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: APP_VERSION, rating, beta: IS_BETA_BUILD }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
