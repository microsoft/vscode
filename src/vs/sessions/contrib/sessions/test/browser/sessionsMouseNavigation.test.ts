/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MOUSE_BACK_FORWARD_NAVIGATION_SETTING } from '../../../../../workbench/services/history/common/history.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { TestLayoutService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionsMouseNavigationContribution } from '../../browser/sessionsMouseNavigation.js';

class TestSessionsLayoutService extends TestLayoutService {

	override readonly mainContainer = mainWindow.document.createElement('div');
	private editorFocused = false;

	override hasFocus(part: Parts): boolean {
		return part === Parts.EDITOR_PART && this.editorFocused;
	}

	setEditorFocused(editorFocused: boolean): void {
		this.editorFocused = editorFocused;
	}
}

suite('SessionsMouseNavigationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(enabled = true): {
		readonly store: DisposableStore;
		readonly layoutService: TestSessionsLayoutService;
		readonly configurationService: TestConfigurationService;
		readonly navigation: string[];
		readonly target: HTMLElement;
	} {
		const store = disposables.add(new DisposableStore());
		const layoutService = new TestSessionsLayoutService();
		const configurationService = new TestConfigurationService({
			[MOUSE_BACK_FORWARD_NAVIGATION_SETTING]: enabled,
		});
		const navigation: string[] = [];
		const sessionsService = upcastPartial<ISessionsService>({
			openPreviousSession: async () => {
				navigation.push('back');
			},
			openNextSession: async () => {
				navigation.push('forward');
			},
		});

		const target = mainWindow.document.createElement('div');
		layoutService.mainContainer.appendChild(target);
		store.add(toDisposable(() => layoutService.mainContainer.remove()));
		store.add(new SessionsMouseNavigationContribution(configurationService, layoutService, sessionsService));

		return { store, layoutService, configurationService, navigation, target };
	}

	test('routes mouse back and forward to session history and suppresses browser history', () => {
		const { store, layoutService, navigation, target } = createContribution();
		const bubbledEvents: string[] = [];
		store.add(addDisposableListener(layoutService.mainContainer, EventType.MOUSE_DOWN, event => bubbledEvents.push(`${event.type}:${event.button}`)));
		store.add(addDisposableListener(layoutService.mainContainer, EventType.MOUSE_UP, event => bubbledEvents.push(`${event.type}:${event.button}`)));

		const backDown = new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, cancelable: true, button: 3 });
		const backUp = new MouseEvent(EventType.MOUSE_UP, { bubbles: true, cancelable: true, button: 3 });
		const forwardDown = new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, cancelable: true, button: 4 });
		const forwardUp = new MouseEvent(EventType.MOUSE_UP, { bubbles: true, cancelable: true, button: 4 });
		target.dispatchEvent(backDown);
		target.dispatchEvent(backUp);
		target.dispatchEvent(forwardDown);
		target.dispatchEvent(forwardUp);

		assert.deepStrictEqual({
			navigation,
			bubbledEvents,
			defaultPrevented: [backDown, backUp, forwardDown, forwardUp].map(event => event.defaultPrevented),
		}, {
			navigation: ['back', 'forward'],
			bubbledEvents: [],
			defaultPrevented: [true, true, true, true],
		});
	});

	test('leaves mouse navigation to editor history while the editor has focus', () => {
		const { store, layoutService, navigation, target } = createContribution();
		layoutService.setEditorFocused(true);
		const bubbledEvents: string[] = [];
		store.add(addDisposableListener(layoutService.mainContainer, EventType.MOUSE_DOWN, event => bubbledEvents.push(`${event.type}:${event.button}`)));
		const event = new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, cancelable: true, button: 3 });

		target.dispatchEvent(event);

		assert.deepStrictEqual({
			navigation,
			bubbledEvents,
			defaultPrevented: event.defaultPrevented,
		}, {
			navigation: [],
			bubbledEvents: ['mousedown:3'],
			defaultPrevented: false,
		});
	});

	test('respects mouse back and forward navigation configuration changes', async () => {
		const { configurationService, navigation, target } = createContribution(false);
		const disabledEvent = new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, cancelable: true, button: 3 });
		target.dispatchEvent(disabledEvent);

		await configurationService.setUserConfiguration(MOUSE_BACK_FORWARD_NAVIGATION_SETTING, true);
		const enabledEvent = new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, cancelable: true, button: 4 });
		target.dispatchEvent(enabledEvent);

		assert.deepStrictEqual({
			navigation,
			defaultPrevented: [disabledEvent.defaultPrevented, enabledEvent.defaultPrevented],
		}, {
			navigation: ['forward'],
			defaultPrevented: [false, true],
		});
	});
});
