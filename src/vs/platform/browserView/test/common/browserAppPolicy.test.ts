/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	BrowserViewAppPolicyDecision,
	BrowserViewAppPolicyRequestContext as Ctx,
	decideBrowserViewAppPolicyNavigation,
	equalsBrowserViewAppPolicy,
	IBrowserViewAppPolicy,
	isExternalLinkTarget,
	tryCreateAppPolicyForOrigin,
	tryGetAppPolicyOrigin,
} from '../../common/browserAppPolicy.js';

suite('BrowserView App Policy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('tryGetAppPolicyOrigin derives scheme+host+port for http(s), rejects file: universally, and rejects unparseable input', () => {
		assert.deepStrictEqual({
			http: tryGetAppPolicyOrigin('http://localhost:3000/foo', Ctx.HostInitiated),
			https: tryGetAppPolicyOrigin('https://example.com/bar?x=1', Ctx.TopLevel),
			// file: is never recognized as an app-policy origin in any context -- there is
			// no per-file host to scope a policy to, so treating it as one universal
			// origin would grant access to the entire local filesystem.
			fileHostInitiated: tryGetAppPolicyOrigin('file:///Users/me/app/index.html', Ctx.HostInitiated),
			fileSubresource: tryGetAppPolicyOrigin('file:///Users/me/app/index.html', Ctx.Subresource),
			notAUrl: tryGetAppPolicyOrigin('not a url', Ctx.HostInitiated),
			empty: tryGetAppPolicyOrigin('', Ctx.HostInitiated),
		}, {
			http: 'http://localhost:3000',
			https: 'https://example.com',
			fileHostInitiated: undefined,
			fileSubresource: undefined,
			notAUrl: undefined,
			empty: undefined,
		});
	});

	test('tryGetAppPolicyOrigin recognizes ws(s): as the same-host origin only for request contexts, never as a top-level/host-initiated target', () => {
		assert.deepStrictEqual({
			wsSubresource: tryGetAppPolicyOrigin('ws://localhost:3000/socket', Ctx.Subresource),
			wssSubresource: tryGetAppPolicyOrigin('wss://localhost:3000/socket', Ctx.Subresource),
			wsFrame: tryGetAppPolicyOrigin('ws://localhost:3000/socket', Ctx.Frame),
			wsTopLevel: tryGetAppPolicyOrigin('ws://localhost:3000/socket', Ctx.TopLevel),
			wsHostInitiated: tryGetAppPolicyOrigin('ws://localhost:3000/socket', Ctx.HostInitiated),
		}, {
			wsSubresource: 'http://localhost:3000',
			wssSubresource: 'https://localhost:3000',
			wsFrame: 'http://localhost:3000',
			wsTopLevel: undefined,
			wsHostInitiated: undefined,
		});
	});

	test('tryCreateAppPolicyForOrigin derives the allowed origin from the initial URL only, and rejects unsupported origins like file:', () => {
		const policy = tryCreateAppPolicyForOrigin('http://localhost:4000/index.html#/route');
		assert.deepStrictEqual(policy, { allowedOrigin: 'http://localhost:4000', allowExternalLinks: undefined });

		assert.strictEqual(tryCreateAppPolicyForOrigin('data:text/html,hi'), undefined);
		// file: is rejected rather than granted a universal/whole-filesystem policy.
		assert.strictEqual(tryCreateAppPolicyForOrigin('file:///Users/me/app/index.html'), undefined);

		const withExternal = tryCreateAppPolicyForOrigin('https://app.local', { allowExternalLinks: true });
		assert.deepStrictEqual(withExternal, { allowedOrigin: 'https://app.local', allowExternalLinks: true });
	});

	test('decideBrowserViewAppPolicyNavigation allows the exact allowed origin in every context', () => {
		const policy: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:3000' };
		for (const context of [Ctx.HostInitiated, Ctx.TopLevel, Ctx.Frame, Ctx.Subresource]) {
			assert.strictEqual(
				decideBrowserViewAppPolicyNavigation(policy, 'http://localhost:3000/some/path?x=1', context),
				BrowserViewAppPolicyDecision.Allow,
				`context ${context}`);
		}
	});

	test('canvas popups are denied even for the approved origin until child ownership is supported', () => {
		const policy: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:3000', allowExternalLinks: true };
		assert.deepStrictEqual([
			'http://localhost:3000/another-canvas',
			'blob:http://localhost:3000/document',
			'about:blank',
			'https://example.com/',
		].map(url => decideBrowserViewAppPolicyNavigation(policy, url, Ctx.Popup)), [
			BrowserViewAppPolicyDecision.Block,
			BrowserViewAppPolicyDecision.Block,
			BrowserViewAppPolicyDecision.Block,
			BrowserViewAppPolicyDecision.Block,
		]);
	});

	test('decideBrowserViewAppPolicyNavigation confines about:blank to frames and resources, never a top-level replacement', () => {
		const policy: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:3000' };
		for (const context of [Ctx.HostInitiated, Ctx.TopLevel, Ctx.Frame, Ctx.Subresource]) {
			const expected = context === Ctx.Frame || context === Ctx.Subresource ? BrowserViewAppPolicyDecision.Allow : BrowserViewAppPolicyDecision.Block;
			assert.deepStrictEqual({
				plain: decideBrowserViewAppPolicyNavigation(policy, 'about:blank', context),
				hash: decideBrowserViewAppPolicyNavigation(policy, 'about:blank#x', context),
				query: decideBrowserViewAppPolicyNavigation(policy, 'about:blank?x=1', context),
			}, {
				plain: expected,
				hash: expected,
				query: expected,
			}, `context ${context}`);
		}
	});

	test('decideBrowserViewAppPolicyNavigation only allows data: as a subresource, never as a document that could replace the canvas', () => {
		const policy: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:3000' };
		assert.deepStrictEqual({
			subresource: decideBrowserViewAppPolicyNavigation(policy, 'data:text/html,<h1>hi</h1>', Ctx.Subresource),
			hostInitiated: decideBrowserViewAppPolicyNavigation(policy, 'data:text/html,<h1>hi</h1>', Ctx.HostInitiated),
			topLevel: decideBrowserViewAppPolicyNavigation(policy, 'data:text/html,<h1>hi</h1>', Ctx.TopLevel),
			frame: decideBrowserViewAppPolicyNavigation(policy, 'data:text/html,<h1>hi</h1>', Ctx.Frame),
		}, {
			subresource: BrowserViewAppPolicyDecision.Allow,
			hostInitiated: BrowserViewAppPolicyDecision.Block,
			topLevel: BrowserViewAppPolicyDecision.Block,
			frame: BrowserViewAppPolicyDecision.Block,
		});
	});

	test('decideBrowserViewAppPolicyNavigation only allows blob: when attributable to the exact allowed origin, in any context', () => {
		const policy: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:3000' };
		for (const context of [Ctx.HostInitiated, Ctx.TopLevel, Ctx.Frame, Ctx.Subresource]) {
			assert.deepStrictEqual({
				sameOrigin: decideBrowserViewAppPolicyNavigation(policy, 'blob:http://localhost:3000/uuid', context),
				offOrigin: decideBrowserViewAppPolicyNavigation(policy, 'blob:http://evil.example.com/uuid', context),
				unattributable: decideBrowserViewAppPolicyNavigation(policy, 'blob:not-a-url', context),
			}, {
				sameOrigin: BrowserViewAppPolicyDecision.Allow,
				offOrigin: BrowserViewAppPolicyDecision.Block,
				unattributable: BrowserViewAppPolicyDecision.Block,
			}, `context ${context}`);
		}
	});

	test('decideBrowserViewAppPolicyNavigation allows same-host ws(s): only as a request/frame context, never as a top-level target', () => {
		const policy: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:3000' };
		assert.deepStrictEqual({
			subresourceWs: decideBrowserViewAppPolicyNavigation(policy, 'ws://localhost:3000/socket', Ctx.Subresource),
			subresourceWss: decideBrowserViewAppPolicyNavigation({ allowedOrigin: 'https://localhost:3000' }, 'wss://localhost:3000/socket', Ctx.Subresource),
			frameWs: decideBrowserViewAppPolicyNavigation(policy, 'ws://localhost:3000/socket', Ctx.Frame),
			// Never a viable top-level/host-initiated document, regardless of host match.
			topLevelWs: decideBrowserViewAppPolicyNavigation(policy, 'ws://localhost:3000/socket', Ctx.TopLevel),
			hostInitiatedWs: decideBrowserViewAppPolicyNavigation(policy, 'ws://localhost:3000/socket', Ctx.HostInitiated),
			offHostWs: decideBrowserViewAppPolicyNavigation(policy, 'ws://evil.example.com/socket', Ctx.Subresource),
		}, {
			subresourceWs: BrowserViewAppPolicyDecision.Allow,
			subresourceWss: BrowserViewAppPolicyDecision.Allow,
			frameWs: BrowserViewAppPolicyDecision.Allow,
			topLevelWs: BrowserViewAppPolicyDecision.Block,
			hostInitiatedWs: BrowserViewAppPolicyDecision.Block,
			offHostWs: BrowserViewAppPolicyDecision.Block,
		});
	});

	test('decideBrowserViewAppPolicyNavigation blocks a different origin, port, or scheme by default in every context', () => {
		const policy: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:3000' };
		for (const context of [Ctx.HostInitiated, Ctx.TopLevel, Ctx.Frame, Ctx.Subresource]) {
			assert.deepStrictEqual({
				differentHost: decideBrowserViewAppPolicyNavigation(policy, 'http://evil.example.com/', context),
				differentPort: decideBrowserViewAppPolicyNavigation(policy, 'http://localhost:9999/', context),
				differentScheme: decideBrowserViewAppPolicyNavigation(policy, 'https://localhost:3000/', context),
				unparseable: decideBrowserViewAppPolicyNavigation(policy, 'not a url', context),
				fileUrl: decideBrowserViewAppPolicyNavigation(policy, 'file:///etc/passwd', context),
			}, {
				differentHost: BrowserViewAppPolicyDecision.Block,
				differentPort: BrowserViewAppPolicyDecision.Block,
				differentScheme: BrowserViewAppPolicyDecision.Block,
				unparseable: BrowserViewAppPolicyDecision.Block,
				fileUrl: BrowserViewAppPolicyDecision.Block,
			}, `context ${context}`);
		}
	});

	test('decideBrowserViewAppPolicyNavigation hands off external http(s) links only for HostInitiated navigation with allowExternalLinks set', () => {
		const withoutExternal: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:3000' };
		const withExternal: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:3000', allowExternalLinks: true };

		assert.deepStrictEqual({
			blockedByDefault: decideBrowserViewAppPolicyNavigation(withoutExternal, 'https://example.com/', Ctx.HostInitiated),
			externalHttp: decideBrowserViewAppPolicyNavigation(withExternal, 'http://example.com/', Ctx.HostInitiated),
			externalHttps: decideBrowserViewAppPolicyNavigation(withExternal, 'https://example.com/', Ctx.HostInitiated),
			// Even with allowExternalLinks, non-http(s) off-origin targets are never handed off.
			externalFile: decideBrowserViewAppPolicyNavigation(withExternal, 'file:///etc/passwd', Ctx.HostInitiated),
			// The escape hatch is reserved for HostInitiated: guest-reachable contexts
			// (TopLevel/Frame/Subresource) must never produce OpenExternal, even with the
			// flag set, since a compromised/malicious page could otherwise manufacture an
			// OS hand-off with no proof of genuine user intent.
			topLevelNeverExternal: decideBrowserViewAppPolicyNavigation(withExternal, 'https://example.com/', Ctx.TopLevel),
			frameNeverExternal: decideBrowserViewAppPolicyNavigation(withExternal, 'https://example.com/', Ctx.Frame),
			subresourceNeverExternal: decideBrowserViewAppPolicyNavigation(withExternal, 'https://example.com/', Ctx.Subresource),
		}, {
			blockedByDefault: BrowserViewAppPolicyDecision.Block,
			externalHttp: BrowserViewAppPolicyDecision.OpenExternal,
			externalHttps: BrowserViewAppPolicyDecision.OpenExternal,
			externalFile: BrowserViewAppPolicyDecision.Block,
			topLevelNeverExternal: BrowserViewAppPolicyDecision.Block,
			frameNeverExternal: BrowserViewAppPolicyDecision.Block,
			subresourceNeverExternal: BrowserViewAppPolicyDecision.Block,
		});
	});

	test('isExternalLinkTarget answers the context-independent "is this policy-eligible for external hand-off" question', () => {
		const withoutExternal: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:3000' };
		const withExternal: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:3000', allowExternalLinks: true };

		assert.deepStrictEqual({
			flagNotSet: isExternalLinkTarget(withoutExternal, 'https://example.com/'),
			sameOrigin: isExternalLinkTarget(withExternal, 'http://localhost:3000/'),
			offOriginHttp: isExternalLinkTarget(withExternal, 'http://example.com/'),
			offOriginHttps: isExternalLinkTarget(withExternal, 'https://example.com/'),
			fileNeverExternal: isExternalLinkTarget(withExternal, 'file:///etc/passwd'),
		}, {
			flagNotSet: false,
			sameOrigin: false,
			offOriginHttp: true,
			offOriginHttps: true,
			fileNeverExternal: false,
		});
	});

	test('equalsBrowserViewAppPolicy detects an attempted silent origin/flag change on reuse', () => {
		const a: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:3000' };
		const b: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:3000' };
		const differentOrigin: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:4000' };
		const differentExternal: IBrowserViewAppPolicy = { allowedOrigin: 'http://localhost:3000', allowExternalLinks: true };

		assert.deepStrictEqual({
			equalDistinctObjects: equalsBrowserViewAppPolicy(a, b),
			sameReference: equalsBrowserViewAppPolicy(a, a),
			bothUndefined: equalsBrowserViewAppPolicy(undefined, undefined),
			oneUndefined: equalsBrowserViewAppPolicy(a, undefined),
			differentOrigin: equalsBrowserViewAppPolicy(a, differentOrigin),
			differentExternalFlag: equalsBrowserViewAppPolicy(a, differentExternal),
		}, {
			equalDistinctObjects: true,
			sameReference: true,
			bothUndefined: true,
			oneUndefined: false,
			differentOrigin: false,
			differentExternalFlag: false,
		});
	});
});
