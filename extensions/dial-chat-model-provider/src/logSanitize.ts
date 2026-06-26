/** Log HTTP(S) URLs without query parameters (OAuth codes, state, PKCE must not appear in logs). */
export function sanitizeHttpUrlForLog(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.origin}${parsed.pathname}`;
	} catch {
		return '(invalid URL)';
	}
}
