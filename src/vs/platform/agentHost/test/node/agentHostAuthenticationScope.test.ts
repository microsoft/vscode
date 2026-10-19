/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { AuthenticateParams, IAgent } from '../../common/agent.js';
import { captureCredentialSource, parseCredentialPrincipal, type IAgentHostCredentialSource } from '../../common/agentHostCredentials.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
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
			async resource => { resolutions.push(resource); return undefined; },
		));
		await assert.rejects(scope.authenticate({ resource, token: 'foreign-client' }, resources), { code: JsonRpcErrorCodes.InvalidParams });
		assert.deepStrictEqual(resolutions, []);
	});

	test('delegation failures never fall back to the client credential', async () => {
		const scope = store.add(new AgentHostAuthenticationScope(
			validate, () => { }, principal,
			async () => ({ principal, getCredential: () => undefined }),
		));
		await assert.rejects(scope.authenticate({ resource, token: 'ios-token' }, resources), { code: AhpErrorCodes.AuthRequired });
		assert.strictEqual(scope.getCredential({ resource }), undefined);
	});

	test('disconnect during delegated credential resolution cannot resurrect authentication', async () => {
		const gate = new DeferredPromise<IAgentHostCredentialSource>();
		const started = new DeferredPromise<void>();
		const scope = store.add(new AgentHostAuthenticationScope(
			validate, () => { }, principal,
			async () => { started.complete(); return gate.p; },
		));
		const pending = scope.authenticate({ resource, token: 'ios-token' }, resources);
		const rejection = assert.rejects(pending, { code: AhpErrorCodes.AuthRequired });
		await started.p;
		scope.dispose();
		gate.complete({
			principal,
			getCredential: () => ({ resource, token: 'desktop-token', revision: 1, expiresAt: undefined }),
		});
		await rejection;
		assert.throws(() => scope.getCredential({ resource }), { code: AhpErrorCodes.AuthRequired });
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
