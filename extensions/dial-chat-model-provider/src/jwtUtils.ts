/** JWT helpers for expiry checks and safe logging (no signature verification). */

import { isRecord, isStringArray, type JsonObject, type JsonValue } from './runtimeGuards';
import { type Nullable } from './types';

function parseJwtPayload(token: string): Nullable<JsonObject> {
	try {
		const parts = token.split('.');
		if (parts.length < 2) {
			return undefined;
		}
		const payloadSegment = parts[1];
		if (!payloadSegment) {
			return undefined;
		}
		const decoded = JSON.parse(
			Buffer.from(payloadSegment, 'base64url').toString('utf8'),
		) as JsonValue;
		return isRecord(decoded) ? decoded : undefined;
	} catch {
		return undefined;
	}
}

function readRoles(payload: JsonObject, rolePath: string): readonly string[] {
	const parts = rolePath.split('.');
	let current: JsonValue = payload;
	for (const part of parts) {
		if (!isRecord(current)) {
			return [];
		}
		const next: Nullable<JsonValue> = current[part];
		if (next === undefined) {
			return [];
		}
		current = next;
	}
	if (isStringArray(current)) {
		return current;
	}
	if (typeof current === 'string') {
		return current.split(/\s+/).filter(Boolean);
	}
	return [];
}

function describeClaim(value: Nullable<JsonValue>, fallback: string): string {
	if (typeof value === 'string') {
		return value || fallback;
	}
	if (Array.isArray(value)) {
		return value.map((item) => String(item)).join(',');
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return fallback;
}

export function summarizeAccessToken(token: string): string {
	const payload = parseJwtPayload(token);
	if (!payload) {
		return `len=${token.length}`;
	}

	const sub = describeClaim(payload.sub, '(missing)');
	const scope = describeClaim(payload.scope ?? payload.scp, '(none)');
	const aud = describeClaim(payload.aud, '(none)');
	const exp = describeClaim(payload.exp, '?');
	return `jwt sub=${sub} aud=${aud} scope=${scope} exp=${exp}`;
}

/** Role hints for DIAL authorization debugging (no full claim dumps). */
export function summarizeAccessTokenClaims(token: string): string {
	const payload = parseJwtPayload(token);
	if (!payload) {
		return '(not a JWT)';
	}

	const parts: string[] = [];
	if (typeof payload.azp === 'string') {
		parts.push(`azp=${payload.azp}`);
	}

	const dialRoles = readRoles(payload, 'resource_access.dial-chat.roles');
	if (dialRoles.length > 0) {
		parts.push(`dial-chat.roles=${dialRoles.join(',')}`);
	}

	return parts.length > 0 ? parts.join(' ') : '(no role claims)';
}

export function isAccessTokenExpired(expiryTimeMs: Nullable<number>, skewMs = 30_000): boolean {
	if (expiryTimeMs === undefined || !Number.isFinite(expiryTimeMs)) {
		return true;
	}
	return Date.now() >= expiryTimeMs - skewMs;
}
