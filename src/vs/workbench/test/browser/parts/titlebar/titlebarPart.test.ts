/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { BrowserTitlebarPart } from '../../../../browser/parts/titlebar/titlebarPart.js';
import { WindowTitle } from '../../../../browser/parts/titlebar/windowTitle.js';
import { MODERN_UI_INACTIVE_SHELL_BACKGROUND, MODERN_UI_SHELL_BACKGROUND, TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_INACTIVE_BACKGROUND } from '../../../../common/theme.js';
import { IEditorGroupsContainer } from '../../../../services/editor/common/editorGroupsService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { TestContextMenuService, TestHostService, TestLayoutService, workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('TitlebarPart colors', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class TestTitlebarPart extends BrowserTitlebarPart {
		protected override createContentArea(parent: HTMLElement): HTMLElement {
			this.element = parent;
			return parent;
		}
	}

	test('resolves shell and title colors from the target window focus', () => {
		let focused = false;
		const targetWindow = new class extends mock<CodeWindow>() {
			override vscodeWindowId = mainWindow.vscodeWindowId;
			override document = new class extends mock<Document>() {
				override hasFocus(): boolean { return focused; }
			}();
		}();
		const activeWindowEmitter = store.add(new Emitter<number>());
		const hostService = new class extends TestHostService {
			override readonly onDidChangeActiveWindow = activeWindowEmitter.event;
		}();
		const themeService = new TestThemeService(new TestColorTheme({
			[TITLE_BAR_ACTIVE_BACKGROUND]: '#112233',
			[TITLE_BAR_INACTIVE_BACKGROUND]: '#223344',
			[MODERN_UI_SHELL_BACKGROUND]: '#334455',
			[MODERN_UI_INACTIVE_SHELL_BACKGROUND]: '#445566',
		}));
		const root = document.createElement('div');
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IHostService, hostService);
		instantiationService.stub(IThemeService, themeService);
		instantiationService.stub(IContextMenuService, new TestContextMenuService());
		instantiationService.stub(IWorkbenchLayoutService, new class extends TestLayoutService {
			override getContainer(): HTMLElement { return root; }
		}());
		instantiationService.stubInstance(WindowTitle, { dispose() { } });
		const groups = new class extends mock<IEditorGroupsContainer>() {
			override onDidChangeEditorPartOptions = Event.None;
		}();
		const part = store.add(instantiationService.createInstance(TestTitlebarPart, Parts.TITLEBAR_PART, targetWindow, groups));
		const container = document.createElement('div');
		part.create(container);
		const colors = () => ({
			title: container.style.backgroundColor,
			shell: root.style.getPropertyValue('--modern-ui-shell-background'),
		});
		const initiallyInactive = colors();
		focused = true;
		activeWindowEmitter.fire(targetWindow.vscodeWindowId);
		const active = colors();
		focused = false;
		activeWindowEmitter.fire(targetWindow.vscodeWindowId + 1);
		hostService.setFocus(false);
		hostService.setFocus(true);
		const anotherWindowActive = colors();

		themeService.setTheme(new TestColorTheme({
			[TITLE_BAR_ACTIVE_BACKGROUND]: '#112233',
			[MODERN_UI_SHELL_BACKGROUND]: '#334455',
		}));
		const missingInactiveColors = colors();

		assert.deepStrictEqual({ initiallyInactive, active, anotherWindowActive, missingInactiveColors }, {
			initiallyInactive: { title: 'rgb(34, 51, 68)', shell: '#445566' },
			active: { title: 'rgb(17, 34, 51)', shell: '#334455' },
			anotherWindowActive: { title: 'rgb(34, 51, 68)', shell: '#445566' },
			missingInactiveColors: { title: 'rgb(17, 34, 51)', shell: '#334455' },
		});
	});
});
