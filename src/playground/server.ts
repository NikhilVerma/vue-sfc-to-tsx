import { convert } from "../index";
import type { ConvertOptions } from "../types";

const INDEX_HTML = await Bun.file(new URL("./index.html", import.meta.url).pathname).text();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,

  async fetch(req) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Serve index.html
    if (url.pathname === "/" && req.method === "GET") {
      return new Response(INDEX_HTML, {
        headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Convert endpoint
    if (url.pathname === "/convert" && req.method === "POST") {
      try {
        const body = (await req.json()) as { source: string; options?: ConvertOptions };
        if (typeof body.source !== "string") {
          return Response.json(
            { error: 'Missing "source" field' },
            { status: 400, headers: CORS_HEADERS },
          );
        }

        const result = await convert(body.source, body.options);
        return Response.json(result, { headers: CORS_HEADERS });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
      }
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
});

console.log(`Playground running at http://localhost:${server.port}`);
