/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { SESSION_COMPARISON_MAX_MODELS, SessionMultiModelSelection } from '../../browser/sessionMultiModelSelection.js';

suite('SessionMultiModelSelection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function model(id: string): ILanguageModelChatMetadataAndIdentifier {
		return { identifier: `copilot/${id}`, metadata: upcastPartial<ILanguageModelChatMetadata>({ id, name: id }) };
	}

	test('compares only while offered, switched on, and with two or more models', () => {
		const available = observableValue('available', true);
		const selection = store.add(new SessionMultiModelSelection(available));
		const snapshot = () => ({ enabled: selection.enabled.get(), comparing: selection.isComparing.get(), models: selection.selectedModelIds.get() });

		const off = snapshot();
		selection.setEnabled(true);
		selection.toggleModel(model('a'));
		const one = snapshot();
		selection.toggleModel(model('b'));
		const two = snapshot();
		available.set(false, undefined);
		const unavailable = snapshot();
		available.set(true, undefined);
		selection.toggleModel(model('a'));
		const toggledOff = snapshot();
		selection.setEnabled(false);
		const reset = snapshot();

		assert.deepStrictEqual({ off, one, two, unavailable, toggledOff, reset }, {
			off: { enabled: false, comparing: false, models: [] },
			one: { enabled: true, comparing: false, models: ['copilot/a'] },
			two: { enabled: true, comparing: true, models: ['copilot/a', 'copilot/b'] },
			unavailable: { enabled: false, comparing: false, models: ['copilot/a', 'copilot/b'] },
			toggledOff: { enabled: true, comparing: false, models: ['copilot/b'] },
			reset: { enabled: false, comparing: false, models: [] },
		});
	});

	test('caps the selection and drops models the pool no longer offers', () => {
		const selection = store.add(new SessionMultiModelSelection(observableValue('available', true)));
		selection.setEnabled(true);
		const models = ['a', 'b', 'c', 'd', 'e'].map(model);
		for (const candidate of models) {
			selection.toggleModel(candidate);
		}
		const capped = selection.selectedModelIds.get();
		selection.retainModels([models[1], models[3]]);

		assert.deepStrictEqual({ max: SESSION_COMPARISON_MAX_MODELS, capped, retained: selection.selectedModelIds.get() }, {
			max: 4,
			capped: ['copilot/a', 'copilot/b', 'copilot/c', 'copilot/d'],
			retained: ['copilot/b', 'copilot/d'],
		});
	});
});
