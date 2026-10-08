/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import type { ExtensionLaunchProviderResolveRequest } from '@github/copilot-sdk';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { CopilotSessionExtensionLaunchAdmission } from '../../node/copilot/copilotSessionExtensionLaunchAdmission.js';

suite('CopilotSessionExtensionLaunchAdmission', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let root: string;
	let home: string;
	let admission: CopilotSessionExtensionLaunchAdmission;

	setup(async () => {
		root = await fs.mkdtemp(join(tmpdir(), 'copilot-session-extensions-'));
		home = join(root, 'home');
		admission = disposables.add(new CopilotSessionExtensionLaunchAdmission(home, new NullLogService()));
	});

	teardown(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	const request = (sessionId = 'owner', name = 'preview'): ExtensionLaunchProviderResolveRequest => ({
		id: `session:${sessionId}:${name}`,
		name,
		modulePath: join(home, 'session-state', sessionId, 'extensions', name, 'extension.mjs'),
		source: 'session',
	});
	const writeExtension = async (sessionId = 'owner', name = 'preview') => {
		const modulePath = request(sessionId, name).modulePath;
		await fs.mkdir(join(modulePath, '..'), { recursive: true });
		await fs.writeFile(modulePath, '');
		return fs.realpath(modulePath);
	};

	test('admits before directory creation and resolves again after files are added', async () => {
		const lease = disposables.add(admission.acquire('owner'));
		const missing = await admission.resolve(request());
		const canonicalModulePath = await writeExtension();
		const live = await admission.resolve(request());
		lease.dispose();
		const released = await admission.resolve(request());
		assert.deepStrictEqual({ missing, live, released }, { missing: undefined, live: canonicalModulePath, released: undefined });
	});

	test('requires admission of the exact SDK owner, including same-name peer extensions', async () => {
		const owner = await writeExtension();
		const peer = await writeExtension('peer');
		disposables.add(admission.acquire('owner'));
		const unadmittedPeer = await admission.resolve(request('peer'));
		disposables.add(admission.acquire('peer'));
		assert.deepStrictEqual({
			owner: await admission.resolve(request()),
			unadmittedPeer,
			peer: await admission.resolve(request('peer')),
			forgedOwner: await admission.resolve({ ...request('peer'), id: request().id }),
		}, { owner, unadmittedPeer: undefined, peer, forgedOwner: undefined });
	});

	test('does not revoke a second lease when one owner is released', async () => {
		const canonicalModulePath = await writeExtension();
		const first = disposables.add(admission.acquire('owner'));
		disposables.add(admission.acquire('owner'));
		first.dispose();
		assert.strictEqual(await admission.resolve(request()), canonicalModulePath);
	});

	(process.platform === 'win32' ? test : test.skip)('accepts both Windows drive-letter spellings from the runtime', async () => {
		const canonicalModulePath = await writeExtension();
		const uriAdmission = disposables.add(new CopilotSessionExtensionLaunchAdmission(URI.file(home).fsPath, new NullLogService()));
		disposables.add(uriAdmission.acquire('owner'));
		const upperDriveModulePath = request().modulePath.replace(/^[a-z]:/i, drive => drive.toUpperCase());
		const lowerDriveModulePath = request().modulePath.replace(/^[a-z]:/i, drive => drive.toLowerCase());
		assert.deepStrictEqual(await Promise.all([upperDriveModulePath, lowerDriveModulePath].map(modulePath =>
			uriAdmission.resolve({ ...request(), modulePath })
		)), [canonicalModulePath, canonicalModulePath]);
	});

	test('rejects unsafe identities, traversal, aliases, and unsupported entrypoints', async () => {
		await writeExtension();
		disposables.add(admission.acquire('owner'));
		const denied = [
			{ ...request(), id: 'project:preview', source: 'project' as const },
			{ ...request(), id: 'session:other:preview' },
			{ ...request(), name: 'other' },
			{ ...request(), name: '..', id: 'session:owner:..' },
			{ ...request(), modulePath: join(home, 'session-state', 'other', 'extensions', 'preview', 'extension.mjs') },
			{ ...request(), modulePath: `${join(home, 'session-state', 'owner', 'extensions', 'preview')}/../preview/extension.mjs` },
			{ ...request(), modulePath: 'extension.mjs' },
			{ ...request(), modulePath: request().modulePath.replace('extension.mjs', 'extension.js') },
		];
		for (const sessionId of ['', '.', '..', '../owner', 'owner/peer', 'owner\\peer', 'owner:peer', 'owner.', 'owner ', 'NUL', 'nul.txt']) {
			disposables.add(admission.acquire(sessionId));
			denied.push(request(sessionId));
		}
		assert.deepStrictEqual(await Promise.all(denied.map(candidate => admission.resolve(candidate))), denied.map(() => undefined));
	});

	test('rejects an entrypoint that is a directory', async () => {
		await fs.mkdir(request().modulePath, { recursive: true });
		disposables.add(admission.acquire('owner'));
		assert.strictEqual(await admission.resolve(request()), undefined);
	});

	test('permits a configured home alias without permitting redirects below it', async () => {
		const canonicalModulePath = await writeExtension();
		const homeAlias = join(root, 'home-alias');
		await fs.symlink(home, homeAlias, 'junction');
		const aliasAdmission = disposables.add(new CopilotSessionExtensionLaunchAdmission(homeAlias, new NullLogService()));
		disposables.add(aliasAdmission.acquire('owner'));
		assert.strictEqual(await aliasAdmission.resolve({ ...request(), modulePath: join(homeAlias, 'session-state', 'owner', 'extensions', 'preview', 'extension.mjs') }), canonicalModulePath);
	});

	for (const boundary of ['state', 'session', 'extensions', 'extension'] as const) {
		test(`rejects a ${boundary} directory symlink redirect`, async () => {
			await writeExtension('peer');
			const stateDirectory = join(home, 'session-state');
			const ownerDirectory = join(stateDirectory, 'owner');
			const ownerExtensions = join(ownerDirectory, 'extensions');
			const ownerExtension = join(ownerExtensions, 'preview');
			if (boundary === 'state') {
				await writeExtension();
				const relocated = join(home, 'relocated-state');
				await fs.rename(stateDirectory, relocated);
				await fs.symlink(relocated, stateDirectory, 'junction');
			} else if (boundary === 'session') {
				await fs.symlink(join(stateDirectory, 'peer'), ownerDirectory, 'junction');
			} else if (boundary === 'extensions') {
				await fs.mkdir(ownerDirectory);
				await fs.symlink(join(stateDirectory, 'peer', 'extensions'), ownerExtensions, 'junction');
			} else {
				await fs.mkdir(ownerExtensions, { recursive: true });
				await fs.symlink(join(stateDirectory, 'peer', 'extensions', 'preview'), ownerExtension, 'junction');
			}
			const diagnostics: string[] = [];
			const boundaryAdmission = disposables.add(new CopilotSessionExtensionLaunchAdmission(home, new class extends NullLogService {
				override trace(message: string): void {
					diagnostics.push(message);
				}
			}));
			disposables.add(boundaryAdmission.acquire('owner'));
			disposables.add(boundaryAdmission.acquire('peer'));
			assert.deepStrictEqual({
				entrypointIsFile: (await fs.stat(request().modulePath)).isFile(),
				resolved: await boundaryAdmission.resolve(request()),
				diagnostics,
			}, {
				entrypointIsFile: true,
				resolved: undefined,
				diagnostics: [`[Copilot] Denied session extension launch 'session:owner:preview': canonical entrypoint escapes its session scope`],
			});
		});
	}

	test('rejects a redirected entrypoint file', async function () {
		await writeExtension();
		const outsideFile = join(root, 'extension.mjs');
		await fs.writeFile(outsideFile, '');
		await fs.unlink(request().modulePath);
		try {
			await fs.symlink(outsideFile, request().modulePath, 'file');
		} catch (error) {
			if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') {
				this.skip();
			}
			throw error;
		}
		disposables.add(admission.acquire('owner'));
		assert.strictEqual(await admission.resolve(request()), undefined);
	});

	test('release and reacquisition do not revive an in-flight resolution', async () => {
		const canonicalModulePath = await writeExtension();
		const first = disposables.add(admission.acquire('owner'));
		const pending = admission.resolve(request());
		first.dispose();
		disposables.add(admission.acquire('owner'));
		assert.deepStrictEqual({ previous: await pending, replacement: await admission.resolve(request()) }, { previous: undefined, replacement: canonicalModulePath });
	});

	test('client disposal revokes in-flight and future launch admission', async () => {
		await writeExtension();
		disposables.add(admission.acquire('owner'));
		const pending = admission.resolve(request());
		admission.dispose();
		disposables.add(admission.acquire('owner'));
		assert.deepStrictEqual([await pending, await admission.resolve(request())], [undefined, undefined]);
	});
});
