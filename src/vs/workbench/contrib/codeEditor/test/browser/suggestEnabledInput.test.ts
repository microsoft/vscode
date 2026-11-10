/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { CompletionTriggerKind } from '../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { SuggestEnabledInput } from '../../browser/suggestEnabledInput/suggestEnabledInput.js';

suite('SuggestEnabledInput', function () {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	test('provides completions only for the exact input resource', async function () {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
		const languageFeaturesService = instantiationService.invokeFunction(accessor => accessor.get(ILanguageFeaturesService));
		const modelService = instantiationService.invokeFunction(accessor => accessor.get(IModelService));
		const container = document.body.appendChild(document.createElement('div'));
		disposables.add(toDisposable(() => container.remove()));

		const input = disposables.add(instantiationService.createInstance(SuggestEnabledInput,
			'suggest-enabled-input', container, { provideResults: () => ['result'] }, 'Suggestions', 'test:searchinput', {}));
		const nestedResourceModel = disposables.add(modelService.createModel('', null, URI.parse('test:nested/searchinput'), true));
		const inputModel = input.inputWidget.getModel()!;
		const context = { triggerKind: CompletionTriggerKind.Invoke };

		const provider = languageFeaturesService.completionProvider.all(inputModel).at(-1)!;
		const inputCompletions = await provider.provideCompletionItems(inputModel, new Position(1, 1), context, CancellationToken.None);
		const nestedCompletions = await provider.provideCompletionItems(nestedResourceModel, new Position(1, 1), context, CancellationToken.None);

		assert.strictEqual(inputCompletions?.suggestions.length, 1);
		assert.strictEqual(nestedCompletions, undefined);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
