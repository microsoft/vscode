/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IAction } from '../../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { AgentSessionProviders, getAgentSessionProviderDescription } from '../../../../browser/agentSessions/agentSessions.js';
import { SessionTypeAvailability } from '../../../../browser/agentSessions/sessionTypeAvailability.js';
import { createSessionTypePickerAction, ISessionTypeItem } from '../../../../browser/widget/input/sessionTargetPickerActionItem.js';

const baseAction: IAction = {
	id: 'base',
	label: 'Base',
	tooltip: '',
	class: undefined,
	enabled: true,
	run: async () => { },
};

function createCodexItem(type: AgentSessionProviders.Codex | AgentSessionProviders.AgentHostCodex): ISessionTypeItem {
	return {
		type,
		label: 'Codex',
		hoverDescription: getAgentSessionProviderDescription(type),
		commandId: `open.${type}`,
	};
}

function getMarkdownValue(value: string | IMarkdownString | HTMLElement | undefined): string | undefined {
	return typeof value === 'string' ? value : value instanceof HTMLElement ? value.textContent ?? undefined : value?.value;
}

suite('SessionTypePickerActionItem', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('creates an available Codex extension action with hover context', () => {
		const item = createCodexItem(AgentSessionProviders.Codex);
		const action = createSessionTypePickerAction(
			baseAction,
			item,
			AgentSessionProviders.Codex,
			SessionTypeAvailability.Available,
			true,
			{ label: 'Other', order: 2 },
			undefined,
			Codicon.openai,
			() => { },
		);

		assert.deepStrictEqual({
			label: action.label,
			checked: action.checked,
			enabled: action.enabled,
			description: getMarkdownValue(action.description),
			ariaDescription: action.ariaDescription,
			hover: getMarkdownValue(action.hover?.content),
		}, {
			label: 'Codex',
			checked: true,
			enabled: true,
			description: undefined,
			ariaDescription: 'Open a new Codex session using the Codex extension from OpenAI. Codex sessions can be managed from the chat sessions view.',
			hover: 'Open a new Codex session using the Codex extension from OpenAI. Codex sessions can be managed from the chat sessions view.',
		});
	});

	test('creates plain accessible text for an unavailable Codex action', () => {
		const item = createCodexItem(AgentSessionProviders.AgentHostCodex);
		const action = createSessionTypePickerAction(
			baseAction,
			item,
			AgentSessionProviders.Codex,
			SessionTypeAvailability.SignInRequired,
			true,
			{ label: 'Other', order: 2 },
			undefined,
			Codicon.openai,
			() => { },
		);

		assert.deepStrictEqual({
			label: action.label,
			checked: action.checked,
			enabled: action.enabled,
			description: getMarkdownValue(action.description),
			ariaDescription: action.ariaDescription,
			hover: getMarkdownValue(action.hover?.content),
		}, {
			label: 'Codex',
			checked: false,
			enabled: false,
			description: '[Sign in](command:workbench.action.chat.triggerSetup)',
			ariaDescription: 'Sign in. Sign in to GitHub Copilot to use this agent.',
			hover: '[Sign in to GitHub Copilot](command:workbench.action.chat.triggerSetup) to use this agent.',
		});
	});
});
