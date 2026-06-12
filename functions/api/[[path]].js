const UPSTREAMS = {
  universalis: 'https://universalis.app',
  xivapi: 'https://xivapi-v2.xivcdn.com',
};

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts.length < 2) {
    return new Response('Not found', { status: 404 });
  }

  const upstream = UPSTREAMS[parts[1]];
  if (!upstream) {
    return new Response('Unknown upstream', { status: 404 });
  }

  const proxyPath = '/' + parts.slice(2).join('/');
  const proxyUrl = upstream + proxyPath + url.search;

  const resp = await fetch(proxyUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  });

  const headers = new Headers(resp.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'public, max-age=60');

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}
