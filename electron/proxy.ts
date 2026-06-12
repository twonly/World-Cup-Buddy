export type ProxyMode = 'direct' | 'system' | 'custom';

export type ProxyAuth = {
  username: string;
  password: string;
};

export type NormalizedProxy = {
  proxyRules: string;
  auth: ProxyAuth | null;
};

function decodeCredential(value: string): string {
  try { return decodeURIComponent(value); }
  catch { return value; }
}

function hasAdvancedProxyRules(input: string): boolean {
  return /(^|;)\s*(http|https|ftp|socks|socks4|socks5|direct)\s*=/i.test(input);
}

function ensureUrl(input: string): URL | null {
  try {
    return new URL(input.includes('://') ? input : `http://${input}`);
  } catch {
    return null;
  }
}

export function normalizeProxyInput(input?: string): NormalizedProxy {
  const raw = (input ?? '').trim();
  if (!raw) return { proxyRules: '', auth: null };
  if (hasAdvancedProxyRules(raw)) return { proxyRules: raw, auth: null };

  const parsed = ensureUrl(raw);
  if (!parsed || !parsed.hostname) return { proxyRules: raw, auth: null };

  const protocol = parsed.protocol.replace(':', '').toLowerCase();
  const hostPort = parsed.host;
  const auth = parsed.username
    ? {
        username: decodeCredential(parsed.username),
        password: decodeCredential(parsed.password),
      }
    : null;

  if (protocol === 'socks' || protocol === 'socks4' || protocol === 'socks5') {
    return { proxyRules: `${protocol}://${hostPort}`, auth };
  }

  if (protocol === 'https') {
    return { proxyRules: `https=${hostPort}`, auth };
  }

  return { proxyRules: `http=${hostPort};https=${hostPort}`, auth };
}

export function buildSessionProxyConfig(
  mode: ProxyMode = 'direct',
  proxyUrl?: string,
  proxyBypass?: string,
): Electron.ProxyConfig {
  if (mode === 'system') return { mode: 'system' };
  if (mode !== 'custom') return { mode: 'direct' };

  const normalized = normalizeProxyInput(proxyUrl);
  if (!normalized.proxyRules) return { mode: 'direct' };
  return {
    mode: 'fixed_servers',
    proxyRules: normalized.proxyRules,
    proxyBypassRules: proxyBypass?.trim() || '<local>',
  };
}

export function proxyAuthForInput(mode: ProxyMode = 'direct', proxyUrl?: string): ProxyAuth | null {
  if (mode !== 'custom') return null;
  return normalizeProxyInput(proxyUrl).auth;
}
