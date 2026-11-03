/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { WorkbenchContributionsRegistry } from '../../../../../../workbench/common/contributions.js';
import { IWorkbenchLayoutService } from '../../../../../../workbench/services/layout/browser/layoutService.js';
import { LifecyclePhase } from '../../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { Menus } from '../../../../../browser/menus.js';
import { ModelPickerToolbarsContribution } from '../../../../chat/browser/modelPicker.js';
import { COMPOSER_SESSION_CONTROLS_ACTION_ID, SharedChatInputComposerContribution } from '../../../../chat/browser/sharedChatInputComposer.contribution.js';
import '../../browser/copilotChatSessionsActions.js';

suite('Copilot chat composer picker registration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers cloud composer picker factories before restoring the UI', () => {
		const factories = new Map<string, IActionViewItemFactory>();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IActionViewItemService, {
			register: (menu, command, factory) => {
				const key = `${menu.id}/${typeof command === 'string' ? command : command.id}`;
				factories.set(key, factory);
				return toDisposable(() => factories.delete(key));
			},
		});
		instantiationService.stub(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() { }());

		const contributionIds = new Set([
			SharedChatInputComposerContribution.ID,
			ModelPickerToolbarsContribution.ID,
			'workbench.contrib.copilotPickerActionViewItems',
		]);

		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Inspect production phases without starting unrelated contributions.
		for (const [phase, contributions] of WorkbenchContributionsRegistry.INSTANCE['contributionsByPhase']) {
			if (phase > LifecyclePhase.Ready) {
				continue;
			}
			for (const contribution of contributions) {
				if (contribution.id && contributionIds.has(contribution.id)) {
					const instance = instantiationService.createInstance(contribution.ctor);
					if (isDisposable(instance)) {
						store.add(instance);
					}
				}
			}
		}

		assert.deepStrictEqual([...factories.keys()].sort(), [
			`${Menus.NewSessionChatInputToolbar.id}/sessions.newChatComposer.initializing`,
			`${Menus.NewSessionChatInputToolbar.id}/sessions.newChatComposer.sending`,
			`${Menus.NewSessionChatInputToolbar.id}/${COMPOSER_SESSION_CONTROLS_ACTION_ID}`,
			`${Menus.NewSessionChatInputToolbar.id}/sessions.modelPicker`,
			`${Menus.AutomationsDialogInputToolbar.id}/sessions.modelPicker`,
			`${Menus.NewSessionControl.id}/sessions.sandbox.modePicker`,
			`${Menus.NewSessionControl.id}/sessions.sandbox.approvalPicker`,
		].sort());
	});
});
