/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { restoreMissingLegacyMarkers } from '../../node/copilot/copilotLegacyMarkerFallback.js';

suite('restoreMissingLegacyMarkers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let root: string;
	let sessionStateRoot: string;
	let sharedBulkFile: string;
	let perInstallBulkFile: string;

	setup(async () => {
		root = await fs.mkdtemp(join(tmpdir(), 'legacy-marker-fallback-'));
		sessionStateRoot = join(root, 'session-state');
		sharedBulkFile = join(root, 'vscode.session.metadata.cache.json');
		perInstallBulkFile = join(root, 'copilotcli.session.metadata.json');
		await fs.mkdir(sessionStateRoot);
	});

	teardown(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	async function sessionFolders(...ids: string[]): Promise<void> {
		for (const id of ids) {
			await fs.mkdir(join(sessionStateRoot, id));
		}
	}

	async function readMarker(id: string): Promise<unknown> {
		try {
			return JSON.parse(await fs.readFile(join(sessionStateRoot, id, 'vscode.metadata.json'), 'utf8'));
		} catch {
			return undefined;
		}
	}

	test('restores missing markers of VS Code sessions with the backfill\'s rules', async () => {
		const workspaceFolder = { folderPath: '/work', timestamp: 1 };
		await sessionFolders('written', 'origin-less', 'has-marker', 'other-app', 'in-both', 'untitled-draft');
		await fs.writeFile(join(sessionStateRoot, 'has-marker', 'vscode.metadata.json'), JSON.stringify({ origin: 'vscode', customTitle: 'Kept' }));
		await fs.writeFile(sharedBulkFile, JSON.stringify({
			'written': { origin: 'vscode', customTitle: 'Restored', workspaceFolder, writtenToDisc: false, modified: 5 },
			// Written before `origin` existed: VS Code workspace properties identify it.
			'origin-less': { workspaceFolder },
			'has-marker': { origin: 'vscode', customTitle: 'Bulk copy' },
			'other-app': { origin: 'other', workspaceFolder },
			'no-folder': { origin: 'vscode', workspaceFolder },
			'in-both': { origin: 'vscode', customTitle: 'Older', modified: 1 },
			'untitled-draft': { origin: 'vscode', workspaceFolder },
			'..': { origin: 'vscode', workspaceFolder },
			'no-properties': {},
		}));
		await fs.writeFile(perInstallBulkFile, JSON.stringify({
			'in-both': { origin: 'vscode', customTitle: 'Newer', modified: 2 },
		}));

		const result = await restoreMissingLegacyMarkers(sessionStateRoot, sharedBulkFile, perInstallBulkFile, 'vscode.metadata.json', new NullLogService());

		assert.deepStrictEqual({
			result,
			markers: {
				'written': await readMarker('written'),
				'origin-less': await readMarker('origin-less'),
				'has-marker': await readMarker('has-marker'),
				'other-app': await readMarker('other-app'),
				'in-both': await readMarker('in-both'),
				'untitled-draft': await readMarker('untitled-draft'),
			},
			leftovers: (await fs.readdir(join(sessionStateRoot, 'written'))).sort(),
		}, {
			result: { sharedBulkFile: 'present', perInstallBulkFile: 'present', candidates: 9, notVSCode: 4, exists: 1, missingSessionDirectory: 1, written: 3, failed: 0 },
			markers: {
				'written': { origin: 'vscode', customTitle: 'Restored', workspaceFolder, modified: 5 },
				'origin-less': { workspaceFolder },
				'has-marker': { origin: 'vscode', customTitle: 'Kept' },
				'other-app': undefined,
				'in-both': { origin: 'vscode', customTitle: 'Newer', modified: 2 },
				'untitled-draft': undefined,
			},
			leftovers: ['vscode.metadata.json'],
		});
	});

	test('reports missing and unreadable bulk files without writing anything', async () => {
		await sessionFolders('session');
		await fs.writeFile(perInstallBulkFile, '{ not json');

		const result = await restoreMissingLegacyMarkers(sessionStateRoot, sharedBulkFile, perInstallBulkFile, 'vscode.metadata.json', new NullLogService());
		const withoutPerInstall = await restoreMissingLegacyMarkers(sessionStateRoot, sharedBulkFile, undefined, 'vscode.metadata.json', new NullLogService());

		assert.deepStrictEqual({ result, withoutPerInstall, marker: await readMarker('session') }, {
			result: { sharedBulkFile: 'missing', perInstallBulkFile: 'invalid', candidates: 0, notVSCode: 0, exists: 0, missingSessionDirectory: 0, written: 0, failed: 0 },
			withoutPerInstall: { sharedBulkFile: 'missing', perInstallBulkFile: 'missing', candidates: 0, notVSCode: 0, exists: 0, missingSessionDirectory: 0, written: 0, failed: 0 },
			marker: undefined,
		});
	});

	test('writes nothing for markers that already exist', async () => {
		await sessionFolders('backfilled');
		await fs.writeFile(join(sessionStateRoot, 'backfilled', 'vscode.metadata.json'), JSON.stringify({ origin: 'vscode', customTitle: 'Kept' }));
		await fs.writeFile(sharedBulkFile, JSON.stringify({ 'backfilled': { origin: 'vscode', customTitle: 'Bulk copy' } }));
		const writes: string[] = [];
		const fileSystem: typeof fs = {
			...fs,
			writeFile: async (...args: Parameters<typeof fs.writeFile>) => { writes.push('writeFile'); return fs.writeFile(...args); },
			link: async (...args: Parameters<typeof fs.link>) => { writes.push('link'); return fs.link(...args); },
			unlink: async (...args: Parameters<typeof fs.unlink>) => { writes.push('unlink'); return fs.unlink(...args); },
		};

		const result = await restoreMissingLegacyMarkers(sessionStateRoot, sharedBulkFile, undefined, 'vscode.metadata.json', new NullLogService(), fileSystem);

		assert.deepStrictEqual({ exists: result.exists, writes, marker: await readMarker('backfilled') }, {
			exists: 1,
			writes: [],
			marker: { origin: 'vscode', customTitle: 'Kept' },
		});
	});

	test('never replaces a concurrent marker, and leaves the marker untouched where hard links are unsupported', async () => {
		await sessionFolders('no-links', 'updated-without-links', 'raced');
		await fs.writeFile(sharedBulkFile, JSON.stringify({
			'no-links': { origin: 'vscode', customTitle: 'Linkless' },
			'updated-without-links': { origin: 'vscode', customTitle: 'Stale bulk copy' },
			'raced': { origin: 'vscode', customTitle: 'Bulk copy' },
		}));
		const concurrent = JSON.stringify({ origin: 'vscode', customTitle: 'Concurrent' });
		const fileSystem: typeof fs = {
			...fs,
			link: async (existingPath, newPath) => {
				const path = String(newPath);
				if (path.includes('raced')) {
					// Another writer creates the marker between the check and the link.
					await fs.writeFile(newPath, concurrent);
					return fs.link(existingPath, newPath);
				}
				if (path.includes('updated-without-links')) {
					// The extension updates its marker in place while this one is being published.
					await fs.writeFile(newPath, concurrent);
				}
				throw Object.assign(new Error('not supported'), { code: 'EPERM' });
			},
		};

		const result = await restoreMissingLegacyMarkers(sessionStateRoot, sharedBulkFile, undefined, 'vscode.metadata.json', new NullLogService(), fileSystem);

		assert.deepStrictEqual({
			result: { written: result.written, exists: result.exists, failed: result.failed },
			noLinks: await readMarker('no-links'),
			updatedWithoutLinks: await readMarker('updated-without-links'),
			raced: await readMarker('raced'),
			leftovers: {
				noLinks: await fs.readdir(join(sessionStateRoot, 'no-links')),
				updatedWithoutLinks: await fs.readdir(join(sessionStateRoot, 'updated-without-links')),
				raced: await fs.readdir(join(sessionStateRoot, 'raced')),
			},
		}, {
			result: { written: 0, exists: 1, failed: 2 },
			noLinks: undefined,
			updatedWithoutLinks: { origin: 'vscode', customTitle: 'Concurrent' },
			raced: { origin: 'vscode', customTitle: 'Concurrent' },
			leftovers: { noLinks: [], updatedWithoutLinks: ['vscode.metadata.json'], raced: ['vscode.metadata.json'] },
		});
	});
});
