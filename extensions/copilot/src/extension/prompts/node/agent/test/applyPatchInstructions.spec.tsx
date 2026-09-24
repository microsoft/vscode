/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, UserMessage } from '@vscode/prompt-tsx';
import { afterEach, beforeEach, expect, suite, test } from 'vitest';
import { ConfigKey, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { MockEndpoint } from '../../../../../platform/endpoint/test/node/mockEndpoint';
import { messageToMarkdown } from '../../../../../platform/log/common/messageStringify';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { renderPromptElement } from '../../base/promptRenderer';
import { ApplyPatchInstructions, DefaultAgentPromptProps, detectToolCapabilities } from '../defaultAgentInstructions';

class PatchPrompt extends PromptElement<DefaultAgentPromptProps> {
	render() {
		return <UserMessage>
			<ApplyPatchInstructions {...this.props} tools={detectToolCapabilities(this.props.availableTools)} />
		</UserMessage>;
	}
}

suite('ApplyPatchInstructions model gates', () => {
	let accessor: ITestingServicesAccessor;

	beforeEach(() => {
		accessor = createExtensionUnitTestingServices().createTestingAccessor();
	});

	afterEach(() => accessor.dispose());

	test.each([
		['gpt-5.6', true],
		['gpt-6', true],
		['gpt-6-preview', true],
		['gpt-6.1', true],
		['testing-for-latest-prompt', false],
		['gpt-4.1', false],
		[undefined, false],
	] as const)('preserves patch instructions and experiment gating for %s', async (family, supported) => {
		const instantiationService = accessor.get(IInstantiationService);
		const endpoint = instantiationService.createInstance(MockEndpoint, family);
		const actual = [];
		for (const enabled of [true, false]) {
			await accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.Gpt5AlternativePatch, enabled);
			const { messages } = await renderPromptElement(instantiationService, endpoint, PatchPrompt, {
				modelFamily: family,
				availableTools: [],
				codesearchMode: false,
			});
			const text = messages.map(message => messageToMarkdown(message)).join('\n');
			actual.push({
				minimalEdits: text.includes('Prefer the smallest set of changes needed to satisfy the task.'),
				patchFormat: text.includes('The tool call requires both `input`'),
			});
		}
		expect(actual).toEqual([
			{ minimalEdits: supported, patchFormat: !supported },
			{ minimalEdits: supported, patchFormat: true },
		]);
	});
});
