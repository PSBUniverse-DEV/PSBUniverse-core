/**
 * Session Introspection Endpoint (cross-subdomain, credentialed)
 * GET/OPTIONS /api/auth/introspect
 *
 * The single source of truth for module apps. The browser sends the
 * .psbuniverse.com `psb_session` cookie here automatically; core verifies it
 * with JWT_SECRET (which never leaves core), then reports identity, roles, and
 * whether the caller's subdomain is authorized. Modules need no JWT_SECRET,
 * no Supabase keys, and no module id of their own.
 */

import { verifyToken } from '@/core/auth/jwt.utils';
import { isSessionInvalidated } from '@/core/auth/session.service';
import { getPSBSessionCookieFromRequest } from '@/core/auth/cookies.utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── CORS: echo the Origin only for psbuniverse.com subdomains (+ localhost dev)
function resolveAllowedOrigin(request) {
  const origin = request.headers.get('origin') || '';
  if (!origin) return '';
  try {
    const { hostname, protocol } = new URL(origin);
    const isPsb = hostname === 'psbuniverse.com' || hostname.endsWith('.psbuniverse.com');
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if ((isPsb || isLocal) && (protocol === 'https:' || protocol === 'http:')) {
      return origin;
    }
  } catch {
    return '';
  }
  return '';
}

function corsHeaders(request) {
  const allowOrigin = resolveAllowedOrigin(request);
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (allowOrigin) {
    headers['Access-Control-Allow-Origin'] = allowOrigin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return headers;
}

function json(request, body, status) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

// Map the caller's host → app_id using the core-owned MODULE_HOST_MAP env.
// Returns null when unmapped (then authorization falls back to "authenticated").
function appIdForRequest(request) {
  const raw = process.env.MODULE_HOST_MAP || '';
  if (!raw.trim()) return null;

  let map;
  try {
    map = JSON.parse(raw);
  } catch {
    return null;
  }

  // Prefer the Origin host (set by the browser on the credentialed CORS call),
  // fall back to the forwarded host.
  let host = '';
  try {
    host = new URL(request.headers.get('origin') || '').hostname;
  } catch {
    host = '';
  }
  if (!host) host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(':')[0];

  const appId = map[host];
  return appId === undefined || appId === null ? null : String(appId);
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request) {
  try {
    const token = getPSBSessionCookieFromRequest(request);
    if (!token) {
      return json(request, { authenticated: false, error: 'No session token' }, 401);
    }

    let payload;
    try {
      payload = await verifyToken(token);
    } catch {
      return json(request, { authenticated: false, error: 'Invalid or expired token' }, 401);
    }

    if (await isSessionInvalidated(token)) {
      return json(request, { authenticated: false, error: 'Session invalidated' }, 401);
    }

    const modules = Array.isArray(payload.modules) ? payload.modules.map(String) : [];
    const roles = Array.isArray(payload.roles) ? payload.roles.map(String) : [];
    const appId = appIdForRequest(request);

    // If the host is mapped, authorize by module membership; if unmapped
    // (e.g. core itself), a valid session is enough.
    const authorizedForApp = appId === null ? true : modules.includes(appId);

    return json(
      request,
      {
        authenticated: true,
        authorizedForApp,
        appId,
        userId: payload.userId,
        email: payload.email,
        fullName: payload.fullName,
        modules,
        roles,
        expiresAt: payload.expiresAt,
      },
      200,
    );
  } catch (error) {
    console.error('Introspect endpoint error:', error);
    return json(request, { authenticated: false, error: 'Internal server error' }, 500);
  }
}