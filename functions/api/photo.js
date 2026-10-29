export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url).searchParams.get('url');
  if (!url || !/^https:\/\/disk\.yandex\.ru\//.test(url)) {
    return new Response('Bad request', { status: 400 });
  }
  const api = 'https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=' + encodeURIComponent(url);
  const res = await fetch(api);
  if (!res.ok) return new Response('Yandex error', { status: 502 });
  const data = await res.json();
  if (!data.href) return new Response('No link', { status: 404 });
  return Response.redirect(data.href, 302);
};
