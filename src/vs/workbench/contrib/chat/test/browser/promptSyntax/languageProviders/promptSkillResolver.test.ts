/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { AICustomizationSources } from '../../../../common/aiCustomizationWorkspaceService.js';
import { createVSCodeHarnessDescriptor, ICustomizationHarnessService, type IHarnessDescriptor } from '../../../../common/customizationHarnessService.js';
import { resolveAgentFileSkills } from '../../../../common/promptSyntax/languageProviders/promptSkillResolver.js';
import { PromptsType, Target } from '../../../../common/promptSyntax/promptTypes.js';

suite('PromptSkillResolver', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('treats harnesses without an item provider as resolved empty inventories', async () => {
		const localDescriptor = createVSCodeHarnessDescriptor();
		const skillDescriptor = {
			...localDescriptor,
			id: 'copilot-with-skills',
			customAgentTarget: Target.GitHubCopilot,
			itemProvider: {
				onDidChange: Event.None,
				provideChatSessionCustomizations: async () => [{
					uri: URI.parse('test:/skills/review/SKILL.md'),
					type: PromptsType.skill,
					name: 'review',
					source: AICustomizationSources.local,
					extensionId: undefined,
					pluginUri: undefined,
					enabled: true,
				}],
			},
		};
		const providerlessDescriptor = {
			...localDescriptor,
			id: 'copilot-without-provider',
			customAgentTarget: Target.GitHubCopilot,
			itemProvider: undefined,
		};
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly availableHarnesses = constObservable<readonly IHarnessDescriptor[]>([localDescriptor, skillDescriptor, providerlessDescriptor]);
			override getActiveDescriptor() { return localDescriptor; }
			override getSessionResourceForHarness(harnessId: string) { return URI.parse(`test:/${harnessId}`); }
		}();

		const catalogue = await resolveAgentFileSkills(Target.GitHubCopilot, harnessService, new NullLogService(), CancellationToken.None);

		assert.deepStrictEqual({
			isResolved: catalogue.isResolved,
			skills: catalogue.skills.map(skill => skill.name),
		}, {
			isResolved: true,
			skills: ['review'],
		});
	});
});
