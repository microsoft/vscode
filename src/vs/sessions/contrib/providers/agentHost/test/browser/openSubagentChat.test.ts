/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Action } from '../../../../../../base/common/actions.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { OpenSubagentChatActionViewItem } from '../../browser/openSubagentChat.js';

suite('OpenSubagentChatActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('disables and hides the action until its peer chat resolves', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ISessionsService, {
			activeSession: observableValue<IActiveSession | undefined>('activeSession', undefined),
			visibleSessions: observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', []),
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
		}, {
			enabled: false,
			sourceActionEnabled: true,
			hidden: true,
			ariaHidden: 'true',
		});
	});
});
