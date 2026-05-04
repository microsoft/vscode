/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationError } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import {
	AgentHostAccessMode,
	AgentHostPermissionMode,
	AgentHostPermissionsSetting,
	AgentHostLocalFilePermissionsSettingId,
} from '../../../../../platform/agentHost/common/agentHostPermissionService.js';
import { AgentHostPermissionService } from '../../common/agentHostPermissionService.js';

class CapturingConfigurationService extends TestConfigurationService {
	override async updateValue(key: string, value: unknown, arg3?: ConfigurationTarget | unknown): Promise<void> {
		const target = typeof arg3 === 'number' ? arg3 as ConfigurationTarget : undefined;
		this.lastUpdate = { key, value, target };
		// Reflect into the inspected value so subsequent inspect() reads it back.
		await this.setUserConfiguration(key, value);
	}

	lastUpdate: { key: string; value: unknown; target?: ConfigurationTarget } | undefined;
}

/**
 * Stub file service that returns the URI as-is from `realpath`, with the
 * lexical normalization that `extUri.normalizePath` applied. This lets the
 * unit tests exercise the policy logic without a real filesystem; canonical
 * form == lexically normalized form.
 *
 * `null` realpath responses simulate non-existent paths to drive the
 * `_canonicalize` parent-fallback branch.
 */
function createStubFileService(opts?: {
	realpathReturns?: (uri: URI) => URI | undefined;
}): IFileService {
	return {
		realpath: async (resource: URI) => opts?.realpathReturns ? opts.realpathReturns(resource) : resource,
	} as unknown as IFileService;
}

suite('AgentHostPermissionService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(initial?: AgentHostPermissionsSetting, fileService = createStubFileService()): { service: AgentHostPermissionService; config: CapturingConfigurationService } {
		const config = new CapturingConfigurationService();
		if (initial) {
			void config.setUserConfiguration(AgentHostLocalFilePermissionsSettingId, initial);
		}
		const service = disposables.add(new AgentHostPermissionService(config, fileService, new NullLogService()));
		return { service, config };
	}

	test('check denies when no grant exists', async () => {
		const { service } = createService();
		assert.strictEqual(await service.check('host', URI.file('/etc/passwd'), AgentHostPermissionMode.Read), false);
		assert.strictEqual(await service.check('host', URI.file('/etc/passwd'), AgentHostPermissionMode.Write), false);
	});

	test('implicit read grant covers descendants but not parent or sibling', async () => {
		const { service } = createService();
		disposables.add(service.grantImplicitRead('host', URI.file('/plugins/foo')));

		assert.strictEqual(await service.check('host', URI.file('/plugins/foo'), AgentHostPermissionMode.Read), true);
		assert.strictEqual(await service.check('host', URI.file('/plugins/foo/skill.md'), AgentHostPermissionMode.Read), true);
		assert.strictEqual(await service.check('host', URI.file('/plugins'), AgentHostPermissionMode.Read), false);
		assert.strictEqual(await service.check('host', URI.file('/plugins/bar'), AgentHostPermissionMode.Read), false);
	});

	test('implicit grant does not allow write', async () => {
		const { service } = createService();
		disposables.add(service.grantImplicitRead('host', URI.file('/plugins/foo')));
		assert.strictEqual(await service.check('host', URI.file('/plugins/foo'), AgentHostPermissionMode.Write), false);
	});

	test('persisted "r" allows read, denies write', async () => {
		const { service } = createService({
			'host': {
				[URI.file('/etc/foo').toString()]: AgentHostAccessMode.Read,
			},
		});
		assert.strictEqual(await service.check('host', URI.file('/etc/foo'), AgentHostPermissionMode.Read), true);
		assert.strictEqual(await service.check('host', URI.file('/etc/foo/bar'), AgentHostPermissionMode.Read), true);
		assert.strictEqual(await service.check('host', URI.file('/etc/foo'), AgentHostPermissionMode.Write), false);
	});

	test('persisted "rw" allows read and write', async () => {
		const { service } = createService({
			'host': {
				[URI.file('/etc/foo').toString()]: AgentHostAccessMode.ReadWrite,
			},
		});
		assert.strictEqual(await service.check('host', URI.file('/etc/foo'), AgentHostPermissionMode.Read), true);
		assert.strictEqual(await service.check('host', URI.file('/etc/foo'), AgentHostPermissionMode.Write), true);
		assert.strictEqual(await service.check('host', URI.file('/etc/foo/bar'), AgentHostPermissionMode.Write), true);
	});

	test('check canonicalizes via realpath so symlink to outside the grant is denied', async () => {
		// `/safe/sym` is a symlink to `/sensitive`. The grant is for `/safe` only.
		const fileService = createStubFileService({
			realpathReturns: uri => uri.path.startsWith('/safe/sym')
				? URI.file('/sensitive' + uri.path.slice('/safe/sym'.length))
				: uri,
		});
		const { service } = createService(undefined, fileService);
		disposables.add(service.grantImplicitRead('host', URI.file('/safe')));

		// `/safe/foo` resolves to itself; covered by grant.
		assert.strictEqual(await service.check('host', URI.file('/safe/foo'), AgentHostPermissionMode.Read), true);

		// `/safe/sym/leak` resolves through symlink to `/sensitive/leak`; not covered.
		assert.strictEqual(await service.check('host', URI.file('/safe/sym/leak'), AgentHostPermissionMode.Read), false);
	});

	test('implicit grant for a symlinked directory still covers descendants resolved through the symlink', async () => {
		// The grant root is itself a symlink: `/safe/sym` → `/real`.
		// A request for `/safe/sym/leaf` should canonicalize to `/real/leaf`,
		// and the grant should canonicalize to `/real`, so the comparison
		// passes. Pre-fix, the grant URI was stored lexically until realpath
		// completed, which left a window where the comparison failed.
		const fileService = createStubFileService({
			realpathReturns: uri => uri.path.startsWith('/safe/sym')
				? URI.file('/real' + uri.path.slice('/safe/sym'.length))
				: uri,
		});
		const { service } = createService(undefined, fileService);
		// Issue the grant and the check immediately, before any awaits, to
		// reproduce the race window.
		disposables.add(service.grantImplicitRead('host', URI.file('/safe/sym')));
		assert.strictEqual(await service.check('host', URI.file('/safe/sym/leaf'), AgentHostPermissionMode.Read), true);
	});

	test('check rejects path traversal via .. segments', async () => {
		const { service } = createService();
		disposables.add(service.grantImplicitRead('host', URI.file('/safe')));

		// `/safe/../etc/passwd` lexically normalizes to `/etc/passwd` — outside the grant.
		assert.strictEqual(await service.check('host', URI.file('/safe/../etc/passwd'), AgentHostPermissionMode.Read), false);
	});

	test('check canonicalizes nonexistent paths via the parent realpath', async () => {
		// `/safe/sym` is a symlink to `/real`. We're asking about a *new*
		// file at `/safe/sym/new.txt` (e.g. a `resourceWrite` for a file
		// that doesn't exist yet). Realpath returns `undefined` for the
		// file, so the service falls back to realpathing the parent.
		const fileService = createStubFileService({
			realpathReturns: uri => {
				if (uri.path === '/safe/sym/new.txt') {
					return undefined;
				}
				if (uri.path === '/safe/sym') {
					return URI.file('/real');
				}
				return uri;
			},
		});
		const { service } = createService(undefined, fileService);
		disposables.add(service.grantImplicitRead('host', URI.file('/real')));

		// Wait for the implicit-grant realpath upgrade to settle.
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(
			await service.check('host', URI.file('/safe/sym/new.txt'), AgentHostPermissionMode.Read),
			true,
			'nonexistent file under a symlinked parent should canonicalize to /real/new.txt',
		);
	});

	test('request resolves immediately when already granted', async () => {
		const { service } = createService();
		disposables.add(service.grantImplicitRead('host', URI.file('/plugins/foo')));
		await service.request('host', { uri: URI.file('/plugins/foo/x.md').toString(), read: true });
		assert.strictEqual(service.allPending.get().length, 0);
	});

	test('allow grants in-memory until connection closes', async () => {
		const { service, config } = createService();
		const uri = URI.file('/etc/foo');
		const promise = service.request('host', { uri: uri.toString(), read: true });

		// Wait for canonicalization + enqueue.
		await new Promise(resolve => setTimeout(resolve, 0));
		const pending = service.allPending.get();
		assert.strictEqual(pending.length, 1);

		pending[0].allow();
		await promise;

		// The grant must take effect synchronously: subsequent check passes.
		assert.strictEqual(await service.check('host', uri, AgentHostPermissionMode.Read), true);
		// And nothing was persisted.
		assert.strictEqual(config.lastUpdate, undefined);

		// Connection close revokes the in-memory grant.
		service.connectionClosed('host');
		assert.strictEqual(await service.check('host', uri, AgentHostPermissionMode.Read), false);
	});

	test('allow for write also covers read on the same URI', async () => {
		const { service } = createService();
		const promise = service.request('host', { uri: URI.file('/etc/foo').toString(), write: true });

		await new Promise(resolve => setTimeout(resolve, 0));
		const pending = service.allPending.get();
		assert.strictEqual(pending[0].mode, AgentHostPermissionMode.Write);
		pending[0].allow();
		await promise;

		// Mirrors the persisted "rw" semantics: write access implies read access on the same URI.
		assert.strictEqual(await service.check('host', URI.file('/etc/foo'), AgentHostPermissionMode.Write), true);
		assert.strictEqual(await service.check('host', URI.file('/etc/foo'), AgentHostPermissionMode.Read), true);
		// But a sibling URI gets nothing.
		assert.strictEqual(await service.check('host', URI.file('/etc/bar'), AgentHostPermissionMode.Read), false);
	});

	test('allow for read does not grant write', async () => {
		const { service } = createService();
		const promise = service.request('host', { uri: URI.file('/etc/foo').toString(), read: true });

		await new Promise(resolve => setTimeout(resolve, 0));
		service.allPending.get()[0].allow();
		await promise;

		assert.strictEqual(await service.check('host', URI.file('/etc/foo'), AgentHostPermissionMode.Read), true);
		assert.strictEqual(await service.check('host', URI.file('/etc/foo'), AgentHostPermissionMode.Write), false);
	});

	test('request rejects with CancellationError on deny', async () => {
		const { service } = createService();
		const promise = service.request('host', { uri: URI.file('/etc/foo').toString(), read: true });
		await new Promise(resolve => setTimeout(resolve, 0));
		service.allPending.get()[0].deny();
		await assert.rejects(promise, (err: unknown) => err instanceof CancellationError);
	});

	test('allowAlways persists the grant', async () => {
		const { service, config } = createService();
		const promise = service.request('host', { uri: URI.file('/etc/foo').toString(), read: true });
		await new Promise(resolve => setTimeout(resolve, 0));
		service.allPending.get()[0].allowAlways();
		await promise;

		assert.strictEqual(config.lastUpdate?.key, AgentHostLocalFilePermissionsSettingId);
		const value = config.lastUpdate.value as AgentHostPermissionsSetting;
		assert.strictEqual(value['host'][URI.file('/etc/foo').toString()], AgentHostAccessMode.Read);
	});

	test('allowAlways covers immediate retry without waiting for the settings write', async () => {
		// `updateValue` deliberately deferred to simulate slow propagation.
		const config = new (class extends CapturingConfigurationService {
			override async updateValue(key: string, value: unknown, target?: unknown): Promise<void> {
				await new Promise(resolve => setTimeout(resolve, 50));
				await super.updateValue(key, value, target as ConfigurationTarget);
			}
		})();
		const service = disposables.add(new AgentHostPermissionService(config, createStubFileService(), new NullLogService()));

		const uri = URI.file('/etc/foo');
		const promise = service.request('host', { uri: uri.toString(), read: true });
		await new Promise(resolve => setTimeout(resolve, 0));
		service.allPending.get()[0].allowAlways();
		await promise;

		// The check must succeed immediately even though `updateValue` hasn't returned yet.
		assert.strictEqual(await service.check('host', uri, AgentHostPermissionMode.Read), true);
	});

	test('allowAlways for write persists rw', async () => {
		const { service, config } = createService();
		const promise = service.request('host', { uri: URI.file('/etc/foo').toString(), write: true });
		await new Promise(resolve => setTimeout(resolve, 0));
		service.allPending.get()[0].allowAlways();
		await promise;

		const value = config.lastUpdate?.value as AgentHostPermissionsSetting;
		assert.strictEqual(value['host'][URI.file('/etc/foo').toString()], AgentHostAccessMode.ReadWrite);
	});

	test('allowAlways skips persistence when covered by parent grant', async () => {
		const { service, config } = createService({
			'host': {
				[URI.file('/etc').toString()]: AgentHostAccessMode.ReadWrite,
			},
		});
		// Already covered by parent — request resolves without prompting.
		await service.request('host', { uri: URI.file('/etc/foo').toString(), read: true });
		assert.strictEqual(config.lastUpdate, undefined);
	});

	test('concurrent identical requests share one pending entry', async () => {
		const { service } = createService();
		const a = service.request('host', { uri: URI.file('/etc/foo').toString(), read: true });
		const b = service.request('host', { uri: URI.file('/etc/foo').toString(), read: true });

		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(service.allPending.get().length, 1);
		service.allPending.get()[0].allow();
		await Promise.all([a, b]);
	});

	test('write request that already has read grant still prompts for write', async () => {
		const { service } = createService({
			'host': {
				[URI.file('/etc/foo').toString()]: AgentHostAccessMode.Read,
			},
		});
		const promise = service.request('host', { uri: URI.file('/etc/foo').toString(), write: true });
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(service.allPending.get().length, 1);
		assert.strictEqual(service.allPending.get()[0].mode, AgentHostPermissionMode.Write);
		// Resolve to clean up.
		service.allPending.get()[0].allow();
		await promise;
	});

	test('connectionClosed rejects pending and clears the queue', async () => {
		const { service } = createService();
		const promise = service.request('host', { uri: URI.file('/etc/foo').toString(), read: true });
		await new Promise(resolve => setTimeout(resolve, 0));
		service.connectionClosed('host');
		await assert.rejects(promise, (err: unknown) => err instanceof CancellationError);
		assert.strictEqual(service.allPending.get().length, 0);
	});

	test('connectionClosed drops implicit grants', async () => {
		const { service } = createService();
		disposables.add(service.grantImplicitRead('host', URI.file('/plugins/foo')));
		assert.strictEqual(await service.check('host', URI.file('/plugins/foo/x'), AgentHostPermissionMode.Read), true);
		service.connectionClosed('host');
		assert.strictEqual(await service.check('host', URI.file('/plugins/foo/x'), AgentHostPermissionMode.Read), false);
	});

	test('address normalization strips ws:// prefix', async () => {
		const { service } = createService({
			'host:1234': {
				[URI.file('/etc/foo').toString()]: AgentHostAccessMode.Read,
			},
		});
		assert.strictEqual(await service.check('ws://host:1234', URI.file('/etc/foo'), AgentHostPermissionMode.Read), true);
		assert.strictEqual(await service.check('host:1234', URI.file('/etc/foo'), AgentHostPermissionMode.Read), true);
	});

	test('findPending returns the pending request by id', async () => {
		const { service } = createService();
		const promise = service.request('host', { uri: URI.file('/etc/foo').toString(), read: true });
		await new Promise(resolve => setTimeout(resolve, 0));
		const [pending] = service.allPending.get();
		assert.strictEqual(service.findPending(pending.id), pending);
		// Resolve to clean up before the test ends so the deferred doesn't leak.
		pending.allow();
		await promise;
	});

	// ---- Address isolation ----------------------------------------------

	test('grants for one host do not leak into another host', async () => {
		const { service } = createService({
			'host-a': {
				[URI.file('/etc/foo').toString()]: AgentHostAccessMode.ReadWrite,
			},
		});
		disposables.add(service.grantImplicitRead('host-a', URI.file('/plugins/p')));

		// Same URI, different host → not granted.
		assert.strictEqual(await service.check('host-b', URI.file('/etc/foo'), AgentHostPermissionMode.Read), false);
		assert.strictEqual(await service.check('host-b', URI.file('/plugins/p'), AgentHostPermissionMode.Read), false);
		// Sanity: grant still works for the originating host.
		assert.strictEqual(await service.check('host-a', URI.file('/etc/foo'), AgentHostPermissionMode.Write), true);
	});

	test('connectionClosed only affects the named address', async () => {
		const { service } = createService();
		disposables.add(service.grantImplicitRead('host-a', URI.file('/plugins/a')));
		disposables.add(service.grantImplicitRead('host-b', URI.file('/plugins/b')));

		const pendingA = service.request('host-a', { uri: URI.file('/etc/a').toString(), read: true });
		const pendingB = service.request('host-b', { uri: URI.file('/etc/b').toString(), read: true });
		await new Promise(resolve => setTimeout(resolve, 0));

		service.connectionClosed('host-a');

		await assert.rejects(pendingA, (err: unknown) => err instanceof CancellationError);
		// host-b's grant and pending request survive.
		assert.strictEqual(await service.check('host-b', URI.file('/plugins/b'), AgentHostPermissionMode.Read), true);
		assert.strictEqual(service.allPending.get().length, 1);

		// Clean up: resolve the surviving pending request.
		service.allPending.get()[0].allow();
		await pendingB;
	});

	// ---- pendingFor filter ---------------------------------------------

	test('pendingFor returns only this host\'s requests, with normalized address', async () => {
		const { service } = createService();
		const a = service.request('host-a', { uri: URI.file('/etc/a').toString(), read: true });
		const b = service.request('ws://host-b', { uri: URI.file('/etc/b').toString(), read: true });
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(service.pendingFor('host-a').get().length, 1);
		assert.strictEqual(service.pendingFor('host-b').get().length, 1);
		assert.strictEqual(service.pendingFor('host-b').get()[0].uri.toString(), URI.file('/etc/b').toString());
		// Normalized lookup: querying with the ws:// prefix returns the same set.
		assert.strictEqual(service.pendingFor('ws://host-b').get().length, 1);

		service.allPending.get().forEach(p => p.allow());
		await Promise.all([a, b]);
	});

	// ---- Multi-mode requests --------------------------------------------

	test('request with both read and write prompts sequentially', async () => {
		// We surface read first, then once approved we surface write. Asking
		// for the smaller scope first lets the user decline the dangerous
		// part without ever seeing it.
		const { service } = createService();
		const promise = service.request('host', { uri: URI.file('/etc/foo').toString(), read: true, write: true });
		await new Promise(resolve => setTimeout(resolve, 0));

		let pending = service.allPending.get();
		assert.strictEqual(pending.length, 1);
		assert.strictEqual(pending[0].mode, AgentHostPermissionMode.Read);
		pending[0].allow();
		await new Promise(resolve => setTimeout(resolve, 0));

		pending = service.allPending.get();
		assert.strictEqual(pending.length, 1);
		assert.strictEqual(pending[0].mode, AgentHostPermissionMode.Write);
		pending[0].allow();
		await promise;
	});

	// ---- Implicit-grant realpath upgrade --------------------------------

	test('grantImplicitRead asynchronously upgrades to realpath', async () => {
		// `~/plugin-link` is a symlink to `/real/plugin`. Initial check sees
		// the lexical URI; after realpath resolves, the grant covers the
		// realpath target as well.
		const fileService = createStubFileService({
			realpathReturns: uri => uri.path === '/home/me/plugin-link' ? URI.file('/real/plugin') : uri,
		});
		const { service } = createService(undefined, fileService);
		disposables.add(service.grantImplicitRead('host', URI.file('/home/me/plugin-link')));

		// Wait for the deferred upgrade to land.
		await new Promise(resolve => setTimeout(resolve, 0));

		// Check sees the realpath form because canonicalize + grant both point at /real/plugin.
		assert.strictEqual(await service.check('host', URI.file('/real/plugin/skill.md'), AgentHostPermissionMode.Read), true);
	});

	// ---- Settings-scope inference ---------------------------------------

	test('allowAlways defaults to APPLICATION scope when no value is configured anywhere', async () => {
		const { service, config } = createService();
		const promise = service.request('host', { uri: URI.file('/etc/foo').toString(), read: true });
		await new Promise(resolve => setTimeout(resolve, 0));
		service.allPending.get()[0].allowAlways();
		await promise;

		// The setting is registered as ConfigurationScope.APPLICATION, so a
		// fresh write must land there — not in USER (which would be invisible
		// to other windows that read this APPLICATION-scoped setting).
		assert.strictEqual(config.lastUpdate?.target, ConfigurationTarget.APPLICATION);
	});

	test('allowAlways merges with existing APPLICATION-scoped grants instead of overwriting them', async () => {
		// Pre-existing grant for `other-host` lives in APPLICATION scope.
		// The service must read from APPLICATION when picking the merge
		// base, otherwise it would build the next value from {} and clobber
		// the existing `other-host` entry on write.
		const config = new CapturingConfigurationService();
		const existing: AgentHostPermissionsSetting = {
			'other-host': { [URI.file('/etc/preexisting').toString()]: AgentHostAccessMode.ReadWrite },
		};
		const originalInspect = config.inspect.bind(config);
		(config as { inspect: (key: string) => unknown }).inspect = (key: string) => {
			if (key === AgentHostLocalFilePermissionsSettingId) {
				return {
					value: existing,
					defaultValue: {},
					applicationValue: existing,
					overrideIdentifiers: [],
				};
			}
			return originalInspect(key);
		};
		const service = disposables.add(new AgentHostPermissionService(config, createStubFileService(), new NullLogService()));

		const promise = service.request('host', { uri: URI.file('/etc/foo').toString(), read: true });
		await new Promise(resolve => setTimeout(resolve, 0));
		service.allPending.get()[0].allowAlways();
		await promise;

		assert.strictEqual(config.lastUpdate?.target, ConfigurationTarget.APPLICATION);
		const written = config.lastUpdate.value as AgentHostPermissionsSetting;
		assert.deepStrictEqual(written, {
			'other-host': { [URI.file('/etc/preexisting').toString()]: AgentHostAccessMode.ReadWrite },
			'host': { [URI.file('/etc/foo').toString()]: AgentHostAccessMode.Read },
		});
	});

	test('allowAlways persists into USER_LOCAL when a pre-existing value is in USER_LOCAL', async () => {
		// Hand-edited or migrated entries living in USER_LOCAL are honoured
		// rather than silently relocated to APPLICATION on the next write.
		const config = new CapturingConfigurationService();
		const originalInspect = config.inspect.bind(config);
		(config as { inspect: (key: string) => unknown }).inspect = (key: string) => {
			if (key === AgentHostLocalFilePermissionsSettingId) {
				return {
					value: {},
					defaultValue: {},
					userLocalValue: {},
					overrideIdentifiers: [],
				};
			}
			return originalInspect(key);
		};
		const service = disposables.add(new AgentHostPermissionService(config, createStubFileService(), new NullLogService()));

		const promise = service.request('host', { uri: URI.file('/etc/foo').toString(), read: true });
		await new Promise(resolve => setTimeout(resolve, 0));
		service.allPending.get()[0].allowAlways();
		await promise;

		assert.strictEqual(config.lastUpdate?.target, ConfigurationTarget.USER_LOCAL);
	});

	// ---- Defensive: malformed settings entries --------------------------

	test('persisted entries with malformed URI keys or unknown modes are ignored', async () => {
		const { service } = createService({
			'host': {
				'::not a uri::': AgentHostAccessMode.ReadWrite,
				[URI.file('/etc/garbage').toString()]: 'unknown' as unknown as AgentHostAccessMode,
				[URI.file('/etc/good').toString()]: AgentHostAccessMode.Read,
			},
		});
		// The malformed and unknown-mode entries don't grant access.
		assert.strictEqual(await service.check('host', URI.file('/etc/garbage'), AgentHostPermissionMode.Read), false);
		// The valid entry still works.
		assert.strictEqual(await service.check('host', URI.file('/etc/good'), AgentHostPermissionMode.Read), true);
	});
});
