/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { AuthenticateParams, IAgent } from '../../common/agent.js';
import { captureCredentialSource, parseCredentialPrincipal } from '../../common/agentHostCredentials.js';
import { AhpErrorCodes, AuthenticateTargetKind, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { AgentHostAuthenticationScope } from '../../node/agentHostAuthenticationScope.js';
import { AgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';

suite('AgentHostAuthenticationScope', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = 'https://api.github.com';
	const repository = `${resource}/repos`;
	const resources = [resource, repository];
	const principal = { apiOrigin: resource, userId: '1' };
	const validate = async (params: AuthenticateParams) => params;

	function createScope(validator = validate, checkAuthorization = () => { }) {
		return store.add(new AgentHostAuthenticationScope(validator, checkAuthorization, principal));
	}

	for (const local of [false, true]) {
		test(`session credentials use ${local ? 'host' : 'client'} tokens for Copilot and repository work`, async () => {
			const service = store.add(new AgentHostAuthenticationService(new NullLogService(), async () => assert.fail('Shared token selection must not validate the session owner'), {
				isEnabled: () => local,
				getResources: () => resources.map(resource => ({ resource })),
				onDidChange: Event.None,
			}));
			const provider = new class extends mock<IAgent>() {
				override getProtectedResources() { return resources.map(resource => ({ resource })); }
				override async authenticate() { return true; }
			}();
			for (const resource of resources) {
				await service.authenticate({ resource, token: resource === repository ? 'host-repo' : 'host-copilot' }, [provider]);
			}
			const remote = createScope();
			for (const resource of resources) {
				await remote.authenticate({ resource, token: resource === repository ? 'client-repo' : 'client-copilot' }, resources);
			}
			service.bindSessionCredentials('agent:/active', remote);
			service.restoreSessionCredentialPrincipal('agent:/restored', principal);
			const active = resources.map(resource => service.getAuthToken({ session: 'agent:/active', resource }));
			if (!local) {
				assert.throws(() => service.getAuthToken({ session: 'agent:/restored', resource: repository }), { code: AhpErrorCodes.AuthRequired });
			}
			assert.deepStrictEqual({
				active,
				restored: local ? resources.map(resource => service.getAuthToken({ session: 'agent:/restored', resource })) : undefined,
				ordinaryLocal: service.getAuthToken({ resource }),
			}, {
				active: local ? ['host-copilot', 'host-repo'] : ['client-copilot', 'client-repo'],
				restored: local ? ['host-copilot', 'host-repo'] : undefined,
				ordinaryLocal: 'host-copilot',
			});
		});
	}

	test('shared captures use the same advertised scope slots as ordinary host requests', async () => {
		const configured = [{ resource, scopes_supported: ['read:user'] }, { resource: repository, scopes_supported: ['repo'] }];
		const service = store.add(new AgentHostAuthenticationService(new NullLogService(), async () => assert.fail('Unexpected identity validation'), {
			isEnabled: () => true, getResources: () => configured, onDidChange: Event.None,
		}));
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return configured; }
			override async authenticate() { return true; }
		}();
		for (const metadata of configured) {
			await service.authenticate({ resource: metadata.resource, token: 'unscoped-token' }, [provider]);
			await service.authenticate({ resource: metadata.resource, scopes: ['other-scope'], token: 'other-scope-token' }, [provider]);
			await service.authenticate({ resource: metadata.resource, scopes: metadata.scopes_supported, token: `${metadata.resource}-selected` }, [provider]);
		}
		service.restoreSessionCredentialPrincipal('agent:/restored', principal);
		const captured = captureCredentialSource(service.getSessionCredentialSource('agent:/restored')!, configured);
		assert.deepStrictEqual({
			captured: configured.map(metadata => captured.getCredential({ resource: metadata.resource })?.token),
			host: configured.map(metadata => service.getAuthToken({ resource: metadata.resource, scopes: metadata.scopes_supported })),
		}, {
			captured: [`${resource}-selected`, `${repository}-selected`],
			host: [`${resource}-selected`, `${repository}-selected`],
		});
	});

	test('restored local sources use the shared token regardless of the recorded owner', async () => {
		const service = store.add(new AgentHostAuthenticationService(new NullLogService(), async () => assert.fail('Shared token selection must not validate the session owner'), {
			isEnabled: () => true,
			getResources: () => [{ resource: repository }],
			onDidChange: Event.None,
		}));
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [{ resource: repository }]; }
			override async authenticate() { return true; }
		}();
		const session = 'agent:/restored';
		service.restoreSessionCredentialPrincipal(session, principal);
		const beforeSignIn = service.getAuthToken({ session, resource: repository });
		await service.authenticate({ resource: repository, token: 'first-token' }, [provider]);
		const first = captureCredentialSource(service.getSessionCredentialSource(session)!, [{ resource: repository }]);
		await service.authenticate({ resource: repository, token: 'rotated-token' }, [provider]);
		const current = service.getAuthToken({ session, resource: repository });
		const capturedBeforeSignOut = first.getCredential({ resource: repository })?.token;
		await service.authenticate({ resource: repository, token: '' }, [provider]);
		const capturedAfterSignOut = first.getCredential({ resource: repository });
		service.restoreSessionCredentialPrincipal('agent:/other-owner', { ...principal, userId: '2' });
		await service.authenticate({ resource: repository, token: 'other-account-token' }, [provider]);
		const tokens = [session, 'agent:/other-owner'].map(session => service.getAuthToken({ session, resource: repository }));
		assert.deepStrictEqual({ beforeSignIn, current, capturedBeforeSignOut, capturedAfterSignOut, tokens }, {
			beforeSignIn: undefined, current: 'rotated-token', capturedBeforeSignOut: 'first-token', capturedAfterSignOut: undefined,
			tokens: ['other-account-token', 'other-account-token'],
		});
	});

	test('changing local credential mode changes new session captures without rebinding the remote source', async () => {
		const changed = store.add(new Emitter<void>());
		let enabled = false;
		const service = store.add(new AgentHostAuthenticationService(new NullLogService(), async () => assert.fail('Changing local mode must not validate credentials'), {
			isEnabled: () => enabled, getResources: () => [{ resource: repository }], onDidChange: changed.event,
		}));
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [{ resource: repository }]; }
			override async authenticate() { return true; }
		}();
		await service.authenticate({ resource: repository, token: 'host-token' }, [provider]);
		const remote = createScope();
		await remote.authenticate({ resource: repository, token: 'client-token' }, resources);
		service.bindSessionCredentials('agent:/active', remote);
		const read = () => service.getAuthToken({ session: 'agent:/active', resource: repository });
		const before = read();
		const refreshed = Event.toPromise(service.onDidChangeSessionCredentials);
		enabled = true;
		changed.fire();
		await refreshed;
		const during = read();
		const captured = captureCredentialSource(service.getSessionCredentialSource('agent:/active')!, [{ resource: repository }]);
		enabled = false;
		changed.fire();
		const after = read();
		const refreshedAgain = Event.toPromise(service.onDidChangeSessionCredentials);
		enabled = true;
		changed.fire();
		await refreshedAgain;
		assert.deepStrictEqual({ before, during, after, reenabled: read(), oldCapture: captured.getCredential({ resource: repository }) }, {
			before: 'client-token', during: 'host-token', after: 'client-token', reenabled: 'host-token', oldCapture: undefined,
		});
	});

	test('local session sources keep execution and monitoring MCP credentials separate across rebinding', async () => {
		const service = store.add(new AgentHostAuthenticationService(new NullLogService(), async () => assert.fail('Shared token selection must not validate the session owner'), {
			isEnabled: () => true, getResources: () => resources.map(resource => ({ resource })), onDidChange: Event.None,
		}));
		const mcp = 'https://mcp.example.test';
		const execution = createScope();
		const monitor = createScope();
		const replacement = createScope();
		await execution.authenticate({ resource: mcp, token: 'execution-mcp' }, [mcp]);
		await monitor.authenticate({ resource: mcp, token: 'monitor-mcp' }, [mcp]);
		await replacement.authenticate({ resource: mcp, token: 'replacement-mcp' }, [mcp]);
		const session = 'agent:/parent';
		const chat = 'agent:/chat';
		service.bindSessionCredentials(session, execution, chat);
		service.bindSessionCredentials(session, monitor, chat, 'agentMerge');
		const read = () => (['execution', 'agentMerge'] as const).map(usage => service.getSessionCredentialSource(chat, usage)?.getCredential({ resource: mcp })?.token);
		const before = read();
		service.bindSessionCredentials(session, replacement, chat, 'agentMerge');
		const after = read();
		service.bindSessionCredentials(session, undefined, chat, 'agentMerge');
		assert.deepStrictEqual({ before, after, monitorRemoved: read() }, {
			before: ['execution-mcp', 'monitor-mcp'],
			after: ['execution-mcp', 'replacement-mcp'],
			monitorRemoved: ['execution-mcp', undefined],
		});
	});

	test('scoped authentication never mutates legacy credentials, notifies legacy consumers or replays remotely supplied tokens', async () => {
		const service = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const providerTokens: string[] = [];
		const sessionTokens: string[] = [];
		const changedTokens: (string | undefined)[] = [];
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [{ resource }]; }
			override async authenticate(_resource: string, token: string) {
				providerTokens.push(token);
				return true;
			}
			override async handleAuthenticationToken(params: AuthenticateParams) {
				sessionTokens.push(params.token);
				return true;
			}
		}();
		store.add(service.onDidChangeAuthToken(event => changedTokens.push(event.token)));
		await service.authenticate({ resource, token: 'desktop' }, [provider]);
		const scope = createScope();
		await service.authenticate({ resource, token: 'remote' }, [provider], scope);
		const captured = {
			desktop: service.getAuthToken({ resource }),
			remote: service.getAuthToken({ resource }, scope),
			remoteRepository: service.getAuthToken({ resource: repository }, scope),
		};
		await service.replay(provider);
		scope.dispose();
		assert.deepStrictEqual({
			captured, providerTokens, sessionTokens, changedTokens,
			desktopAfter: service.getAuthToken({ resource }),
		}, {
			captured: { desktop: 'desktop', remote: 'remote', remoteRepository: undefined },
			providerTokens: ['desktop', 'desktop'],
			sessionTokens: ['desktop', 'desktop'],
			changedTokens: ['desktop'],
			desktopAfter: 'desktop',
		});
	});

	test('isolates captures, rotations and connection disposal', async () => {
		const broad = createScope();
		const narrow = createScope();
		await broad.authenticate({ resource, token: 'broad', scopes: ['repo', 'read:user'] }, resources);
		await narrow.authenticate({ resource, token: 'narrow', scopes: ['read:user'] }, resources);
		const before = {
			broad: broad.getCredential({ resource, scopes: ['repo'] })?.token,
			narrow: narrow.getCredential({ resource, scopes: ['repo'] })?.token,
			narrowIdentity: narrow.getCredential({ resource, scopes: ['read:user'] })?.token,
		};
		await narrow.authenticate({ resource, token: 'narrow-rotated', scopes: ['read:user'] }, resources);
		narrow.dispose();
		assert.deepStrictEqual({
			before,
			broadAfter: broad.getCredential({ resource, scopes: ['repo'] })?.token,
			broadRevision: broad.getCredential({ resource, scopes: ['repo'] })?.revision,
		}, {
			before: { broad: 'broad', narrow: 'narrow', narrowIdentity: 'narrow' },
			broadAfter: 'broad',
			broadRevision: 1,
		});
		assert.throws(() => narrow.getCredential({ resource }), { code: AhpErrorCodes.AuthRequired });
	});

	test('rotation replaces the resource slot and scope hints never select an older or different credential', async () => {
		const scope = createScope();
		await scope.authenticate({ resource, token: 'broad', scopes: ['gist', 'repo', 'read:user'] }, resources);
		await scope.authenticate({ resource: repository, token: 'repository', scopes: ['repo', 'repo'] }, resources);
		await scope.authenticate({ resource, token: 'identity', scopes: ['read:user'] }, resources);
		assert.deepStrictEqual({
			repository: scope.getCredential({ resource: repository, scopes: ['repo'] })?.token,
			combined: scope.getCredential({ resource, scopes: ['repo', 'read:user'] })?.token,
			missing: scope.getCredential({ resource, scopes: ['repo', 'workflow'] })?.token,
			previousGrant: scope.getCredential({ resource, scopes: ['repo'] })?.token,
			unscoped: scope.getCredential({ resource })?.token,
		}, { repository: 'repository', combined: 'identity', missing: 'identity', previousGrant: 'identity', unscoped: 'identity' });
	});

	test('legacy unscoped compatibility stays within the same connection and resource', async () => {
		const scope = createScope();
		const other = createScope();
		await scope.authenticate({ resource, token: 'legacy' }, resources);
		assert.deepStrictEqual({
			same: scope.getCredential({ resource, scopes: ['read:user'] })?.token,
			other: other.getCredential({ resource, scopes: ['read:user'] }),
			repository: scope.getCredential({ resource: repository, scopes: ['repo'] }),
		}, { same: 'legacy', other: undefined, repository: undefined });
	});

	test('rejected candidates preserve the active credential', async () => {
		const scope = createScope(async params => {
			if (params.token === 'rejected') {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Rejected credential');
			}
			return params;
		});
		await scope.authenticate({ resource, token: 'active' }, resources);
		await assert.rejects(scope.authenticate({ resource, token: 'rejected' }, resources), { code: JsonRpcErrorCodes.InvalidParams });
		assert.deepStrictEqual(scope.getCredential({ resource }), {
			resource, scopes: [], token: 'active', expiresAt: undefined, revision: 1,
		});
	});

	test('validates relay identity before resolving delegated credentials', async () => {
		const resolutions: string[] = [];
		const scope = store.add(new AgentHostAuthenticationScope(
			async () => { throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Wrong relay owner'); },
			() => { },
			principal,
			resource => { resolutions.push(resource); return undefined; },
		));
		await assert.rejects(scope.authenticate({ resource, token: 'foreign-client' }, resources), { code: JsonRpcErrorCodes.InvalidParams });
		assert.deepStrictEqual(resolutions, []);
	});

	test('delegation failures never fall back to the client credential', async () => {
		const scope = store.add(new AgentHostAuthenticationScope(
			validate, () => { }, principal,
			() => ({ principal, getCredential: () => undefined }),
		));
		await assert.rejects(scope.authenticate({ resource, token: 'ios-token' }, resources), { code: AhpErrorCodes.AuthRequired });
		assert.strictEqual(scope.getCredential({ resource }), undefined);
	});

	test('disconnect during validation cannot enable delegated credential lookup', async () => {
		const gate = new DeferredPromise<AuthenticateParams>();
		const resolutions: string[] = [];
		const scope = store.add(new AgentHostAuthenticationScope(
			() => gate.p, () => { }, principal,
			resource => {
				resolutions.push(resource);
				return { principal, getCredential: () => ({ resource, token: 'desktop-token', revision: 1, expiresAt: undefined }) };
			},
		));
		const pending = scope.authenticate({ resource, token: 'ios-token' }, resources);
		const rejection = assert.rejects(pending, { code: AhpErrorCodes.AuthRequired });
		scope.dispose();
		gate.complete({ resource, token: 'ios-token' });
		await rejection;
		assert.throws(() => scope.getCredential({ resource }), { code: AhpErrorCodes.AuthRequired });
		assert.deepStrictEqual(resolutions, []);
	});

	test('a late validation cannot overwrite a newer rotation', async () => {
		const gate = new DeferredPromise<AuthenticateParams>();
		const scope = createScope(params => params.token === 'first' ? gate.p : Promise.resolve(params));
		const first = scope.authenticate({ resource, token: 'first' }, resources);
		const rejection = assert.rejects(first, { code: AhpErrorCodes.Conflict });
		await scope.authenticate({ resource, token: 'second' }, resources);
		gate.complete({ resource, token: 'first' });
		await rejection;
		assert.deepStrictEqual(scope.getCredential({ resource }), {
			resource, scopes: [], token: 'second', expiresAt: undefined, revision: 1,
		});
	});

	test('disconnect during validation cannot resurrect capture or affect a reconnect', async () => {
		const gate = new DeferredPromise<AuthenticateParams>();
		const previous = createScope(() => gate.p);
		const pending = previous.authenticate({ resource, token: 'previous' }, resources);
		const rejection = assert.rejects(pending, { code: AhpErrorCodes.AuthRequired });
		previous.dispose();
		const reconnected = createScope();
		await reconnected.authenticate({ resource, token: 'reconnected' }, resources);
		gate.complete({ resource, token: 'previous' });
		await rejection;
		assert.strictEqual(reconnected.getCredential({ resource })?.token, 'reconnected');
	});

	test('checks authorization again after validation and before credential lookup', async () => {
		let authorized = true;
		const gate = new DeferredPromise<AuthenticateParams>();
		const scope = createScope(() => gate.p, () => {
			if (!authorized) {
				throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Authorization expired');
			}
		});
		const pending = scope.authenticate({ resource, token: 'late' }, resources);
		const rejection = assert.rejects(pending, { code: AhpErrorCodes.AuthRequired });
		authorized = false;
		gate.complete({ resource, token: 'late' });
		await rejection;
		assert.throws(() => scope.getCredential({ resource }), { code: AhpErrorCodes.AuthRequired });
		authorized = true;
		assert.strictEqual(scope.getCredential({ resource }), undefined);
	});

	test('unknown resources and empty credentials never reach validation', async () => {
		const calls: AuthenticateParams[] = [];
		const scope = createScope(async params => {
			calls.push(params);
			return params;
		});
		await assert.rejects(scope.authenticate({ resource: 'https://other.test', token: 'other' }, resources), { code: JsonRpcErrorCodes.InvalidParams });
		await assert.rejects(scope.authenticate({ resource, token: '' }, resources), { code: JsonRpcErrorCodes.InvalidParams });
		assert.deepStrictEqual(calls, []);
	});

	test('expiry never selects a credential from another connection', () => runWithFakedTimers({}, async () => {
		const broad = createScope();
		const narrow = createScope();
		await broad.authenticate({ resource, token: 'broad', expiresIn: 60 }, resources);
		await narrow.authenticate({ resource, token: 'narrow', expiresIn: 1 }, resources);
		await timeout(1_001);
		assert.deepStrictEqual({
			broad: broad.getCredential({ resource })?.token,
			narrow: narrow.getCredential({ resource }),
		}, { broad: 'broad', narrow: undefined });
	}));

	test('session and peer-chat lookup never falls back to legacy credentials or another chat', async () => {
		const service = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const narrow = createScope();
		const broad = createScope();
		await narrow.authenticate({ resource, token: 'narrow', scopes: ['read:user'] }, resources);
		await broad.authenticate({ resource, token: 'broad', scopes: ['repo', 'read:user'] }, resources);
		service.bindSessionCredentials('session', narrow);
		service.bindSessionCredentials('session', narrow, 'chat-a');
		service.bindSessionCredentials('session', broad, 'chat-b');
		assert.deepStrictEqual({
			session: service.getAuthToken({ resource, scopes: ['read:user'], session: 'session' }),
			chatA: service.getAuthToken({ resource, scopes: ['repo'], session: 'chat-a' }),
			chatB: service.getAuthToken({ resource, scopes: ['repo'], session: 'chat-b' }),
		}, { session: 'narrow', chatA: 'narrow', chatB: 'broad' });
		service.restoreSessionCredentialPrincipal('session', principal, 'restored-chat');
		assert.throws(() => service.getAuthToken({ resource, session: 'restored-chat' }), { code: AhpErrorCodes.AuthRequired });
		service.releaseSessionCredentials('session');
		assert.deepStrictEqual({
			session: service.getSessionCredentialSource('session'),
			chatA: service.getSessionCredentialSource('chat-a'),
			chatB: service.getSessionCredentialSource('chat-b'),
		}, { session: undefined, chatA: undefined, chatB: undefined });
	});

	test('restored isolation requires a sponsor and rejects a different owner', () => {
		const service = store.add(new AgentHostAuthenticationService(new NullLogService()));
		service.restoreSessionCredentialPrincipal('restored', principal);
		assert.throws(() => service.getAuthToken({ resource, session: 'restored' }), { code: AhpErrorCodes.AuthRequired });
		const different = store.add(new AgentHostAuthenticationScope(validate, () => { }, { ...principal, userId: '2' }));
		assert.throws(() => service.bindSessionCredentials('restored', different), { code: AhpErrorCodes.PermissionDenied });
		assert.deepStrictEqual(service.getSessionCredentialPrincipal('restored'), principal);
	});

	test('a chat without a recorded credential owner follows its session when it moves, and keeps the principal after the source is released', () => {
		const service = store.add(new AgentHostAuthenticationService(new NullLogService()));
		service.restoreSessionCredentialPrincipal('source', principal);
		service.moveChatCredentials('chat', 'source', 'target');
		service.releaseSessionCredentials('source');
		assert.deepStrictEqual({ principal: service.getSessionCredentialPrincipal('chat'), target: service.getSessionCredentialPrincipal('target') }, { principal, target: principal });
	});

	test('explicit local continuation validates the owner and captures only the desktop credential', async () => {
		const calls: string[] = [];
		const service = store.add(new AgentHostAuthenticationService(new NullLogService(), async (_url, init) => {
			calls.push(new Headers(init?.headers).get('Authorization') ?? '');
			return new Response(JSON.stringify({ id: 1, type: 'User' }));
		}));
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [{ resource }]; }
			override async authenticate() { return true; }
		}();
		await service.authenticate({ resource, token: 'desktop' }, [provider]);
		const source = await service.createLocalCredentialSource(principal, [{ resource }]);
		service.bindSessionCredentials('session', source);
		assert.deepStrictEqual({
			validations: calls.length,
			credential: service.getAuthToken({ resource, session: 'session' }),
			principal: source.principal,
		}, { validations: 1, credential: 'desktop', principal });
		await service.authenticate({ resource, token: '' }, [provider]);
		assert.strictEqual(service.getAuthToken({ resource, session: 'session' }), undefined);
	});

	test('local continuation does not require advertised OAuth scope hints or alter legacy lookup', async () => {
		const service = store.add(new AgentHostAuthenticationService(new NullLogService(), async () =>
			new Response(JSON.stringify({ id: 1, type: 'User' }))));
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [{ resource }]; }
			override async authenticate() { return true; }
		}();
		await service.authenticate({ resource, token: 'desktop', scopes: ['contents:read'] }, [provider]);
		const source = await service.createLocalCredentialSource(principal, [{ resource, scopes_supported: ['read:user', 'user:email'] }]);
		assert.deepStrictEqual({
			captured: captureCredentialSource(source, [{ resource, scopes_supported: ['user:email'] }]).getCredential({ resource, scopes: ['user:email'] })?.token,
			legacy: service.getAuthToken({ resource, scopes: ['user:email'] }),
		}, { captured: 'desktop', legacy: undefined });
	});

	test('local continuation cannot adopt a different GitHub owner', async () => {
		const service = store.add(new AgentHostAuthenticationService(new NullLogService(), async () =>
			new Response(JSON.stringify({ id: 2, type: 'User' }))));
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [{ resource }]; }
			override async authenticate() { return true; }
		}();
		await service.authenticate({ resource, token: 'foreign-desktop' }, [provider]);
		await assert.rejects(service.createLocalCredentialSource(principal, [{ resource }]), { code: AhpErrorCodes.AuthRequired });
		assert.strictEqual(service.getSessionCredentialSource('session'), undefined);
	});

	test('local continuation rejects another GitHub origin before sending a credential', async () => {
		const requests: string[] = [];
		const service = store.add(new AgentHostAuthenticationService(new NullLogService(), async url => {
			requests.push(String(url));
			return new Response(JSON.stringify({ id: 1, type: 'User' }));
		}));
		await assert.rejects(service.createLocalCredentialSource(principal, [{ resource: 'https://enterprise.test/api/v3' }]), { code: AhpErrorCodes.PermissionDenied });
		assert.deepStrictEqual(requests, []);
	});

	test('local continuation captures its owner credential without adopting an optional foreign identity', async () => {
		const validations: string[] = [];
		const foreign = 'https://graph.microsoft.com';
		const declared = [{ resource, required: false }, { resource: foreign, required: false }];
		const service = store.add(new AgentHostAuthenticationService(new NullLogService(), async (_url, init) => {
			validations.push(new Headers(init?.headers).get('Authorization') ?? '');
			return Response.json({ id: 1, type: 'User' });
		}));
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return declared; }
			override async authenticate() { return true; }
		}();
		await service.authenticate({ resource, token: 'desktop-github' }, [provider]);
		await service.authenticate({ resource: foreign, token: 'shared-microsoft' }, [provider]);
		const source = await service.createLocalCredentialSource(principal, declared);
		const captured = captureCredentialSource(source, declared);
		await assert.rejects(service.createLocalCredentialSource(principal, [...declared, { resource: `${resource}/required` }]), { code: AhpErrorCodes.AuthRequired });
		await assert.rejects(service.createLocalCredentialSource(principal, [{ resource: foreign }]), { code: AhpErrorCodes.PermissionDenied });
		assert.deepStrictEqual({
			github: captured.getCredential({ resource })?.token,
			microsoft: captured.getCredential({ resource: foreign }),
			validations,
			sharedMicrosoft: service.getAuthToken({ resource: foreign }),
		}, {
			github: 'desktop-github', microsoft: undefined,
			validations: ['Bearer desktop-github', 'Bearer desktop-github'], sharedMicrosoft: 'shared-microsoft',
		});
	});

	test('targeted MCP tokens stay out of agent credentials and retain independent concurrent replay slots', async () => {
		const service = store.add(new AgentHostAuthenticationService(new NullLogService(), async () => { assert.fail('Targeted MCP tokens must not validate an agent identity'); }));
		const target = (customizationId: string) => ({ kind: AuthenticateTargetKind.McpServer, session: 'ahp-session:/target', customizationId });
		const first: AuthenticateParams = { resource, scopes: ['read', 'write'], token: 'first-token', target: target('first') };
		const second: AuthenticateParams = { ...first, token: 'second-token', target: target('second') };
		const started = new DeferredPromise<void>();
		const gate = new DeferredPromise<void>();
		const completions: AuthenticateParams[] = [];
		const providerTokens: string[] = [];
		const changedTokens: (string | undefined)[] = [];
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [{ resource }]; }
			override async authenticate(_resource: string, token: string) { providerTokens.push(token); return true; }
			override async handleAuthenticationToken(params: AuthenticateParams) {
				completions.push(params);
				if (params === first) {
					started.complete();
					await gate.p;
				}
				return true;
			}
		}();
		store.add(service.onDidChangeAuthToken(event => changedTokens.push(event.token)));
		const firstResult = service.authenticate(first, [provider]);
		await started.p;
		const secondResult = await service.authenticate(second, [provider]);
		gate.complete();
		const result = await firstResult;
		completions.length = 0;
		await service.replay(provider);
		const replayed = completions.map(({ token, target }) => ({ token, target }));
		const lookups = {
			exact: service.getAuthToken({ resource, scopes: ['read', 'write'] }),
			subset: service.getAuthToken({ resource, scopes: ['read'] }),
			unscoped: service.getAuthToken({ resource }),
			account: service.getAuthAccount({ resource, scopes: ['read'] }),
		};
		await assert.rejects(service.createLocalCredentialSource(principal, [{ resource }]), { code: AhpErrorCodes.AuthRequired });
		await service.authenticate({ ...first, token: '' }, [provider]);
		completions.length = 0;
		await service.replay(provider);
		assert.deepStrictEqual({ result, secondResult, replayed, lookups, providerTokens, changedTokens, afterRevocation: completions.map(({ token, target }) => ({ token, target })) }, {
			result: { authenticated: true }, secondResult: { authenticated: true },
			replayed: [{ token: 'second-token', target: second.target }, { token: 'first-token', target: first.target }],
			lookups: { exact: undefined, subset: undefined, unscoped: undefined, account: undefined },
			providerTokens: [], changedTokens: [], afterRevocation: [{ token: 'second-token', target: second.target }],
		});
	});

	test('scoped targeted MCP authentication bypasses protected-resource capture', async () => {
		const service = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const scope = createScope();
		const completions: AuthenticateParams[] = [];
		const providerTokens: string[] = [];
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [{ resource }]; }
			override async authenticate(_resource: string, token: string) { providerTokens.push(token); return true; }
			override async handleAuthenticationToken(params: AuthenticateParams) { completions.push(params); return true; }
		}();
		const params: AuthenticateParams = {
			resource, token: 'mcp-token', target: { kind: AuthenticateTargetKind.McpServer, session: 'ahp-session:/target', customizationId: 'mcp' },
		};
		const result = await service.authenticate(params, [provider], scope);
		assert.deepStrictEqual({ result, completions, providerTokens, scoped: service.getAuthToken({ resource }, scope), legacy: service.getAuthToken({ resource }) }, {
			result: { authenticated: true }, completions: [params], providerTokens: [], scoped: undefined, legacy: undefined,
		});
	});

	test('MCP completion does not capture or replay an unrelated resource', async () => {
		const service = store.add(new AgentHostAuthenticationService(new NullLogService()));
		const completions: string[] = [];
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [{ resource }]; }
			override async authenticate() { return true; }
			override async handleAuthenticationToken(params: AuthenticateParams) {
				completions.push(params.token);
				return params.resource === 'https://mcp.test';
			}
		}();
		const scope = createScope();
		const result = await service.authenticate({ resource: 'https://mcp.test', token: 'mcp' }, [provider], scope);
		await service.replay(provider);
		assert.deepStrictEqual({
			result, completions,
			scoped: service.getAuthToken({ resource: 'https://mcp.test' }, scope),
			legacy: service.getAuthToken({ resource: 'https://mcp.test' }),
		}, { result: { authenticated: true }, completions: ['mcp'], scoped: undefined, legacy: undefined });
	});

	test('captured in-flight credentials survive rotation and disconnect but not expiry', () => runWithFakedTimers({}, async () => {
		const scope = createScope();
		await scope.authenticate({ resource, token: 'first', expiresIn: 1 }, resources);
		const captured = captureCredentialSource(scope, [{ resource }]);
		await scope.authenticate({ resource, token: 'second', expiresIn: 60 }, resources);
		const replacement = captureCredentialSource(scope, [{ resource }]);
		scope.dispose();
		const beforeExpiry = {
			first: captured.getCredential({ resource })?.token,
			second: replacement.getCredential({ resource })?.token,
		};
		await timeout(1_001);
		assert.deepStrictEqual({
			beforeExpiry,
			first: captured.getCredential({ resource }),
			second: replacement.getCredential({ resource })?.token,
		}, { beforeExpiry: { first: 'first', second: 'second' }, first: undefined, second: 'second' });
	}));

	test('observed local sign-out invalidates an earlier captured revision after rotation', async () => {
		const service = store.add(new AgentHostAuthenticationService(new NullLogService(), async () =>
			new Response(JSON.stringify({ id: 1, type: 'User' }))));
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [{ resource }]; }
			override async authenticate() { return true; }
		}();
		await service.authenticate({ resource, token: 'first' }, [provider]);
		const source = await service.createLocalCredentialSource(principal, [{ resource }]);
		const captured = captureCredentialSource(source, [{ resource }]);
		await service.authenticate({ resource, token: 'second' }, [provider]);
		const duringRotation = captured.getCredential({ resource })?.token;
		await service.authenticate({ resource, token: '' }, [provider]);
		assert.deepStrictEqual({
			duringRotation, afterSignOut: captured.getCredential({ resource }),
		}, { duringRotation: 'first', afterSignOut: undefined });
	});

	test('persisted principal parsing rejects malformed or non-GitHub-owner classifications', () => {
		assert.deepStrictEqual(parseCredentialPrincipal(JSON.stringify(principal)), principal);
		for (const value of [null, {}, { ...principal, userId: '0' }, { ...principal, apiOrigin: 'http://api.github.com' }]) {
			assert.throws(() => parseCredentialPrincipal(JSON.stringify(value)), /Invalid persisted credential principal/);
		}
	});
});
