import { describe, expect, it } from 'vitest';

import {
  ConfigError,
  DEFAULT_ALLOWED_ORIGINS,
  describeKeyPresence,
  loadConfig,
  normalizeOrigin,
} from '../src/config';

const KEY = { ANTHROPIC_API_KEY: 'sk-ant-whatever' };

describe('loadConfig — API 키', () => {
  it('키가 없으면 기동을 거부한다', () => {
    expect(() => loadConfig({})).toThrowError(ConfigError);
    try {
      loadConfig({});
    } catch (e) {
      expect((e as ConfigError).code).toBe('MISSING_API_KEY');
    }
  });

  it('빈 문자열·공백도 없는 것으로 본다', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: '' })).toThrowError(ConfigError);
    expect(() => loadConfig({ ANTHROPIC_API_KEY: '   ' })).toThrowError(ConfigError);
  });

  it('키 값을 에러 메시지에 넣지 않는다', () => {
    // 없을 때만 던지므로 값이 새어 나갈 여지 자체가 없지만, 회귀로 고정해 둔다.
    try {
      loadConfig({ ANTHROPIC_API_KEY: '' });
    } catch (e) {
      expect((e as Error).message).not.toContain('sk-ant');
    }
  });

  it('키 존재 표현에 값이 들어가지 않는다', () => {
    const described = describeKeyPresence('sk-ant-api03-SECRETSECRET');
    expect(described).not.toContain('sk-ant');
    expect(described).not.toContain('SECRET');
    expect(described).toContain('25');
  });
});

describe('loadConfig — CORS', () => {
  it('기본값은 토스 미니앱 두 오리진이다', () => {
    expect(loadConfig(KEY).allowedOrigins).toEqual(DEFAULT_ALLOWED_ORIGINS);
    expect(DEFAULT_ALLOWED_ORIGINS).toEqual([
      'https://sajuapp.web.tossmini.com',
      'https://sajuapp.private-web.tossmini.com',
    ]);
  });

  it('env 로 덮어쓸 수 있다(쉼표 구분)', () => {
    const cfg = loadConfig({ ...KEY, CORS_ORIGINS: 'http://localhost:5173, https://example.com' });
    expect(cfg.allowedOrigins).toEqual(['http://localhost:5173', 'https://example.com']);
  });

  it('경로·후행 슬래시를 오리진 형태로 정규화한다', () => {
    // 이걸 안 하면 설정은 맞는데 전부 403 이 나고, 원인이 눈에 안 보인다.
    expect(normalizeOrigin('https://example.com/')).toBe('https://example.com');
    expect(normalizeOrigin('https://example.com/path?x=1')).toBe('https://example.com');
    expect(normalizeOrigin('https://example.com:443')).toBe('https://example.com');
    expect(normalizeOrigin('https://example.com:8443')).toBe('https://example.com:8443');
  });

  it('URL 이 아니거나 http/https 가 아니면 거부한다', () => {
    expect(() => loadConfig({ ...KEY, CORS_ORIGINS: 'not a url' })).toThrowError(ConfigError);
    expect(() => loadConfig({ ...KEY, CORS_ORIGINS: 'file:///etc' })).toThrowError(ConfigError);
  });
});

describe('loadConfig — 숫자·불리언 env', () => {
  it('범위를 벗어난 정수를 거부한다', () => {
    expect(() => loadConfig({ ...KEY, PORT: '0' })).toThrowError(ConfigError);
    expect(() => loadConfig({ ...KEY, PORT: '70000' })).toThrowError(ConfigError);
    expect(() => loadConfig({ ...KEY, RATE_LIMIT_MAX: '1.5' })).toThrowError(ConfigError);
  });

  it('true/false 표기를 두루 받는다', () => {
    expect(loadConfig({ ...KEY, TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(loadConfig({ ...KEY, TRUST_PROXY: '1' }).trustProxy).toBe(true);
    expect(loadConfig({ ...KEY, TRUST_PROXY: 'off' }).trustProxy).toBe(false);
    expect(() => loadConfig({ ...KEY, TRUST_PROXY: 'maybe' })).toThrowError(ConfigError);
  });

  it('기본값 — 재시도 없음(원가 1배), 폴백 켜짐, 프록시 불신', () => {
    const cfg = loadConfig(KEY);
    expect(cfg.maxAttempts).toBe(1);
    expect(cfg.serverSideFallback).toBe(true);
    expect(cfg.trustProxy).toBe(false);
    expect(cfg.maxInFlight).toBe(4);
  });
});
