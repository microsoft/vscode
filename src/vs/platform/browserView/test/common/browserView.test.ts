/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../agentHost/common/agentHostUri.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { extUri, extUriIgnorePathCase } from '../../../../base/common/resources.js';
import { BrowserViewPresentation, getBrowserViewRemoteFile, BrowserViewStorageScope, getAgentBrowserViewCreationDefaults, getBrowserViewPopupAction, remoteUrlToFileUrl, isBrowserViewAssociatedResourceNavigation, isBrowserViewStorageScopeShareableWithAgent, isInMemoryStorageScope, matchesBrowserViewAudience } from '../../common/browserView.js';

suite('BrowserView', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps vscode-remote URLs of the session network to file URLs', () => {
		const network = { authority: 'ssh-remote+Host' };
		const url = 'vscode-remote://ssh-remote%2Bhost/a/index.html?x=1#top';

		assert.deepStrictEqual({
			sameRemote: remoteUrlToFileUrl(network, url),
			noNetwork: remoteUrlToFileUrl(undefined, url),
			otherNetwork: remoteUrlToFileUrl({ authority: 'wsl+Ubuntu' }, url),
			web: remoteUrlToFileUrl(network, 'https://example.com/a'),
			encodedPercent: remoteUrlToFileUrl(network, 'vscode-remote://ssh-remote%2Bhost/a/report%2520.html'),
			posixColon: remoteUrlToFileUrl(network, 'vscode-remote://ssh-remote%2Bhost/a:b/c:d e.html'),
			windowsDrive: remoteUrlToFileUrl(network, 'vscode-remote://ssh-remote%2Bhost/c:/work/index.html'),
			encodedSuffix: remoteUrlToFileUrl(network, 'vscode-remote://ssh-remote%2Bhost/a/i.html?q=a%26b#item%2520id'),
			agentHostQuery: remoteUrlToFileUrl({ authority: 'host-a' }, toAgentHostUri(URI.file('/a/i.html').with({ query: 'q=a%26b' }), 'host-a').toString()),
			agentHost: remoteUrlToFileUrl({ authority: 'Host-A' }, toAgentHostUri(URI.file('/a/index.html'), 'host-a').toString()),
			agentHostUncShare: remoteUrlToFileUrl({ authority: 'host-a' }, toAgentHostUri(URI.from({ scheme: 'file', authority: 'server', path: '/share/index.html' }), 'host-a').toString()),
			otherAgentHost: remoteUrlToFileUrl({ authority: 'host-b' }, toAgentHostUri(URI.file('/a/index.html'), 'host-a').toString()),
		}, {
			sameRemote: 'file:///a/index.html?x=1#top',
			noNetwork: url,
			otherNetwork: url,
			web: 'https://example.com/a',
			encodedPercent: 'file:///a/report%2520.html',
			posixColon: 'file:///a:b/c:d%20e.html',
			windowsDrive: 'file:///c:/work/index.html',
			encodedSuffix: 'file:///a/i.html?q=a%26b#item%2520id',
			agentHostQuery: 'file:///a/i.html?q=a%26b',
			agentHost: 'file:///a/index.html',
			agentHostUncShare: toAgentHostUri(URI.from({ scheme: 'file', authority: 'server', path: '/share/index.html' }), 'host-a').toString(),
			otherAgentHost: toAgentHostUri(URI.file('/a/index.html'), 'host-a').toString(),
		});
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

	test('treats the file URL of a remote resource as the same resource', () => {
		const network = { authority: 'ssh-remote+host' };
		const remote = URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+host', path: '/a/index.html' });
		const windowsRemote = URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+host', path: '/c:/Repo/index.html' });
		const agentHost = toAgentHostUri(URI.file('/a/index.html'), 'host-a');

		assert.deepStrictEqual({
			remoteFile: isBrowserViewAssociatedResourceNavigation(remote, 'file:///a/index.html?x=1', network),
			remoteOther: isBrowserViewAssociatedResourceNavigation(remote, 'file:///a/other.html', network),
			agentHostFile: isBrowserViewAssociatedResourceNavigation(agentHost, 'file:///a/index.html#top', { authority: 'host-a' }),
			remoteWithoutNetwork: isBrowserViewAssociatedResourceNavigation(remote, 'file:///a/index.html'),
			windowsRemoteCase: isBrowserViewAssociatedResourceNavigation(windowsRemote, 'file:///c:/repo/index.html?x=1', network, extUriIgnorePathCase),
			caseSensitiveRemoteCase: isBrowserViewAssociatedResourceNavigation(windowsRemote, 'file:///c:/repo/index.html?x=1', network, extUri),
		}, {
			remoteFile: true,
			remoteOther: false,
			agentHostFile: true,
			remoteWithoutNetwork: false,
			windowsRemoteCase: true,
			caseSensitiveRemoteCase: false,
		});
	});

	test('opens only user-initiated web popups from unlisted views externally', () => {
		assert.deepStrictEqual({
			listed: getBrowserViewPopupAction(BrowserViewPresentation.Listed, 'https://example.com/', false),
			https: getBrowserViewPopupAction(BrowserViewPresentation.Unlisted, 'https://example.com/', true),
			http: getBrowserViewPopupAction(BrowserViewPresentation.Unlisted, 'http://example.com/', true),
			noGesture: getBrowserViewPopupAction(BrowserViewPresentation.Unlisted, 'https://example.com/', false),
			customScheme: getBrowserViewPopupAction(BrowserViewPresentation.Unlisted, 'vscode://settings', true),
			blank: getBrowserViewPopupAction(BrowserViewPresentation.Unlisted, 'about:blank', true),
			remote: getBrowserViewPopupAction(BrowserViewPresentation.Unlisted, 'https://example.com/', true, true),
		}, {
			listed: { action: 'integrated', consumeUserGesture: false },
			https: { action: 'external', consumeUserGesture: true },
			http: { action: 'external', consumeUserGesture: true },
			noGesture: { action: 'deny', consumeUserGesture: false },
			customScheme: { action: 'deny', consumeUserGesture: false },
			blank: { action: 'deny', consumeUserGesture: false },
			remote: { action: 'deny', consumeUserGesture: true },
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
				session: { scope: BrowserViewStorageScope.Agent, affinity: undefined, network: undefined }
			},
			agentsWindow: {
				owner: { type: 'agent', sessionId: 'chat-session' },
				initialAudiences: [{ type: 'agent' }],
				session: {
					scope: BrowserViewStorageScope.Agent,
					affinity: 'chat-session',
					network: undefined
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

	test('finds the file on the remote disk', () => {
		assert.deepStrictEqual({
			remote: getBrowserViewRemoteFile(URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+a', path: '/repo' })),
			agentHost: getBrowserViewRemoteFile(toAgentHostUri(URI.file('/repo'), 'host-a')),
			fileAuthority: getBrowserViewRemoteFile(toAgentHostUri(URI.from({ scheme: 'file', authority: 'server', path: '/share' }), 'host-a')),
			local: getBrowserViewRemoteFile(URI.file('/repo')),
		}, {
			remote: { scheme: 'vscode-remote', authority: 'ssh-remote+a', fileUri: URI.file('/repo') },
			agentHost: { scheme: AGENT_HOST_SCHEME, authority: 'host-a', fileUri: URI.file('/repo') },
			fileAuthority: undefined,
			local: undefined,
		});
	});
});
