/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IQuickInputService, IQuickPick, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession, ISessionType, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionModelsSnapshot, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ComparisonTargetPicker } from '../../browser/comparisonTargetPicker.js';

suite('ComparisonTargetPicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const folder = URI.file('/repository');

	function setup() {
		const instantiation = workbenchInstantiationService({}, store);
		const changed = store.add(new Emitter<void>());
		let created = 0;
		let deleted = 0;
		let models: ILanguageModelChatMetadataAndIdentifier[] = [];
		let snapshotError = false;
		const type: ISessionType = { id: 'agent', label: 'Agent', icon: Codicon.copilot, supportsWorktreeConfiguration: true, authRequirement: SessionTypeAuthRequirement.None };
		const provider = new class extends mock<ISessionsProvider>() {
			override readonly id = 'provider';
			override readonly label = 'Local';
			override readonly onDidChangeModels = changed.event;
			override getSessionTypes() { return [type]; }
			override async setWorktreeConfiguration() { }
			override createNewSession() {
				created++;
				return upcastPartial<ISession>({ sessionId: 'draft', loading: constObservable(true) });
			}
			override deleteNewSession(id: string) { assert.strictEqual(id, 'draft'); deleted++; }
			override getModelsSnapshot() {
				if (snapshotError) { throw new Error('Snapshot unavailable'); }
				return upcastPartial<ISessionModelsSnapshot>({ models });
			}
		};
		instantiation.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>() { return provider as ISessionsProvider as T; }
		});
		instantiation.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override getSessionTypesForFolder() { return [{ providerId: 'provider', sessionType: type }]; }
		});
		const quickInput = instantiation.get(IQuickInputService);
		const targetPicker = instantiation.createInstance(ComparisonTargetPicker);
		const setModels = (names: string[]) => {
			models = names.map(name => ({
				identifier: `id-${name}`,
				metadata: upcastPartial<ILanguageModelChatMetadata>({ name, isUserSelectable: name !== 'Hidden' }),
			}));
			changed.fire();
		};
		return { targetPicker, quickInput, setModels, counts: () => ({ created, deleted }), failSnapshot: () => { snapshotError = true; } };
	}

	async function currentPicker(service: IQuickInputService): Promise<IQuickPick<IQuickPickItem>> {
		await timeout(0);
		const picker = service.currentQuickInput;
		assert.ok(picker && picker.type === 'quickPick');
		return picker as IQuickPick<IQuickPickItem>;
	}

	async function selectFirst(service: IQuickInputService): Promise<void> {
		const picker = await currentPicker(service);
		const first = picker.items[0];
		assert.ok(first);
		picker.selectedItems = [first];
		picker.accept();
	}

	test('selects a provider-scoped model and disposes the temporary draft', async () => {
		const { targetPicker, quickInput, setModels, counts } = setup();
		setModels(['Visible', 'Hidden']);
		const result = targetPicker.pick(folder, CancellationToken.None);
		await selectFirst(quickInput);
		const modelPicker = await currentPicker(quickInput);
		assert.deepStrictEqual(modelPicker.items.map(item => item.label), ['Visible']);
		await selectFirst(quickInput);
		const target = await result;
		assert.deepStrictEqual({ target, counts: counts() }, {
			target: { providerId: 'provider', sessionTypeId: 'agent', providerLabel: 'Agent · Local', modelId: 'id-Visible', modelLabel: 'Visible' },
			counts: { created: 1, deleted: 1 },
		});
	});

	test('refreshes the open model picker when models arrive', async () => {
		const { targetPicker, quickInput, setModels } = setup();
		const result = targetPicker.pick(folder, CancellationToken.None);
		await selectFirst(quickInput);
		const picker = await currentPicker(quickInput);
		assert.strictEqual(picker.busy, true);
		setModels(['Ready']);
		assert.deepStrictEqual({ busy: picker.busy, labels: picker.items.map(item => item.label) }, { busy: false, labels: ['Ready'] });
		await selectFirst(quickInput);
		assert.strictEqual((await result)?.modelId, 'id-Ready');
	});

	test('closing the model picker abandons its temporary draft', async () => {
		const { targetPicker, quickInput, counts } = setup();
		const result = targetPicker.pick(folder, CancellationToken.None);
		await selectFirst(quickInput);
		(await currentPicker(quickInput)).hide();
		assert.deepStrictEqual({ result: await result, counts: counts() }, { result: undefined, counts: { created: 1, deleted: 1 } });
	});

	test('cancelling the view also closes the model picker and releases the draft', async () => {
		const { targetPicker, quickInput, counts } = setup();
		const source = store.add(new CancellationTokenSource());
		const result = targetPicker.pick(folder, source.token);
		await selectFirst(quickInput);
		await currentPicker(quickInput);
		source.cancel();
		assert.deepStrictEqual({ result: await result, counts: counts() }, { result: undefined, counts: { created: 1, deleted: 1 } });
	});

	test('model snapshot failures propagate and release the draft', async () => {
		const { targetPicker, quickInput, counts, failSnapshot } = setup();
		failSnapshot();
		const result = targetPicker.pick(folder, CancellationToken.None);
		const rejected = assert.rejects(result, /Snapshot unavailable/);
		await selectFirst(quickInput);
		await rejected;
		assert.deepStrictEqual(counts(), { created: 1, deleted: 1 });
	});
});
