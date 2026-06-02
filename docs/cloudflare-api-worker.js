export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    url.hostname = "jaya-dhaba-dwwd.onrender.com";

    const headers = new Headers(request.headers);
    headers.set("Host", "jaya-dhaba-dwwd.onrender.com");
    headers.set("X-Cloudflare-Secret", env.CLOUDFLARE_TUNNEL_SECRET);

    return fetch(new Request(url, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    }));
  },
};
