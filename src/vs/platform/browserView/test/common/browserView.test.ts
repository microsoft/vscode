/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BrowserViewStorageScope, externalBrowserViewStorageAffinity, getAgentBrowserViewCreationDefaults, IBrowserViewCreateOptions, IBrowserViewInfo, isBrowserViewAssociatedResourceNavigation, isBrowserViewStorageScopeShareableWithAgent, isExternalCanvasLinkAllowed, isInMemoryStorageScope, matchesBrowserViewAudience, snapBrowserViewBounds, validateBrowserViewReuse, validateExternalBrowserViewOptions } from '../../common/browserView.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';

suite('BrowserView', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('external canvas links are limited to web and mail applications, without URL userinfo', () => {
		assert.deepStrictEqual([
			'https://example.test/docs', 'http://127.0.0.1:9000/link', 'mailto:hello@example.test',
			'https://user:password@example.test', 'javascript:alert(1)', 'file:///private/file', 'vscode://extension/action', 'https:/missing-host',
		].map(isExternalCanvasLinkAllowed), [true, true, true, false, false, false, false, false]);
	});

	test('external presentation identity survives enumeration and rejects ordinary or foreign-window reuse', () => {
		const resource = URI.parse('test-canvas:/authority/session/chat/instance');
		const options: IBrowserViewCreateOptions = {
			presentation: { type: 'external', resource },
			host: { windowId: 1 },
			owner: { type: 'user' },
			session: { scope: BrowserViewStorageScope.Agent, affinity: externalBrowserViewStorageAffinity(resource) },
			initialAudiences: [],
		};
		const enumerated = upcastPartial<IBrowserViewInfo>({ id: 'view', presentation: options.presentation, host: options.host });
		validateExternalBrowserViewOptions(options);
		assert.throws(() => validateExternalBrowserViewOptions(options, [enumerated]), /already attached/);
		validateExternalBrowserViewOptions(options, [{ presentation: { type: 'external', resource: URI.parse('test-canvas:/another-owner') } }]);
		validateBrowserViewReuse(enumerated, options);
		assert.throws(() => validateBrowserViewReuse(enumerated, { ...options, presentation: undefined }), /presentation/);
		assert.throws(() => validateBrowserViewReuse(enumerated, { ...options, host: { windowId: 2 } }), /owning window/);
		assert.throws(() => validateBrowserViewReuse(enumerated, { ...options, presentation: { type: 'external', resource: URI.parse('test-canvas:/other') } }), /presentation/);
	});

	test('external pages require explicit isolated storage without wildcard audiences', () => {
		const resource = URI.parse('test-canvas:/authority/session/chat/instance');
		const options: IBrowserViewCreateOptions = {
			presentation: { type: 'external', resource },
			host: { windowId: 1 }, owner: { type: 'user' }, initialAudiences: [],
			session: { scope: BrowserViewStorageScope.Agent, affinity: externalBrowserViewStorageAffinity(resource) },
		};
		for (const override of [
			{ session: { scope: BrowserViewStorageScope.Global } },
			{ session: { scope: BrowserViewStorageScope.Workspace } },
			{ session: { scope: BrowserViewStorageScope.Agent } },
			{ session: 'agent:another-instance' },
			{ initialAudiences: undefined },
			{ initialAudiences: [{ type: 'agent' as const }] },
			{ owner: { type: 'agent' as const, sessionId: 'chat' } },
		]) {
			assert.throws(() => validateExternalBrowserViewOptions({ ...options, ...override }), /isolated storage/);
		}
	});

	test('native layout snaps the absolute origin as well as its size at fractional zoom', () => {
		assert.deepStrictEqual(
			snapBrowserViewBounds({ x: 10.3, y: 20.7, width: 400.3, height: 250.8 }, 1.25),
			{ x: 9.6, y: 20, width: 400, height: 250.4 },
		);
	});

	test('allows navigation within an associated resource', () => {
		const associatedResource = URI.file('/workspace/index.html');

		assert.deepStrictEqual({
			sameResource: isBrowserViewAssociatedResourceNavigation(associatedResource, associatedResource.toString()),
			query: isBrowserViewAssociatedResourceNavigation(associatedResource, associatedResource.with({ query: 'theme=dark' }).toString()),
			fragment: isBrowserViewAssociatedResourceNavigation(associatedResource, associatedResource.with({ fragment: 'section' }).toString()),
			otherFile: isBrowserViewAssociatedResourceNavigation(associatedResource, URI.file('/workspace/other.html').toString()),
			otherScheme: isBrowserViewAssociatedResourceNavigation(associatedResource, 'https://example.com/')
		}, {
			sameResource: true,
			query: true,
			fragment: true,
			otherFile: false,
			otherScheme: false
		});
	});

	test('matches audiences against patterns', () => {
		const candidate = { type: 'agent', sessionId: 'session' } as const;

		assert.deepStrictEqual({
			allAgents: matchesBrowserViewAudience(candidate, { type: 'agent' }),
			session: matchesBrowserViewAudience(candidate, { type: 'agent', sessionId: 'session' }),
			otherSession: matchesBrowserViewAudience(candidate, { type: 'agent', sessionId: 'other' }),
		}, {
			allAgents: true,
			session: true,
			otherSession: false,
		});
	});

	test('matches audiences for filtered removal', () => {
		assert.deepStrictEqual({
			generic: matchesBrowserViewAudience({ type: 'agent', sessionId: 'session' }, { type: 'agent' }),
			session: matchesBrowserViewAudience({ type: 'agent', sessionId: 'session' }, { type: 'agent', sessionId: 'session' }),
			otherSession: matchesBrowserViewAudience({ type: 'agent', sessionId: 'session' }, { type: 'agent', sessionId: 'other' }),
		}, {
			generic: true,
			session: true,
			otherSession: false
		});
	});

	test('configures agent storage affinity independently from ownership', () => {
		assert.deepStrictEqual({
			editorWindow: getAgentBrowserViewCreationDefaults('chat-session'),
			agentsWindow: getAgentBrowserViewCreationDefaults('chat-session', 'chat-session'),
		}, {
			editorWindow: {
				owner: { type: 'agent', sessionId: 'chat-session' },
				initialAudiences: [{ type: 'agent' }],
				session: { scope: BrowserViewStorageScope.Agent }
			},
			agentsWindow: {
				owner: { type: 'agent', sessionId: 'chat-session' },
				initialAudiences: [{ type: 'agent' }],
				session: {
					scope: BrowserViewStorageScope.Agent,
					affinity: 'chat-session'
				}
			}
		});
	});

	test('identifies in-memory storage scopes', () => {
		assert.deepStrictEqual({
			global: isInMemoryStorageScope(BrowserViewStorageScope.Global),
			workspace: isInMemoryStorageScope(BrowserViewStorageScope.Workspace),
			ephemeral: isInMemoryStorageScope(BrowserViewStorageScope.Ephemeral),
			agent: isInMemoryStorageScope(BrowserViewStorageScope.Agent),
		}, {
			global: false,
			workspace: false,
			ephemeral: true,
			agent: true,
		});
	});

	test('only shares Agent storage when network filtering is enabled', () => {
		assert.deepStrictEqual({
			filteringDisabled: Object.fromEntries(Object.values(BrowserViewStorageScope).map(scope => [scope, isBrowserViewStorageScopeShareableWithAgent(scope, false)])),
			filteringEnabled: Object.fromEntries(Object.values(BrowserViewStorageScope).map(scope => [scope, isBrowserViewStorageScopeShareableWithAgent(scope, true)])),
		}, {
			filteringDisabled: {
				global: true,
				workspace: true,
				ephemeral: true,
				agent: true,
			},
			filteringEnabled: {
				global: false,
				workspace: false,
				ephemeral: false,
				agent: true,
			},
		});
	});
});
