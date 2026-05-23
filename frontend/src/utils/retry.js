const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if ((response.status === 503 || response.status === 429) && attempt < maxRetries - 1) {
        await sleep((2 ** attempt) * 1000);
        continue;
      }
      return response;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await sleep((2 ** attempt) * 1000);
    }
  }
  return fetch(url, options);
}
