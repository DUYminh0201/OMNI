import { fetchExternalWithTimeout, readResponseText } from './externalRequests.js';

const DOUYIN_API_URL = 'https://backend1.tioo.eu.org/douyin';

export async function fetchDouyinMetadata(videoUrl, options = {}) {
  const fetchImpl = options.fetchImpl || fetchExternalWithTimeout;
  const readText = options.readText || readResponseText;
  const endpoint = new URL(DOUYIN_API_URL);
  endpoint.searchParams.set('url', videoUrl);

  try {
    const response = await fetchImpl(endpoint.toString(), {}, 15_000);
    if (!response.ok) {
      throw new Error(`Douyin metadata service returned HTTP ${response.status}`);
    }

    const body = await readText(response);
    return { status: true, result: JSON.parse(body) };
  } catch (error) {
    return {
      status: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
