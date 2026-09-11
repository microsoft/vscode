/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BrowserViewStorageScope, canReuseBrowserView, getAgentBrowserViewCreationDefaults, IBrowserViewCreateOptions, IBrowserViewInfo, isBrowserViewAssociatedResourceNavigation, isBrowserViewStorageScopeShareableWithAgent, isInMemoryStorageScope, matchesBrowserViewAudience } from '../../common/browserView.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';

suite('BrowserView', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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

	test('retains ordinary browser reuse but recreates resolved sources', () => {
		const source = URI.parse('test-page:/document');
		const existing = upcastPartial<IBrowserViewInfo>({ host: { windowId: 1 } });
		const options: IBrowserViewCreateOptions = {
			host: { windowId: 1 },
			owner: { type: 'user' },
			session: { scope: BrowserViewStorageScope.Ephemeral },
		};

		assert.deepStrictEqual({
			ordinary: canReuseBrowserView(existing, options),
			ordinaryInAnotherWindow: canReuseBrowserView(existing, { ...options, host: { windowId: 2 } }),
			source: canReuseBrowserView({ ...existing, source }, { ...options, source }),
		}, { ordinary: true, ordinaryInAnotherWindow: true, source: false });
	});

	test('rejects source restoration with a different source or owning window', () => {
		const source = URI.parse('test-page:/document');
		const existing = upcastPartial<IBrowserViewInfo>({ host: { windowId: 1 }, source });
		const options: IBrowserViewCreateOptions = {
			host: { windowId: 1 },
			owner: { type: 'user' },
			session: { scope: BrowserViewStorageScope.Ephemeral },
			source,
		};

		assert.throws(() => canReuseBrowserView(existing, { ...options, host: { windowId: 2 } }), /different workbench window/);
		assert.throws(() => canReuseBrowserView(existing, { ...options, source: source.with({ path: '/another-document' }) }), /source does not match/);
		assert.throws(() => canReuseBrowserView(existing, { ...options, source: undefined }), /source does not match/);
		assert.throws(() => canReuseBrowserView({ ...existing, source: undefined }, options), /source does not match/);
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
