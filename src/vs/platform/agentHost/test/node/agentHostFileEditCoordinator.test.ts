/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostFileEditCoordinator, describeDiscardedFileEdits, FileEditsInProgressError } from '../../node/agentHostFileEditCoordinator.js';

suite('AgentHostFileEditCoordinator', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const file = URI.file('/repo/src/file.ts');

	test('runs a change of a file between its edit tool calls: after the running ones, before those that start later', async () => {
		const coordinator = disposables.add(new AgentHostFileEditCoordinator());
		const log: string[] = [];
		disposables.add(coordinator.onDidChangeEditing(resource => log.push(`editing ${resource.path}: ${coordinator.isEditing(resource)}`)));

		const running = await coordinator.beginEdit(file);
		const otherFile = await coordinator.beginEdit(URI.file('/repo/src/other.ts'));
		const finishChange = new DeferredPromise<void>();
		const change = coordinator.runExclusive(file, async () => {
			log.push('change runs');
			await finishChange.p;
			log.push('change ends');
		});
		const later = coordinator.beginEdit(file).then(edit => {
			log.push('later edit begins');
			return edit;
		});
		await Promise.resolve();
		log.push('running edit ends');
		running.dispose();
		await Promise.resolve();
		await Promise.resolve();
		finishChange.complete();
		await change;
		(await later).dispose();
		otherFile.dispose();

		assert.deepStrictEqual(log, [
			'editing /repo/src/file.ts: true',
			'editing /repo/src/other.ts: true',
			'running edit ends',
			'editing /repo/src/file.ts: false',
			'change runs',
			'change ends',
			'editing /repo/src/file.ts: true',
			'later edit begins',
			'editing /repo/src/file.ts: false',
			'editing /repo/src/other.ts: false',
		]);
	});

	test('gives up on a change whose file an edit tool call keeps writing, and lets later edits run', async () => {
		const coordinator = disposables.add(new AgentHostFileEditCoordinator());
		const running = await coordinator.beginEdit(file);
		let ran = false;
		const error = await coordinator.runExclusive(file, async () => { ran = true; }, 1).then(() => undefined, err => err);
		const later = await coordinator.beginEdit(file);
		later.dispose();
		running.dispose();

		assert.deepStrictEqual({ error: error instanceof FileEditsInProgressError, ran, editing: coordinator.isEditing(file) }, { error: true, ran: false, editing: false });
	});

	test('knows which providers coordinate their edit tool calls while they are registered', () => {
		const coordinator = disposables.add(new AgentHostFileEditCoordinator());
		const first = coordinator.registerCoordinatedProvider('copilotcli');
		const second = coordinator.registerCoordinatedProvider('copilotcli');
		const registered = coordinator.isCoordinatedProvider('copilotcli');
		first.dispose();
		first.dispose();
		const afterOne = coordinator.isCoordinatedProvider('copilotcli');
		second.dispose();

		assert.deepStrictEqual({ registered, afterOne, afterBoth: coordinator.isCoordinatedProvider('copilotcli'), other: coordinator.isCoordinatedProvider('claude'), none: coordinator.isCoordinatedProvider(undefined) }, {
			registered: true,
			afterOne: true,
			afterBoth: false,
			other: false,
			none: false,
		});
	});

	test('tells an agent which of its changes the user undid', () => {
		const resource = URI.file('/repo/src/file.ts');
		assert.deepStrictEqual([
			describeDiscardedFileEdits({ storage: 'agent:/session', resource, deleted: false }),
			describeDiscardedFileEdits({ storage: 'agent:/session', resource, lines: { startLineNumber: 15, endLineNumberExclusive: 18 }, deleted: false }),
			describeDiscardedFileEdits({ storage: 'agent:/session', resource, lines: { startLineNumber: 4, endLineNumberExclusive: 5 }, deleted: false }),
			describeDiscardedFileEdits({ storage: 'agent:/session', resource, lines: { startLineNumber: 7, endLineNumberExclusive: 7 }, deleted: false }),
			describeDiscardedFileEdits({ storage: 'agent:/session', resource, deleted: true }),
		], [
			`The user undid your changes to ${resource.fsPath}. Read the file again before you edit it, and don't make those changes again unless the user asks you to.`,
			`The user undid your changes to ${resource.fsPath} on lines 15-17. Read the file again before you edit it, and don't make those changes again unless the user asks you to.`,
			`The user undid your changes to ${resource.fsPath} on line 4. Read the file again before you edit it, and don't make those changes again unless the user asks you to.`,
			`The user undid your changes to ${resource.fsPath} near line 7. Read the file again before you edit it, and don't make those changes again unless the user asks you to.`,
			`The user undid your creation of ${resource.fsPath}, so the file no longer exists. Don't create it again unless the user asks you to.`,
		]);
	});
});
