/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Uri } from 'vscode';
import { PendingOperations } from '../util';
import { getRepositoryAfterWorkspaceFolderChanges } from '../fileSystemProvider';
import { Repository } from '../repository';

suite('PendingOperations', () => {

	test('settled resolves immediately without operations', async () => {
		await new PendingOperations().settled();
	});

	test('settled waits for tracked operations, including failed and later ones', async () => {
		const operations = new PendingOperations();
		const log: string[] = [];

		let finishFirst!: () => void;
		operations.track(new Promise<void>(resolve => finishFirst = resolve).then(() => {
			log.push('first');
			// Started while waiting
			operations.track(new Promise<void>(resolve => setTimeout(resolve, 10)).then(() => log.push('nested')));
		}));
		operations.track(Promise.reject(new Error('failed'))).catch(() => log.push('failed'));

		const settled = operations.settled().then(() => log.push('settled'));
		finishFirst();
		await settled;

		assert.deepStrictEqual(log, ['failed', 'first', 'nested', 'settled']);
	});
});

suite('getRepositoryAfterWorkspaceFolderChanges', () => {

	const repository = {} as Repository;
	const uri = Uri.file('/work/worktree/file.ts');

	function createModel(opened: { repository?: Repository }, settled: Promise<void>) {
		let waits = 0;
		return {
			get waits() { return waits; },
			getRepository: () => opened.repository,
			whenWorkspaceFolderChangesSettled: () => { waits++; return settled; }
		};
	}

	test('known repository does not wait', async () => {
		const model = createModel({ repository }, new Promise<void>(() => { }));
		assert.strictEqual(await getRepositoryAfterWorkspaceFolderChanges(model, uri), repository);
		assert.strictEqual(model.waits, 0);
	});

	test('waits for the folder change that opens the repository', async () => {
		const opened: { repository?: Repository } = {};
		let finishOpening!: () => void;
		const model = createModel(opened, new Promise<void>(resolve => finishOpening = () => { opened.repository = repository; resolve(); }));

		let result: Repository | undefined | 'pending' = 'pending';
		const lookup = getRepositoryAfterWorkspaceFolderChanges(model, uri).then(r => result = r);
		await new Promise(resolve => setTimeout(resolve, 10));
		assert.strictEqual(result, 'pending');

		finishOpening();
		await lookup;
		assert.strictEqual(result, repository);
	});

	test('repository that is still missing after the folder changes is not found', async () => {
		assert.strictEqual(await getRepositoryAfterWorkspaceFolderChanges(createModel({}, Promise.resolve()), uri), undefined);
	});
});
