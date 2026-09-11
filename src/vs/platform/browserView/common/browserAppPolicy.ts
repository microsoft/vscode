/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Opt-in confinement policy for a native browser view that hosts a single
 * "local custom app" (for example, a Sessions canvas backed by a loopback
 * dev server). When present, the view is locked to {@link allowedOrigin}:
 * top-level navigation, redirects, subresource loads, and frames that leave
 * that origin are blocked outright (not silently redirected or downgraded to
 * a same-origin fallback). Opaque resources are allowed only in their
 * specific resource/frame contexts; they cannot replace the top-level app.
 * Blob documents must retain the exact approved app origin.
 *
 * This is a UI/navigation confinement boundary only. It constrains what the
 * *renderer* inside the view may load or reach; it makes no claim about, and
 * must not be relied on to isolate, any privileged Node-hosted backend the
 * app's own local server may run -- that is a separate runtime-authorization
 * concern owned by whichever component starts that backend.
 *
 * A view without an `appPolicy` is a generic browser page and this module
 * must have zero effect on it: every check below is only ever consulted when
 * an `IBrowserViewAppPolicy` is actually present on the view/session.
 */
export interface IBrowserViewAppPolicy {
	/**
	 * The exact origin (scheme + host + port) this view is confined to.
	 * Derived once, from the app's initial URL, by whoever opts a page into
	 * the policy (e.g. a Sessions canvas source resolver) -- never
	 * recomputed from a subsequently navigated-to URL.
	 */
	readonly allowedOrigin: string;
	/**
	 * When `true`, a top-level, user-driven navigation (or window.open) to an
	 * off-origin `http:`/`https:` target is handed off to the OS's default
	 * browser via the standard "open external" flow instead of being blocked
	 * outright. This is the explicit, user-mediated route for external links:
	 * the target is never loaded inside the confined view, and no data or
	 * script access flows back into it. When omitted or `false`, off-origin
	 * targets are simply blocked, matching a default-deny posture.
	 */
	readonly allowExternalLinks?: boolean;
}

/** Discriminates how a navigation/subresource/frame request should be handled under an {@link IBrowserViewAppPolicy}. */
export const enum BrowserViewAppPolicyDecision {
	/** In policy: same allowed origin, or a deliberately-permitted opaque resource (see {@link decideBrowserViewAppPolicyNavigation}). */
	Allow = 'allow',
	/** Out of policy and not eligible for external hand-off: must be blocked outright. */
	Block = 'block',
	/** Out of policy, but the request is a trusted, host-initiated navigation and {@link IBrowserViewAppPolicy.allowExternalLinks} is set: hand off to the OS browser instead of loading in-view. Never produced for any guest-reachable context -- see {@link BrowserViewAppPolicyRequestContext.HostInitiated}. */
	OpenExternal = 'openExternal',
}

/**
 * Where a URL is being loaded from, for the purposes of
 * {@link decideBrowserViewAppPolicyNavigation}. The same allowed-origin check
 * applies uniformly across all contexts, but a handful of scheme-specific
 * exceptions (`data:`, `blob:`, `about:blank`) and the {@link OpenExternal}
 * escape hatch are deliberately gated per-context so that guest page script
 * can never manufacture the conditions a trusted host action would need.
 */
export const enum BrowserViewAppPolicyRequestContext {
	/**
	 * Trusted host/internal TypeScript code invoking `loadURL()` directly
	 * (e.g. the initial URL, or a host-driven reload). Never reachable from
	 * guest page script running inside the view. This is the *only* context
	 * in which {@link BrowserViewAppPolicyDecision.OpenExternal} may be
	 * produced by this function -- popups instead prove user intent via a
	 * separate, gesture-gated path (see `isExternalLinkTarget`).
	 */
	HostInitiated = 'hostInitiated',
	/**
	 * A top-level navigation or redirect target (`will-navigate`/`will-redirect`),
	 * or a popup target (`setWindowOpenHandler`). Fully guest-reachable: a
	 * compromised or malicious page can trigger these freely, so no
	 * escape-hatch decision may depend on gesture-independent state here.
	 */
	TopLevel = 'topLevel',
	/** Canvas popups are denied until child views have source-owned lifetime and restoration. */
	Popup = 'popup',
	/** An `<iframe>`/subframe navigation target. Guest-reachable. */
	Frame = 'frame',
	/** Any other subresource load: fetch/XHR, script, image, stylesheet, WebSocket, etc. Guest-reachable. */
	Subresource = 'subresource',
}

/** Parses a `blob:<origin>/<uuid>` URL's embedded origin, or `undefined` if `url` isn't a `blob:` URL or fails to parse. */
function tryGetBlobOrigin(url: string): string | undefined {
	const lower = url.trimStart().toLowerCase();
	if (!lower.startsWith('blob:')) {
		return undefined;
	}
	try {
		// `blob:` URLs are shaped `blob:<creator-origin>/<uuid>`; the substring after the
		// scheme parses as an ordinary URL whose `.origin` is the creator's origin.
		return new URL(url.trim().slice('blob:'.length)).origin;
	} catch {
		return undefined;
	}
}

/**
 * Returns the scheme+host+port "origin" string for `url` under `context`, or
 * `undefined` if `url` fails to parse, uses a scheme with no meaningful
 * origin, or uses a scheme that is only ever a subresource of a page (never
 * itself the origin a page is confined to) and `context` doesn't reflect
 * that. Callers that need to allow specific opaque schemes regardless of
 * origin (`data:`, `blob:`, `about:blank`) must special-case those before
 * calling this and must not treat an `undefined` result here as itself a
 * policy violation for those schemes.
 */
export function tryGetAppPolicyOrigin(url: string, context: BrowserViewAppPolicyRequestContext): string | undefined {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return undefined;
	}
	switch (parsed.protocol) {
		case 'http:':
		case 'https:':
			return parsed.origin;
		case 'ws:':
		case 'wss:':
			// A confined app's own dev server routinely also serves a same-host WebSocket
			// (HMR, live reload, app-level realtime data). This is always a subresource of
			// the already-loaded page, never a navigable document a page or frame could be
			// replaced with, so it must never be recognized as a top-level/host-initiated
			// target -- only as a Subresource/Frame request context.
			if (context === BrowserViewAppPolicyRequestContext.TopLevel || context === BrowserViewAppPolicyRequestContext.HostInitiated) {
				return undefined;
			}
			return `${parsed.protocol === 'wss:' ? 'https:' : 'http:'}//${parsed.host}`;
		default:
			// `file:` is deliberately NOT recognized as an app-policy origin in any
			// context. Unlike a loopback dev server's http(s) origin, `file://` has no
			// host to scope to -- treating it as one universal origin (the prior
			// behavior here) would let a policy confined to one local file silently
			// grant access to the entire local filesystem. `tryCreateAppPolicyForOrigin`
			// likewise refuses to create a `file:`-origin policy at all; any incidental
			// `file:` URL encountered under an existing http(s)/ws(s) policy simply
			// fails this origin check and is blocked like any other off-origin request.
			return undefined;
	}
}

/**
 * Decide how a navigation, subresource load, or frame request should be
 * handled under `policy`. Used uniformly for top-level navigation
 * (`will-navigate`/`will-redirect`/initial `loadURL`), popups
 * (`setWindowOpenHandler`), and subresource/frame requests
 * (`webRequest.onBeforeRequest`) so all of these surfaces enforce the exact
 * same rule -- `context` distinguishes which of those call sites is asking so
 * that scheme-specific and escape-hatch exceptions can be scoped correctly.
 */
export function decideBrowserViewAppPolicyNavigation(policy: IBrowserViewAppPolicy, url: string, context: BrowserViewAppPolicyRequestContext): BrowserViewAppPolicyDecision {
	if (context === BrowserViewAppPolicyRequestContext.Popup) {
		return BrowserViewAppPolicyDecision.Block;
	}
	const lower = url.trimStart().toLowerCase();

	if (lower === 'about:blank' || lower.startsWith('about:blank#') || lower.startsWith('about:blank?')) {
		// Blank child frames can inherit the app origin, but may not replace the app itself.
		return context === BrowserViewAppPolicyRequestContext.Frame || context === BrowserViewAppPolicyRequestContext.Subresource
			? BrowserViewAppPolicyDecision.Allow
			: BrowserViewAppPolicyDecision.Block;
	}

	if (lower.startsWith('data:')) {
		// As a *document* (top-level or frame target), a `data:` URL is itself opaque,
		// attacker-controllable markup/script that would silently replace what the user
		// sees as "the canvas" -- with no origin at all to hold accountable. Only allow
		// it as a Subresource (e.g. an inlined image/font a same-origin page legitimately
		// produces), never as something that can itself become the confined document.
		return context === BrowserViewAppPolicyRequestContext.Subresource
			? BrowserViewAppPolicyDecision.Allow
			: BrowserViewAppPolicyDecision.Block;
	}

	if (lower.startsWith('blob:')) {
		// Allowed in any context, but only when attributable to the exact allowed
		// origin: a `blob:` URL created by the confined app's own origin is content
		// that origin produced itself, but an unattributed or off-origin blob must not
		// be trusted merely because the scheme parses.
		return tryGetBlobOrigin(url) === policy.allowedOrigin
			? BrowserViewAppPolicyDecision.Allow
			: BrowserViewAppPolicyDecision.Block;
	}

	const origin = tryGetAppPolicyOrigin(url, context);
	if (origin === policy.allowedOrigin) {
		return BrowserViewAppPolicyDecision.Allow;
	}

	if (context === BrowserViewAppPolicyRequestContext.HostInitiated && policy.allowExternalLinks && (url.startsWith('http:') || url.startsWith('https:'))) {
		// The user-mediated "open externally" escape hatch is reserved for genuine
		// host-trusted navigation (see `HostInitiated`'s doc comment). Popups instead
		// prove real, recent user intent via `isExternalLinkTarget` plus a gesture
		// check at their own call site; will-navigate/will-redirect never reach this
		// branch at all, since they're always requested with `TopLevel`.
		return BrowserViewAppPolicyDecision.OpenExternal;
	}

	return BrowserViewAppPolicyDecision.Block;
}

/**
 * Whether `url` is a plain `http(s)` target outside `policy`'s allowed origin
 * that {@link IBrowserViewAppPolicy.allowExternalLinks} permits handing off to
 * the OS's default browser. Deliberately independent of request context and
 * of any gesture/timing state: this only answers "is this policy-eligible for
 * external hand-off at all". Callers that can act on guest-reachable input
 * (e.g. `setWindowOpenHandler`'s popup target) must still separately prove a
 * real, recent user gesture before actually invoking `shell.openExternal`.
 */
export function isExternalLinkTarget(policy: IBrowserViewAppPolicy, url: string): boolean {
	if (!policy.allowExternalLinks || !(url.startsWith('http:') || url.startsWith('https:'))) {
		return false;
	}
	const origin = tryGetAppPolicyOrigin(url, BrowserViewAppPolicyRequestContext.TopLevel);
	return origin !== undefined && origin !== policy.allowedOrigin;
}

/** Structural equality for two policies (used to detect an attempted silent ownership/origin change on reuse). */
export function equalsBrowserViewAppPolicy(a: IBrowserViewAppPolicy | undefined, b: IBrowserViewAppPolicy | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return a.allowedOrigin === b.allowedOrigin && !!a.allowExternalLinks === !!b.allowExternalLinks;
}

/**
 * Derives an {@link IBrowserViewAppPolicy} confined to `initialUrl`'s own
 * `http(s)` origin, or `undefined` if `initialUrl` has no such origin (e.g.
 * `file:`, `data:`, or an unparsable URL) -- callers must treat `undefined`
 * as "this URL cannot be policy-confined at all", not fall back to an
 * unconfined/always-allow policy.
 */
export function tryCreateAppPolicyForOrigin(initialUrl: string, options?: { allowExternalLinks?: boolean }): IBrowserViewAppPolicy | undefined {
	const origin = tryGetAppPolicyOrigin(initialUrl, BrowserViewAppPolicyRequestContext.HostInitiated);
	if (!origin) {
		return undefined;
	}
	return { allowedOrigin: origin, allowExternalLinks: options?.allowExternalLinks };
}
