/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../../common/customizationHarnessService.js';
import { PromptDocumentSemanticTokensProvider } from '../../../../common/promptSyntax/languageProviders/promptDocumentSemanticTokensProvider.js';
import { IPromptsService } from '../../../../common/promptSyntax/service/promptsService.js';
import { PromptFileParser } from '../../../../common/promptSyntax/promptFileParser.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { getLanguageIdForPromptsType, PromptsType, Target } from '../../../../common/promptSyntax/promptTypes.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { SemanticTokens } from '../../../../../../../editor/common/languages.js';

suite('PromptDocumentSemanticTokensProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('fires when the active harness target can change', () => {
		const localHarness: IHarnessDescriptor = {
			id: 'local',
			label: 'Local',
			icon: ThemeIcon.fromId('local'),
		};
		const copilotHarness: IHarnessDescriptor = {
			id: 'copilot',
			label: 'Copilot',
			icon: ThemeIcon.fromId('copilot'),
		};
		const activeHarness = observableValue('activeHarness', localHarness.id);
		const availableHarnesses = observableValue<readonly IHarnessDescriptor[]>('availableHarnesses', [localHarness]);
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeSessionResource = observableValue('activeSessionResource', URI.parse('local:/session'));
			override readonly activeHarness = activeHarness;
			override readonly availableHarnesses = availableHarnesses;
			override getActiveDescriptor(): IHarnessDescriptor {
				return this.availableHarnesses.get().find(harness => harness.id === this.activeHarness.get()) ?? localHarness;
			}
		}();
		const provider = new PromptDocumentSemanticTokensProvider(
			new class extends mock<IPromptsService>() { }(),
			harnessService,
		);
		let changeCount = 0;
		disposables.add(provider.onDidChange(() => changeCount++));

		availableHarnesses.set([localHarness, copilotHarness], undefined);
		activeHarness.set(copilotHarness.id, undefined);

		assert.strictEqual(changeCount, 2);
	});

	test('provides semantic tokens for github-copilot placeholders', () => {
		const parser = new PromptFileParser();
		const promptsService = new class extends mock<IPromptsService>() {
			override getParsedPromptFile(model: ITextModel) {
				return parser.parse(model.uri, model.getValue());
			}
		}();
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeHarness = observableValue('activeHarness', 'copilot');
			override readonly availableHarnesses = observableValue<readonly IHarnessDescriptor[]>('availableHarnesses', []);
			override getActiveDescriptor(): IHarnessDescriptor {
				return {
					id: 'copilot',
					label: 'Copilot',
					icon: ThemeIcon.fromId('copilot'),
					customAgentTarget: Target.GitHubCopilot,
				};
			}
		}();
		const provider = new PromptDocumentSemanticTokensProvider(promptsService, harnessService);
		const model = disposables.add(createTextModel([
			'---',
			'description: Test',
			'---',
			'',
			'Use {{cwd}}.',
		].join('\n'), getLanguageIdForPromptsType(PromptsType.agent)));

		const result = provider.provideDocumentSemanticTokens(model, null, CancellationToken.None) as SemanticTokens | undefined;

		assert.deepStrictEqual(result ? Array.from(result.data) : undefined, [4, 4, 7, 0, 0]);
	});
});
