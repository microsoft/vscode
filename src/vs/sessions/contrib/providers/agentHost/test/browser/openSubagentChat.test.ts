/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Action } from '../../../../../../base/common/actions.js';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILanguageModelsService } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { OpenSubagentChatActionViewItem, shouldShowSubagentModel } from '../../browser/openSubagentChat.js';

class TestOpenSubagentChatActionViewItem extends OpenSubagentChatActionViewItem {
	get tooltip(): string | undefined {
		return this.getTooltip();
	}
}

suite('OpenSubagentChatActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows the subagent model unless it matches the parent model', () => {
		assert.deepStrictEqual([
			shouldShowSubagentModel(undefined, 'agent-host-copilotcli:gpt-5.6-sol', 'GPT-5.6 Sol', 'gpt-5.6-sol'),
			shouldShowSubagentModel('GPT-5.6 Sol', undefined, undefined, undefined),
			shouldShowSubagentModel('gpt-5.6-sol', 'agent-host-copilotcli:gpt-5.6-sol', 'GPT-5.6 Sol', 'gpt-5.6-sol'),
			shouldShowSubagentModel('GPT-5.6 Sol', 'agent-host-copilotcli:gpt-5.6-sol', 'GPT-5.6 Sol', 'gpt-5.6-sol'),
			shouldShowSubagentModel('Claude Opus 4.8', 'agent-host-copilotcli:gpt-5.6-sol', 'GPT-5.6 Sol', 'gpt-5.6-sol'),
		], [
			false,
			true,
			false,
			false,
			true,
		]);
	});

	test('disables and hides the action until its peer chat resolves', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ISessionsService, {
			activeSession: observableValue<IActiveSession | undefined>('activeSession', undefined),
			visibleSessions: observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', []),
		});
		instantiationService.stub(ILanguageModelsService, {
			onDidChangeLanguageModels: Event.None,
			lookupLanguageModel: () => undefined,
		});
		const action = store.add(new Action('openSubagent', 'Open Subagent'));
		const viewItem = store.add(instantiationService.createInstance(
			OpenSubagentChatActionViewItem,
			{ chatResource: 'ahp-chat://subagent/session/tool-call' },
			action,
			{},
		));
		const container = document.createElement('div');

		viewItem.render(container);

		assert.deepStrictEqual({
			enabled: viewItem.action.enabled,
			sourceActionEnabled: action.enabled,
			hidden: container.classList.contains('hidden'),
			ariaHidden: container.getAttribute('aria-hidden'),
			modelHidden: container.querySelector('.chat-subagent-pill-model')?.classList.contains('hidden'),
		}, {
			enabled: false,
			sourceActionEnabled: false,
			hidden: true,
			ariaHidden: 'true',
			modelHidden: true,
		});
	});

	test('refreshes accessible metadata when the active tool clears', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ISessionsService, {
			activeSession: observableValue<IActiveSession | undefined>('activeSession', undefined),
			visibleSessions: observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', []),
		});
		instantiationService.stub(ILanguageModelsService, {
			onDidChangeLanguageModels: Event.None,
			lookupLanguageModel: () => undefined,
		});
		const action = store.add(new Action('openSubagent', 'Open Subagent'));
		const viewItem = store.add(instantiationService.createInstance(
			TestOpenSubagentChatActionViewItem,
			{ chatResource: 'ahp-chat://subagent/session/tool-call', activeToolLabel: 'Reading files' },
			action,
			{},
		));
		const container = document.createElement('div');
		viewItem.render(container);

		const withActiveTool = {
			tooltip: viewItem.tooltip,
			ariaLabel: container.getAttribute('aria-label'),
		};
		viewItem.setActionContext({ chatResource: 'ahp-chat://subagent/session/tool-call' });

		assert.deepStrictEqual({
			withActiveTool,
			withoutActiveTool: {
				tooltip: viewItem.tooltip,
				ariaLabel: container.getAttribute('aria-label'),
			},
		}, {
			withActiveTool: {
				tooltip: 'Open Subagent\nActive tool: Reading files',
				ariaLabel: 'Open Subagent. Active tool Reading files',
			},
			withoutActiveTool: {
				tooltip: 'Open Subagent',
				ariaLabel: 'Open Subagent',
			},
		});
	});
});
