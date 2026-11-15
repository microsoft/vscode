/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { FocusedViewContext, IsSessionsWindowContext } from '../../../../../common/contextkeys.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { SessionsViewAccessibilityHelp } from '../../../browser/agentsView/sessionsViewAccessibilityHelp.js';
import { SessionsListNotificationFocused } from '../../../browser/views/sessionsListNotification.js';
import { SessionsView, SessionsViewId } from '../../../browser/views/sessionsView.js';

suite('SessionsViewAccessibilityHelp', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('helps in the Sessions view of an editor window, not on its Undo notice nor in the Agents window, with the commands it has there, and returns focus to the view as it closes', () => {
		const focused: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
			getViewWithId: <T>(id: string) => upcastPartial<SessionsView>({ focus: () => { focused.push(id); } }) as unknown as T,
		}));
		const help = new SessionsViewAccessibilityHelp();
		const provider = disposables.add(instantiationService.invokeFunction(accessor => help.getProvider(accessor)));
		const commands = [...provider.provideContent().matchAll(/<keybinding:(?<id>[^>]+)>/g)].map(match => match.groups?.id);
		provider.onClose();

		const shows = (view: string, sessionsWindow: boolean, noticeFocused: boolean) => help.when?.evaluate({
			getValue: <T>(key: string) => ({ [FocusedViewContext.key]: view, [IsSessionsWindowContext.key]: sessionsWindow, [SessionsListNotificationFocused.key]: noticeFocused } as Record<string, unknown>)[key] as T,
		});
		assert.deepStrictEqual({
			inSessionsView: shows(SessionsViewId, false, false),
			onUndoNotice: shows(SessionsViewId, false, true),
			inAgentsWindow: shows(SessionsViewId, true, false),
			inOtherView: shows('workbench.explorer.fileView', false, false),
			verbosity: provider.verbositySettingKey,
			commands,
			focused,
		}, {
			inSessionsView: true,
			onUndoNotice: false,
			inAgentsWindow: false,
			inOtherView: false,
			verbosity: AccessibilityVerbositySettingId.SessionsView,
			commands: [
				'workbench.action.agentsView.focusChatPart',
				'workbench.action.agentsView.newSession',
				'sessionsViewPane.find',
				'sessionsViewPane.renameSession',
				'_sessionsList.markRead',
				'_sessionsList.markUnread',
				'editor.action.accessibilityHelp',
			],
			focused: [SessionsViewId],
		});
	});
});
