/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { createSessionModelCommands, NewChatModelPickerService } from '../../browser/newChatModelPicker.js';
import { ISessionModelSelection } from '../../browser/sessionModelSelection.js';

suite('NewChatModelPickerService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens only a picker registered for that input scope', () => {
		const firstInputPickers = new NewChatModelPickerService();
		const secondInputPickers = new NewChatModelPickerService();
		const opened: string[] = [];

		disposables.add(firstInputPickers.registerModelPicker({ getDomNode: () => undefined, open: () => opened.push('first'), switchToModel: () => false }));
		disposables.add(secondInputPickers.registerModelPicker({ getDomNode: () => undefined, open: () => opened.push('second'), switchToModel: () => false }));

		firstInputPickers.openModelPicker();

		assert.deepStrictEqual(opened, ['first']);
	});

	test('uses one active picker for opening and switching models', () => {
		const modelPickers = new NewChatModelPickerService();
		const events: string[] = [];

		disposables.add(modelPickers.registerModelPicker({
			getDomNode: () => undefined,
			open: () => events.push('desktop-open'),
			switchToModel: modelIdentifier => {
				events.push(`switch:${modelIdentifier}`);
				return true;
			},
		}));
		disposables.add(modelPickers.registerModelPicker({
			getDomNode: () => undefined,
			open: () => events.push('phone-open'),
			switchToModel: modelIdentifier => {
				events.push(`phone-switch:${modelIdentifier}`);
				return true;
			},
		}));

		const switched = modelPickers.switchToModel('vendor/model');
		modelPickers.openModelPicker();

		assert.deepStrictEqual({ switched, events }, {
			switched: true,
			events: ['phone-switch:vendor/model', 'phone-open'],
		});
	});

	test('exposes the active control and falls back when its registration is disposed', () => {
		const modelPickers = new NewChatModelPickerService();
		const firstNode = document.createElement('button');
		const secondNode = document.createElement('button');
		const first = disposables.add(modelPickers.registerModelPicker({
			getDomNode: () => firstNode,
			open: () => { },
			switchToModel: () => false,
		}));
		const second = disposables.add(modelPickers.registerModelPicker({
			getDomNode: () => secondNode,
			open: () => { },
			switchToModel: () => false,
		}));
		const newest = modelPickers.activePicker?.getDomNode() === secondNode;
		second.dispose();
		const fallback = modelPickers.activePicker?.getDomNode() === firstNode;
		first.dispose();

		assert.deepStrictEqual({ newest, fallback, active: modelPickers.activePicker }, { newest: true, fallback: true, active: undefined });
	});

});

suite('createSessionModelCommands', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('cycles and switches only among visible, user-selectable models', () => {
		const createModel = (id: string, name: string, isUserSelectable = true) => ({ identifier: `copilot/${id}`, metadata: { vendor: 'copilot', id, family: id, name, isUserSelectable } });
		const models = [createModel('a', 'Alpha'), createModel('hidden', 'Beta'), createModel('b', 'Bravo'), createModel('internal', 'Delta', false)];
		let currentModel = models[0];
		const selection = upcastPartial<ISessionModelSelection>({
			state: { get: () => ({ models, currentModel }) } as unknown as ISessionModelSelection['state'],
			selectModel: identifier => {
				currentModel = models.find(model => model.identifier === identifier)!;
				return true;
			},
		});
		const languageModelsService = upcastPartial<ILanguageModelsService>({ isModelHidden: identifier => identifier === 'copilot/hidden' });
		const commands = createSessionModelCommands(selection, languageModelsService);
		const selected: string[] = [];
		const run = (action: () => void) => {
			action();
			selected.push(currentModel.metadata.name);
		};

		run(() => commands.switchToNextModel());
		run(() => commands.switchToNextModel());
		run(() => commands.switchModel({ vendor: 'copilot', id: 'internal', family: 'internal' }));

		assert.deepStrictEqual(selected, ['Bravo', 'Alpha', 'Alpha']);
	});
});
