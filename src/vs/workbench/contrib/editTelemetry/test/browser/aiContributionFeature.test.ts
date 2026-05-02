/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { StringEditWithReason } from '../../browser/helpers/observableWorkspace.js';
import { AiContributionFeature } from '../../browser/aiContributionFeature.js';
import { EditSources } from '../../../../../editor/common/textModelEditSource.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MutableObservableWorkspace } from './editTelemetry.test.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { timeout } from '../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';

suite('AiContributionFeature', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let workspace: MutableObservableWorkspace;

	const fileA = URI.parse('file:///a.ts');
	const fileB = URI.parse('file:///b.ts');

	const chatEdit = EditSources.chatApplyEdits({
		languageId: 'plaintext',
		modelId: undefined,
		codeBlockSuggestionId: undefined,
		extensionId: undefined,
		mode: undefined,
		requestId: undefined,
		sessionId: undefined,
	});

	const userEdit = EditSources.cursor({ kind: 'type' });

	const inlineCompletionEdit = EditSources.inlineCompletionAccept({
		nes: false,
		requestUuid: 'test-uuid',
		languageId: 'plaintext',
		correlationId: undefined,
	});

	function setup(sharedStorage?: TestStorageService): void {
		disposables = new DisposableStore();
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(), false, undefined, true));
		const storage = sharedStorage ?? disposables.add(new TestStorageService());
		instantiationService.stub(IStorageService, storage);

		workspace = new MutableObservableWorkspace();
		disposables.add(instantiationService.createInstance(AiContributionFeature, workspace));
	}

	function hasAiContributions(uris: URI[], level: 'chatAndAgent' | 'all'): boolean {
		return CommandsRegistry.getCommand('_aiEdits.hasAiContributions')!.handler(undefined!, uris, level) as unknown as boolean;
	}

	function clearAiContributions(uris: URI[]): void {
		CommandsRegistry.getCommand('_aiEdits.clearAiContributions')!.handler(undefined!, uris);
	}

	function clearAllAiContributions(): void {
		CommandsRegistry.getCommand('_aiEdits.clearAllAiContributions')!.handler(undefined!);
	}

	test('no contributions initially', () => runWithFakedTimers({}, async () => {
		setup();
		const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
		await timeout(1500);
		assert.strictEqual(hasAiContributions([d.uri], 'all'), false);
		assert.strictEqual(hasAiContributions([d.uri], 'chatAndAgent'), false);
		disposables.dispose();
	}));

	test('detects chat AI edits', () => runWithFakedTimers({}, async () => {
		setup();
		const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
		await timeout(1500);

		d.applyEdit(StringEditWithReason.replace(d.findRange('hello'), 'world', chatEdit));
		await timeout(1500);

		assert.strictEqual(hasAiContributions([d.uri], 'all'), true);
		assert.strictEqual(hasAiContributions([d.uri], 'chatAndAgent'), true);
		disposables.dispose();
	}));

	test('detects inline completion AI edits at all level only', () => runWithFakedTimers({}, async () => {
		setup();
		const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
		await timeout(1500);

		d.applyEdit(StringEditWithReason.replace(d.findRange('hello'), 'world', inlineCompletionEdit));
		await timeout(1500);

		assert.strictEqual(hasAiContributions([d.uri], 'all'), true);
		assert.strictEqual(hasAiContributions([d.uri], 'chatAndAgent'), false);
		disposables.dispose();
	}));

	test('does not detect user edits as AI', () => runWithFakedTimers({}, async () => {
		setup();
		const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
		await timeout(1500);

		d.applyEdit(StringEditWithReason.replace(d.findRange('hello'), 'world', userEdit));
		await timeout(1500);

		assert.strictEqual(hasAiContributions([d.uri], 'all'), false);
		assert.strictEqual(hasAiContributions([d.uri], 'chatAndAgent'), false);
		disposables.dispose();
	}));

	test('clear resets contributions for specific resources', () => runWithFakedTimers({}, async () => {
		setup();
		const dA = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
		const dB = disposables.add(workspace.createDocument({ uri: fileB, initialValue: 'world' }, undefined));
		await timeout(1500);

		dA.applyEdit(StringEditWithReason.replace(dA.findRange('hello'), 'foo', chatEdit));
		dB.applyEdit(StringEditWithReason.replace(dB.findRange('world'), 'bar', chatEdit));
		await timeout(1500);

		assert.strictEqual(hasAiContributions([dA.uri], 'all'), true);
		assert.strictEqual(hasAiContributions([dB.uri], 'all'), true);

		clearAiContributions([dA.uri]);

		assert.strictEqual(hasAiContributions([dA.uri], 'all'), false);
		assert.strictEqual(hasAiContributions([dB.uri], 'all'), true);
		disposables.dispose();
	}));

	test('clearAll resets all contributions', () => runWithFakedTimers({}, async () => {
		setup();
		const dA = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
		const dB = disposables.add(workspace.createDocument({ uri: fileB, initialValue: 'world' }, undefined));
		await timeout(1500);

		dA.applyEdit(StringEditWithReason.replace(dA.findRange('hello'), 'foo', chatEdit));
		dB.applyEdit(StringEditWithReason.replace(dB.findRange('world'), 'bar', chatEdit));
		await timeout(1500);

		clearAllAiContributions();

		assert.strictEqual(hasAiContributions([dA.uri], 'all'), false);
		assert.strictEqual(hasAiContributions([dB.uri], 'all'), false);
		disposables.dispose();
	}));

	test('tracks new edits after clear', () => runWithFakedTimers({}, async () => {
		setup();
		const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
		await timeout(1500);

		d.applyEdit(StringEditWithReason.replace(d.findRange('hello'), 'world', chatEdit));
		await timeout(1500);

		clearAiContributions([d.uri]);
		assert.strictEqual(hasAiContributions([d.uri], 'all'), false);

		d.applyEdit(StringEditWithReason.replace(d.findRange('world'), 'again', chatEdit));
		await timeout(1500);

		assert.strictEqual(hasAiContributions([d.uri], 'all'), true);
		disposables.dispose();
	}));

	test('contributions persist after document is closed', () => runWithFakedTimers({}, async () => {
		setup();
		const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
		await timeout(1500);

		d.applyEdit(StringEditWithReason.replace(d.findRange('hello'), 'world', chatEdit));
		await timeout(1500);

		assert.strictEqual(hasAiContributions([d.uri], 'all'), true);

		d.dispose();
		await timeout(1500);

		// Contributions are tracked per-URI and must survive document close,
		// otherwise commits made after the file was closed would lose the trailer.
		assert.strictEqual(hasAiContributions([fileA], 'all'), true);
		assert.strictEqual(hasAiContributions([fileA], 'chatAndAgent'), true);
		disposables.dispose();
	}));

	test('returns false for unknown URIs', () => runWithFakedTimers({}, async () => {
		setup();
		assert.strictEqual(hasAiContributions([URI.parse('file:///unknown.ts')], 'all'), false);
		disposables.dispose();
	}));

	test('checks multiple resources', () => runWithFakedTimers({}, async () => {
		setup();
		const dA = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
		disposables.add(workspace.createDocument({ uri: fileB, initialValue: 'world' }, undefined));
		await timeout(1500);

		dA.applyEdit(StringEditWithReason.replace(dA.findRange('hello'), 'foo', chatEdit));
		await timeout(1500);

		// Returns true if any of the resources has AI contributions
		assert.strictEqual(hasAiContributions([fileA, fileB], 'all'), true);
		assert.strictEqual(hasAiContributions([fileB, fileA], 'all'), true);
		assert.strictEqual(hasAiContributions([fileB], 'all'), false);
		disposables.dispose();
	}));

	test('persisted AI contribution levels survive a workspace reload', () => runWithFakedTimers({}, async () => {
		const reloadStore = new DisposableStore();
		const sharedStorage = reloadStore.add(new TestStorageService());

		setup(sharedStorage);
		const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
		await timeout(1500);

		d.applyEdit(StringEditWithReason.replace(d.findRange('hello'), 'world', chatEdit));
		await timeout(1500);

		// Simulate a window reload: dispose everything (which flushes pending writes),
		// then bring up a fresh feature against the same backing storage.
		disposables.dispose();

		setup(sharedStorage);
		await timeout(1500);

		assert.strictEqual(hasAiContributions([fileA], 'all'), true);
		assert.strictEqual(hasAiContributions([fileA], 'chatAndAgent'), true);
		disposables.dispose();
		reloadStore.dispose();
	}));

	test('clear removes contributions for a closed (persisted-only) file', () => runWithFakedTimers({}, async () => {
		setup();
		const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
		await timeout(1500);

		d.applyEdit(StringEditWithReason.replace(d.findRange('hello'), 'world', chatEdit));
		await timeout(1500);

		// Close the document so the entry lives only in the persisted map.
		d.dispose();
		await timeout(1500);
		assert.strictEqual(hasAiContributions([fileA], 'all'), true);

		clearAiContributions([fileA]);

		assert.strictEqual(hasAiContributions([fileA], 'all'), false);
		assert.strictEqual(hasAiContributions([fileA], 'chatAndAgent'), false);
		disposables.dispose();
	}));

	test('dispose flushes pending writes even before the debounce fires', () => runWithFakedTimers({}, async () => {
		const reloadStore = new DisposableStore();
		const sharedStorage = reloadStore.add(new TestStorageService());

		setup(sharedStorage);
		const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));

		// Apply an AI edit and immediately tear down, without waiting for the
		// save scheduler's debounce window to elapse. The dispose path must
		// still flush the pending snapshot, otherwise the next window would
		// see no attribution for a file that the agent just edited.
		d.applyEdit(StringEditWithReason.replace(d.findRange('hello'), 'world', chatEdit));
		disposables.dispose();

		setup(sharedStorage);
		await timeout(1500);

		assert.strictEqual(hasAiContributions([fileA], 'all'), true);
		assert.strictEqual(hasAiContributions([fileA], 'chatAndAgent'), true);
		disposables.dispose();
		reloadStore.dispose();
	}));

});
