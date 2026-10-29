export const onRequestGet = async ({ env }) => {
  const teams = await env.DB.prepare('SELECT * FROM teams ORDER BY created_at DESC').all();
  const members = await env.DB.prepare('SELECT * FROM members').all();
  const photos = await env.DB.prepare('SELECT * FROM photos').all();
  const result = teams.results.map(t => ({
    ...t,
    members: members.results.filter(m => m.team_id === t.id),
    photos: photos.results.filter(p => p.team_id === t.id).map(p => p.share_url),
  }));
  return Response.json(result);
};

const checkAuth = (request, env) => {
  const password = request.headers.get('x-admin-password');
  return password && env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD;
};

export const onRequestPost = async ({ request, env }) => {
  if (!checkAuth(request, env)) return new Response('Unauthorized', { status: 401 });
  const body = await request.json();
  const t = body.team || body;
  const id = t.id || crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO teams (id, organization, city, region, postal_code, address, organization_phone, email, organization_head, vehicle_class, vehicle_description, team_lead, team_lead_phone)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
    ON CONFLICT(id) DO UPDATE SET organization=?2, city=?3, region=?4, postal_code=?5, address=?6, organization_phone=?7, email=?8, organization_head=?9, vehicle_class=?10, vehicle_description=?11, team_lead=?12, team_lead_phone=?13`)
    .bind(id, t.organization||'', t.city||'', t.region||'', t.postal_code||'', t.address||'', t.organization_phone||'', t.email||'', t.organization_head||'', t.vehicle_class||'', t.vehicle_description||'', t.team_lead||'', t.team_lead_phone||'').run();
  await env.DB.prepare('DELETE FROM members WHERE team_id=?1').bind(id).run();
  for (const m of (t.members||[])) {
    await env.DB.prepare('INSERT INTO members (team_id, full_name, birth_date, document, is_student, enrollment_order) VALUES (?1,?2,?3,?4,?5,?6)')
      .bind(id, m.fullName||'', m.birthDate||'', m.document||'', m.isStudent?1:0, m.enrollmentOrder||'').run();
  }
  await env.DB.prepare('DELETE FROM photos WHERE team_id=?1').bind(id).run();
  for (const p of (t.photos||[])) {
    if (p) await env.DB.prepare('INSERT INTO photos (team_id, share_url) VALUES (?1,?2)').bind(id, p).run();
  }
  return Response.json({ ok: true, id });
};

export const onRequestDelete = async ({ request, env }) => {
  if (!checkAuth(request, env)) return new Response('Unauthorized', { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return new Response('Bad request', { status: 400 });
  await env.DB.prepare('DELETE FROM teams WHERE id=?1').bind(id).run();
  return Response.json({ ok: true });
};
