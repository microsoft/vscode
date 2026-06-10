/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * NOTE: {@link resolveAddressBarInputType} is a deliberate, self-contained
 * APPROXIMATION of Chromium's omnibox parser (`AutocompleteInput::Parse`), not
 * a faithful port. It intentionally diverges in places — most notably it uses a
 * lightweight "any 2+ letter last label is a TLD" heuristic instead of a Public
 * Suffix List lookup — to avoid maintaining large data tables for an address
 * bar. Please treat the unit tests in `browserSearch.test.ts` as the
 * specification: do not "fix" this to byte-match Chromium. If Chromium's
 * behavior changes in a way we care about, re-sync deliberately and update the
 * tests.
 */

import { localize } from '../../../../nls.js';

/**
 * Identifier of the integrated browser address bar search engine.
 */
export enum BrowserSearchEngineId {
	Bing = 'bing',
	Google = 'google',
	Yahoo = 'yahoo',
	DuckDuckGo = 'duckduckgo',
}

export const BrowserSearchEngineSettingId =
	'workbench.browser.searchEngine';

/**
 * Value of {@link BrowserSearchEngineSettingId} when no search engine is
 * selected (address bar search disabled). Selecting any other value both
 * enables search and picks the engine.
 */
export const BROWSER_SEARCH_NONE = 'none';

/**
 * The address bar search setting value: either `'none'` (search disabled) or a
 * specific {@link BrowserSearchEngineId}.
 */
export type BrowserSearchEngineValue = BrowserSearchEngineId | typeof BROWSER_SEARCH_NONE;

/**
 * A search engine that can be selected as the integrated browser's default.
 */
export interface IBrowserSearchEngine {
	readonly id: BrowserSearchEngineId;
	/** Human-readable label shown in the settings UI. */
	readonly label: string;
	/**
	 * Build a search URL for the given query string. The query is the raw
	 * (already trimmed) user input; implementations are responsible for
	 * URL-encoding it.
	 */
	buildSearchUrl(query: string): string;
}

/**
 * Encode a search query for use in a search-engine URL. Matches the encoding
 * used by popular browsers: `encodeURIComponent` then replace `%20` with `+`.
 */
function encodeQuery(query: string): string {
	return encodeURIComponent(query).replace(/%20/g, '+');
}

/**
 * Ordered list of supported search engines.
 */
export const BROWSER_SEARCH_ENGINES: readonly IBrowserSearchEngine[] = [
	{
		id: BrowserSearchEngineId.Bing,
		label: localize('browser.search.engine.bing', "Bing"),
		buildSearchUrl: (q) => `https://www.bing.com/search?q=${encodeQuery(q)}`,
	},
	{
		id: BrowserSearchEngineId.Google,
		label: localize('browser.search.engine.google', "Google"),
		buildSearchUrl: (q) => `https://www.google.com/search?q=${encodeQuery(q)}`,
	},
	{
		id: BrowserSearchEngineId.Yahoo,
		label: localize('browser.search.engine.yahoo', "Yahoo!"),
		buildSearchUrl: (q) =>
			`https://search.yahoo.com/search?p=${encodeQuery(q)}`,
	},
	{
		id: BrowserSearchEngineId.DuckDuckGo,
		label: localize('browser.search.engine.duckduckgo', "DuckDuckGo"),
		buildSearchUrl: (q) => `https://duckduckgo.com/?q=${encodeQuery(q)}`,
	},
];

/**
 * Classification of an address bar input. Mirrors the four non-deprecated
 * values of Chromium's `metrics::OmniboxInputType`:
 * - `'empty'`: input is whitespace-only.
 * - `'url'`: input is recognized as a navigable URL.
 * - `'query'`: input is recognized as a search query (or an invalid URL that
 *   can only reasonably be treated as a query).
 * - `'unknown'`: input is ambiguous — could be a URL (e.g. an intranet host
 *   or new TLD) or a search; callers should default to search but may offer
 *   a "did you mean to navigate?" affordance.
 */
export type AddressBarInputKind = 'empty' | 'url' | 'query' | 'unknown';

/**
 * Known URL schemes other than http/https and javascript. Anything in this
 * set is classified as URL when typed as a leading `scheme:` prefix.
 */
const KNOWN_URL_SCHEMES = new Set([
	'file',
	'ftp',
	'ftps',
	'about',
	'data',
	'view-source',
	'mailto',
	'chrome',
	'edge',
	'vscode',
	'vscode-insiders',
]);

/**
 * All schemes that we recognize as actual URL schemes (used to disambiguate
 * `scheme:operand` from `host:port` — e.g. `localhost:3000` looks like a
 * scheme syntactically but `localhost` is not a known scheme).
 */
const ALL_KNOWN_SCHEMES = new Set<string>([...KNOWN_URL_SCHEMES, 'http', 'https', 'javascript']);

/**
 * Special-cased TLDs from RFC 6761 / RFC 6762 / ICANN that are treated as
 * known only when a subdomain is present. `.invalid` is reserved as
 * non-navigable.
 */
const SUBDOMAIN_REQUIRED_TLDS = new Set(['example', 'test', 'local', 'internal']);

const SCHEME_REGEX = /^([a-z][a-z0-9+\-.]*):/i;
const JAVASCRIPT_QUERY_REGEX = /^javascript:[^;=().\"]*$/i;
const USERINFO_WITH_PASSWORD_REGEX = /^[^\s:@/?#]+:[^\s@/?#]+@/;
const HOST_CHARS_REGEX = /^[a-zA-Z0-9\-._~%]+$/;
const PORT_REGEX = /^\d+$/;
const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Canonicalize a hostname using the platform's URL parser. Converts
 * non-ASCII (IDN) hostnames to their punycode (`xn--`) form, and validates
 * and canonicalizes bracketed IPv6 literals (e.g. `[2001:0db8::0001]` →
 * `[2001:db8::1]`). Returns `undefined` if the host can't be canonicalized.
 * ASCII non-bracket hosts are returned unchanged (validation happens via
 * `HOST_CHARS_REGEX` at the call site).
 */
function toAsciiHost(host: string): string | undefined {
	const needsUrlParse = host.startsWith('[') || !/^[\x00-\x7F]*$/.test(host);
	if (!needsUrlParse) {
		return host;
	}
	try {
		return new URL(`http://${host}`).hostname;
	} catch {
		return undefined;
	}
}

interface IParsedAuthority {
	readonly userinfo: string | undefined;
	readonly host: string;
	readonly port: string | undefined;
	readonly pathAndRest: string;
}

function parseHostAndPath(rest: string): IParsedAuthority {
	const sepMatch = /[/?#]/.exec(rest);
	const authority = sepMatch ? rest.slice(0, sepMatch.index) : rest;
	const pathAndRest = sepMatch ? rest.slice(sepMatch.index) : '';

	let userinfo: string | undefined;
	let hostport = authority;
	const atIdx = authority.lastIndexOf('@');
	if (atIdx >= 0) {
		userinfo = authority.slice(0, atIdx);
		hostport = authority.slice(atIdx + 1);
	}

	let host = hostport;
	let port: string | undefined;
	if (host.startsWith('[')) {
		const end = host.indexOf(']');
		if (end >= 0) {
			const after = host.slice(end + 1);
			if (after.startsWith(':') && PORT_REGEX.test(after.slice(1))) {
				port = after.slice(1);
				host = host.slice(0, end + 1);
			} else if (after.length === 0) {
				host = host.slice(0, end + 1);
			}
		}
	} else {
		const colonIdx = host.lastIndexOf(':');
		if (colonIdx >= 0) {
			const maybePort = host.slice(colonIdx + 1);
			if (PORT_REGEX.test(maybePort)) {
				port = maybePort;
				host = host.slice(0, colonIdx);
			}
		}
	}

	return { userinfo, host, port, pathAndRest };
}

function hasKnownTld(host: string): boolean {
	const trimmed = host.toLowerCase().replace(/\.$/, '');
	const labels = trimmed.split('.');
	if (labels.length < 2) {
		return false;
	}
	const last = labels[labels.length - 1];
	if (last === 'invalid') {
		return false;
	}
	// Any all-letter last label of length >= 2 is treated as a TLD. This is a
	// lightweight stand-in for Chromium's Public Suffix List lookup that
	// covers ccTLDs, gTLDs, and newer/brand TLDs without maintaining a list.
	if (/^[a-z]{2,}$/.test(last)) {
		return true;
	}
	// Punycode IDN TLDs.
	if (last.startsWith('xn--') && last.length >= 5) {
		return true;
	}
	if (SUBDOMAIN_REQUIRED_TLDS.has(last)) {
		// A subdomain is required (host length must exceed `${tld}.`).
		return trimmed.length > last.length + 1;
	}
	return false;
}

/**
 * Classify a raw address bar input as one of the four non-deprecated
 * `metrics::OmniboxInputType` values: `empty`, `url`, `query`, or `unknown`.
 *
 * Adapted from Chromium's `AutocompleteInput::Parse`.
 * Reference: https://chromium.googlesource.com/chromium/src/+/1a40eab3d2faacd167cc3d78d20f9da98d55b78e/components/omnibox/browser/autocomplete_input.cc#250
 *
 * - Empty / whitespace-only input → `empty`.
 * - Recognized non-http(s) scheme (`file:`, `ftp:`, `about:`, `data:`,
 *   `view-source:`, `mailto:`, `chrome:`, `edge:`, `vscode:`, …) → `url`.
 * - `javascript:` followed by something that doesn't look like code → `unknown`.
 * - Unknown scheme that looks like `user:password@host…` → `url`. Other
 *   unknown schemes (e.g. `site:foo`) → `unknown`.
 * - http(s) or scheme-less input is then parsed into authority + path:
 *   - Whitespace inside the input → `query`.
 *   - Invalid host characters → `query`.
 *   - Bracketed IPv6 literal → `url`.
 *   - Dotted-quad IPv4 with first octet != 0 (or exactly `0.0.0.0`) → `url`;
 *     other "IPv4-ish" inputs (e.g. `0.1.2.3`, single component like `13.5`)
 *     fall through to the heuristics below.
 *   - `localhost` (with optional port/path) → `url`.
 *   - Explicit http/https scheme → `url`.
 *   - Trailing slash on the path → `url` (intranet shortcut).
 *   - Explicit port → `url`.
 *   - Host with a known TLD (any 2+ letter last label, punycode IDN, or a
 *     subdomain of `example`/`test`/`local`/`internal`) → `url`.
 *   - `user@host` (without explicit TLD) → `unknown` (more likely an email).
 *   - More than one non-host component present → `url`.
 *   - Anything else (single word, host with unknown TLD) → `unknown`.
 *
 * Callers typically map `url` → navigate, and `query` / `unknown` → search.
 * `empty` is returned for whitespace-only input so callers can short-circuit.
 */
export function resolveAddressBarInputType(rawInput: string): AddressBarInputKind {
	const trimmed = rawInput.trim();
	if (trimmed.length === 0) {
		return 'empty';
	}

	const schemeMatch = SCHEME_REGEX.exec(trimmed);
	const candidateScheme = schemeMatch?.[1].toLowerCase();
	const afterScheme = schemeMatch ? trimmed.slice(schemeMatch[0].length) : '';
	const hasSchemeSeparator = afterScheme.startsWith('//');
	// Only treat the leading `xxx:` as a scheme if it's a recognized scheme
	// or is followed by `//`. This avoids mis-parsing inputs like
	// `localhost:3000` or `sub.example.com:8080/path`, which Chromium's
	// URLFixerUpper resolves as host:port URLs rather than scheme operands.
	const scheme = candidateScheme && (ALL_KNOWN_SCHEMES.has(candidateScheme) || hasSchemeSeparator)
		? candidateScheme
		: undefined;
	const isHttpScheme = scheme === 'http' || scheme === 'https';

	if (scheme && !isHttpScheme) {
		if (scheme === 'file') {
			return 'url';
		}
		if (scheme === 'javascript') {
			return JAVASCRIPT_QUERY_REGEX.test(trimmed) ? 'unknown' : 'url';
		}
		if (KNOWN_URL_SCHEMES.has(scheme)) {
			return 'url';
		}
		// Recognized as a scheme only because of `//`, but not in our known
		// set. Treat as URL only if it looks like userinfo with a password.
		if (USERINFO_WITH_PASSWORD_REGEX.test(trimmed) && !/\s/.test(trimmed)) {
			return 'url';
		}
		return 'unknown';
	}

	// Handle unrecognized scheme that's NOT followed by `//` and NOT a
	// plausible host:port (`localhost:3000`). E.g. `site:foo`,
	// `unknownscheme:bar` — search operators, classified as `unknown`.
	if (candidateScheme && !scheme && !/^\d+(?:[/?#]|$)/.test(afterScheme)) {
		if (USERINFO_WITH_PASSWORD_REGEX.test(trimmed) && !/\s/.test(trimmed)) {
			return 'url';
		}
		return 'unknown';
	}

	// http / https / scheme-less from here on. Strip the scheme prefix (and
	// optional `//`) for authority parsing — but only if we actually
	// recognized a scheme above. For inputs like `localhost:3000` where
	// `candidateScheme` is set but `scheme` is undefined, we leave the
	// colon in place so it's parsed as host:port.
	let rest = trimmed;
	if (scheme) {
		rest = trimmed.slice(schemeMatch![0].length);
		if (rest.startsWith('//')) {
			rest = rest.slice(2);
		}
	}

	// Whitespace inside the input is a strong query signal.
	if (/\s/.test(rest)) {
		return 'query';
	}

	const { userinfo, host: rawHost, port, pathAndRest } = parseHostAndPath(rest);

	// Host-less input that starts with `/` is treated as an absolute path URL
	// (e.g. `/usr/local/bin`, `//example.com`).
	if (rawHost.length === 0) {
		return pathAndRest.startsWith('/') ? 'url' : 'query';
	}

	// Canonicalize the host via the WHATWG URL parser: converts Unicode
	// hostnames to punycode/IDN and validates/canonicalizes bracketed IPv6
	// literals. Falls back to `query` if the host can't be canonicalized.
	const host = toAsciiHost(rawHost);
	if (host === undefined) {
		return 'query';
	}

	// A canonicalized bracketed IPv6 literal is a URL.
	if (host.startsWith('[') && host.endsWith(']')) {
		return 'url';
	}

	// Validate host characters.
	if (!HOST_CHARS_REGEX.test(host)) {
		return 'query';
	}

	// IPv4 dotted-quad.
	const ipv4Match = IPV4_REGEX.exec(host);
	if (ipv4Match) {
		const octets = ipv4Match.slice(1, 5).map(Number);
		if (octets.every(o => o <= 255)) {
			const allZero = octets.every(o => o === 0);
			if (octets[0] !== 0 || allZero) {
				return 'url';
			}
			// First octet is zero and not 0.0.0.0 — "source IP", not navigable.
			return 'query';
		}
	}

	if (host.toLowerCase() === 'localhost') {
		return 'url';
	}

	// Explicit http/https scheme: with a parseable host, we're done.
	if (isHttpScheme) {
		return 'url';
	}

	// Trailing slash on the path forces URL (intranet shortcut).
	if (pathAndRest.length > 0 && (pathAndRest.endsWith('/') || pathAndRest.endsWith('\\'))) {
		return 'url';
	}

	if (port !== undefined) {
		return 'url';
	}

	if (hasKnownTld(host)) {
		return 'url';
	}

	if (userinfo !== undefined) {
		return 'unknown';
	}

	const hasPath = pathAndRest.startsWith('/');
	const hasQuery = pathAndRest.includes('?');
	const hasFragment = pathAndRest.includes('#');
	const nonHostComponents = (hasPath ? 1 : 0) + (hasQuery ? 1 : 0) + (hasFragment ? 1 : 0);
	if (nonHostComponents > 1) {
		return 'url';
	}

	return 'unknown';
}

/**
 * Build a search URL for the given query using the specified engine. The
 * query is trimmed and collapses internal whitespace before encoding.
 */
export function buildSearchUrl(
	query: string,
	engineId: BrowserSearchEngineId,
): string {
	const engine =
		BROWSER_SEARCH_ENGINES.find((e) => e.id === engineId) ??
		BROWSER_SEARCH_ENGINES[0];
	return engine.buildSearchUrl(query.trim().replace(/\s+/g, ' '));
}

/**
 * Human-readable label for the given search engine (e.g. "Bing"). Falls back
 * to the default engine's label for an unknown id.
 */
export function getBrowserSearchEngineLabel(engineId: BrowserSearchEngineId): string {
	const engine =
		BROWSER_SEARCH_ENGINES.find((e) => e.id === engineId) ??
		BROWSER_SEARCH_ENGINES[0];
	return engine.label;
}
