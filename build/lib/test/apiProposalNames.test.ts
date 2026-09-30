/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { before, suite, test, type TestContext } from 'node:test';
import { checkApiProposalNames, generateApiProposalNames } from '../apiProposalNames.ts';
import * as task from '../gulp/task.ts';

const expectedRegistry = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.

const _allApiProposals = {
	aProposal: {
		proposal: 'https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.aProposal.d.ts',
	},
	zProposal2: {
		proposal: 'https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.zProposal2.d.ts',
	}
};
export const allApiProposals = Object.freeze<{ [proposalName: string]: Readonly<{ proposal: string }> }>(_allApiProposals);
export type ApiProposalName = keyof typeof _allApiProposals;
`;

function createFixture(context: TestContext, registry = expectedRegistry) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-api-proposal-names-'));
	context.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const declarationsPath = path.join(root, 'src', 'vscode-dts');
	const registryPath = path.join(root, 'src', 'vs', 'platform', 'extensions', 'common', 'extensionsApiProposals.ts');
	fs.mkdirSync(declarationsPath, { recursive: true });
	fs.mkdirSync(path.dirname(registryPath), { recursive: true });
	fs.writeFileSync(path.join(declarationsPath, 'vscode.proposed.zProposal2.d.ts'), 'declare module \'vscode\' { }\n');
	fs.writeFileSync(path.join(declarationsPath, 'vscode.proposed.aProposal.d.ts'), 'declare module \'vscode\' { }\n');
	fs.writeFileSync(path.join(declarationsPath, 'vscode.d.ts'), 'declare module \'vscode\' { }\n');
	fs.writeFileSync(path.join(declarationsPath, 'README.md'), 'Not a proposal.\n');
	fs.writeFileSync(registryPath, registry);
	return { root, declarationsPath, registryPath };
}

function snapshot(root: string) {
	return fs.readdirSync(root, { recursive: true, withFileTypes: true })
		.map(entry => path.join(entry.parentPath, entry.name))
		.sort()
		.map(filePath => {
			const stat = fs.statSync(filePath, { bigint: true });
			return {
				path: path.relative(root, filePath),
				contents: stat.isFile() ? fs.readFileSync(filePath) : undefined,
				mtimeNs: stat.mtimeNs,
				ino: stat.ino,
				mode: stat.mode,
			};
		});
}

function assertReadOnly(root: string, action: () => void): void {
	const before = snapshot(root);
	action();
	assert.deepStrictEqual(snapshot(root), before);
}

suite('API proposal registry', () => {
	test('preserves generated format, metadata, ordering, filtering, and deduplication', () => {
		assert.strictEqual(generateApiProposalNames([
			'vscode.proposed.zProposal2.d.ts',
			path.join('nested', 'vscode.proposed.aProposal.d.ts'),
			'vscode.proposed.zProposal2.d.ts',
			'vscode.proposed.invalid-name.d.ts',
			'vscode.proposed.ignored.d.ts.bak',
			'vscode.d.ts',
			'README.md',
		], '\n'), expectedRegistry);
	});

	for (const eol of ['\n', '\r\n']) {
		test(`accepts an up-to-date ${eol === '\n' ? 'LF' : 'CRLF'} registry without writes`, context => {
			const registry = expectedRegistry.replace(/\n/g, eol);
			const fixture = createFixture(context, registry);
			assert.strictEqual(generateApiProposalNames([
				'vscode.proposed.zProposal2.d.ts',
				'vscode.proposed.aProposal.d.ts',
			], eol), registry);
			assertReadOnly(fixture.root, () => checkApiProposalNames(fixture.root));
		});
	}

	test('normalizes only CRLF for comparison, without rewriting mixed line endings', context => {
		const fixture = createFixture(context, expectedRegistry.replace('\n', '\r\n'));
		assertReadOnly(fixture.root, () => checkApiProposalNames(fixture.root));
	});

	test('includes declarations in subdirectories', context => {
		const fixture = createFixture(context);
		const nestedPath = path.join(fixture.declarationsPath, 'nested');
		fs.mkdirSync(nestedPath);
		fs.renameSync(
			path.join(fixture.declarationsPath, 'vscode.proposed.aProposal.d.ts'),
			path.join(nestedPath, 'vscode.proposed.aProposal.d.ts')
		);
		assertReadOnly(fixture.root, () => checkApiProposalNames(fixture.root));
	});

	for (const change of ['added', 'removed', 'renamed']) {
		test(`rejects ${change} proposals without repairing the registry`, context => {
			const fixture = createFixture(context);
			const originalPath = path.join(fixture.declarationsPath, 'vscode.proposed.aProposal.d.ts');
			const newPath = path.join(fixture.declarationsPath, 'vscode.proposed.newProposal.d.ts');
			if (change === 'added') {
				fs.writeFileSync(newPath, 'declare module \'vscode\' { }\n');
			} else if (change === 'removed') {
				fs.unlinkSync(originalPath);
			} else {
				fs.renameSync(originalPath, newPath);
			}
			assertReadOnly(fixture.root, () => assert.throws(() => checkApiProposalNames(fixture.root), {
				message: `API proposal registry ${fixture.registryPath} is out of date. Run "npm run gulp compile-api-proposal-names" from the repository root and include the updated registry with your change.`
			}));
		});
	}

	for (const [description, registry] of [
		['metadata', expectedRegistry.replace('/main/', '/stale/')],
		['format', expectedRegistry.replace('Object.freeze', 'Object.seal')],
		['ordering', expectedRegistry.replaceAll('aProposal', 'temporary').replaceAll('zProposal2', 'aProposal').replaceAll('temporary', 'zProposal2')],
		['missing final newline', expectedRegistry.trimEnd()],
		['unsupported CR-only line endings', expectedRegistry.replace(/\n/g, '\r')],
		['empty output', ''],
	]) {
		test(`rejects stale ${description} without writes`, context => {
			const fixture = createFixture(context, registry);
			assertReadOnly(fixture.root, () => assert.throws(() => checkApiProposalNames(fixture.root), {
				message: /is out of date.*npm run gulp compile-api-proposal-names/
			}));
		});
	}

	for (const unreadable of [false, true]) {
		test(`reports ${unreadable ? 'an unreadable' : 'a missing'} registry with an update command and cause`, context => {
			const fixture = createFixture(context);
			fs.unlinkSync(fixture.registryPath);
			if (unreadable) {
				fs.mkdirSync(fixture.registryPath);
			}
			assertReadOnly(fixture.root, () => assert.throws(() => checkApiProposalNames(fixture.root), error => {
				return error instanceof Error
					&& error.message === `Cannot read API proposal registry ${fixture.registryPath}. Run "npm run gulp compile-api-proposal-names" from the repository root and include the updated registry with your change.`
					&& error.cause instanceof Error;
			}));
		});
	}

	test('reports a missing declaration directory', context => {
		const fixture = createFixture(context);
		fs.rmSync(fixture.declarationsPath, { recursive: true });
		assertReadOnly(fixture.root, () => assert.throws(() => checkApiProposalNames(fixture.root), {
			code: 'ENOENT'
		}));
	});

	test('rejects an empty set of proposal declarations', context => {
		const fixture = createFixture(context);
		fs.unlinkSync(path.join(fixture.declarationsPath, 'vscode.proposed.aProposal.d.ts'));
		fs.unlinkSync(path.join(fixture.declarationsPath, 'vscode.proposed.zProposal2.d.ts'));
		assertReadOnly(fixture.root, () => assert.throws(() => checkApiProposalNames(fixture.root), {
			message: `No API proposal declarations found in ${fixture.declarationsPath}.`
		}));
	});

	test('reports an unreadable declaration instead of accepting its filename', context => {
		const fixture = createFixture(context);
		const declarationPath = path.join(fixture.declarationsPath, 'vscode.proposed.aProposal.d.ts');
		fs.unlinkSync(declarationPath);
		fs.mkdirSync(declarationPath);
		assertReadOnly(fixture.root, () => assert.throws(() => checkApiProposalNames(fixture.root), {
			code: 'EISDIR'
		}));
	});
});

function isWrappedTask(value: task.Task): value is task.Task & { unwrap(): task.Task } {
	return 'unwrap' in value && typeof value.unwrap === 'function';
}

function getTask(name: string): task.Task {
	const value = task.task(name);
	assert.ok(value, `Missing registered task: ${name}`);
	return isWrappedTask(value) ? value.unwrap() : value;
}

async function inDirectory(directory: string, action: () => Promise<void>): Promise<void> {
	const previousDirectory = process.cwd();
	try {
		process.chdir(directory);
		await action();
	} finally {
		process.chdir(previousDirectory);
	}
}

function instrumentCoreCI(value: task.Task, events: string[], restore: (() => void)[]): void {
	assert.ok(value._tasks);
	const tasks = value._tasks;
	const originalTasks = tasks.slice();
	restore.push(() => tasks.splice(0, tasks.length, ...originalTasks));
	for (let i = 0; i < tasks.length; i++) {
		const child = tasks[i];
		if (child._tasks) {
			instrumentCoreCI(child, events, restore);
		} else {
			const name = child.taskName || child.displayName || '<anonymous>';
			// Keep the real composition and check, but never execute a full build in this test.
			tasks[i] = async () => {
				if (child === getTask('check-api-proposal-names')) {
					await task.series(child)();
				}
				events.push(name);
			};
		}
	}
}

suite('API proposal registry tasks', () => {
	before(async () => {
		await import('../../gulpfile.ts');
	});

	test('core-ci awaits the check exactly once before all consumers', async context => {
		const fixture = createFixture(context);
		const coreCI = getTask('core-ci');
		const events: string[] = [];
		const restore: (() => void)[] = [];
		const before = snapshot(fixture.root);
		try {
			instrumentCoreCI(coreCI, events, restore);
			await inDirectory(fixture.root, () => task.series(coreCI)());
		} finally {
			restore.reverse().forEach(fn => fn());
		}
		assert.deepStrictEqual({
			first: events[0],
			stages: events.filter(name => /api-proposal-names|tsgo-typecheck|esbuild-/.test(name)),
			files: snapshot(fixture.root),
		}, {
			first: 'check-api-proposal-names',
			stages: [
				'check-api-proposal-names',
				'tsgo-typecheck',
				'esbuild-out-build',
				'esbuild-vscode-min',
				'esbuild-vscode-reh-min',
				'esbuild-vscode-reh-web-min',
			],
			files: before,
		});
	});

	test('a failed check stops the actual core-ci task before any consumer runs', async context => {
		const fixture = createFixture(context, 'stale registry\n');
		const coreCI = getTask('core-ci');
		const events: string[] = [];
		const restore: (() => void)[] = [];
		const before = snapshot(fixture.root);
		try {
			instrumentCoreCI(coreCI, events, restore);
			await inDirectory(fixture.root, () => assert.rejects(task.series(coreCI), {
				message: /is out of date.*npm run gulp compile-api-proposal-names/
			}));
		} finally {
			restore.reverse().forEach(fn => fn());
		}
		assert.deepStrictEqual({ events, files: snapshot(fixture.root) }, { events: [], files: before });
	});

	for (const eol of ['\n', '\r\n']) {
		test(`developer regeneration preserves ${eol === '\n' ? 'LF' : 'CRLF'} and skips unchanged output`, async context => {
			const fixture = createFixture(context, `stale registry${eol}`);
			await inDirectory(fixture.root, () => task.series(getTask('compile-api-proposal-names'))());
			assert.strictEqual(fs.readFileSync(fixture.registryPath, 'utf8'), expectedRegistry.replace(/\n/g, eol));
			const before = snapshot(fixture.root);
			await inDirectory(fixture.root, () => task.series(getTask('compile-api-proposal-names'))());
			assert.deepStrictEqual(snapshot(fixture.root), before);
			checkApiProposalNames(fixture.root);
		});
	}

	test('developer regeneration recreates missing output with the platform newline', async context => {
		const fixture = createFixture(context);
		fs.unlinkSync(fixture.registryPath);
		await inDirectory(fixture.root, () => task.series(getTask('compile-api-proposal-names'))());
		assert.strictEqual(fs.readFileSync(fixture.registryPath, 'utf8'), expectedRegistry.replace(/\n/g, os.EOL));
		checkApiProposalNames(fixture.root);
	});

	test('checking and developer generation ignore the same dot files and directories', async context => {
		const fixture = createFixture(context);
		const hiddenPath = path.join(fixture.declarationsPath, '.hidden');
		fs.mkdirSync(hiddenPath);
		fs.writeFileSync(path.join(hiddenPath, 'vscode.proposed.hidden.d.ts'), '');
		fs.writeFileSync(path.join(fixture.declarationsPath, '.vscode.proposed.hiddenFile.d.ts'), '');
		const before = snapshot(fixture.root);
		await inDirectory(fixture.root, () => task.series(getTask('compile-api-proposal-names'))());
		checkApiProposalNames(fixture.root);
		assert.deepStrictEqual(snapshot(fixture.root), before);
	});

	test('the real repository registry is up to date', () => {
		const root = path.resolve(import.meta.dirname, '..', '..', '..');
		const registryPath = path.join(root, 'src', 'vs', 'platform', 'extensions', 'common', 'extensionsApiProposals.ts');
		const before = { contents: fs.readFileSync(registryPath), stat: fs.statSync(registryPath, { bigint: true }) };
		checkApiProposalNames(root);
		const after = { contents: fs.readFileSync(registryPath), stat: fs.statSync(registryPath, { bigint: true }) };
		assert.deepStrictEqual({
			contents: after.contents,
			mtimeNs: after.stat.mtimeNs,
			ino: after.stat.ino,
		}, {
			contents: before.contents,
			mtimeNs: before.stat.mtimeNs,
			ino: before.stat.ino,
		});
	});
});
