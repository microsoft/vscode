/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { showWindowLogActionId } from '../../../services/log/common/logConstants.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { $, append, getDomNodePagePosition, getWindows, onDidRegisterWindow } from '../../../../base/browser/dom.js';
import { createCSSRule, createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { Emitter } from '../../../../base/common/event.js';
import { DomEmitter } from '../../../../base/browser/event.js';

class ToggleKeybindingsLogAction extends Action2 {
	static disposable: IDisposable | undefined;

	constructor() {
		super({
			id: 'workbench.action.toggleKeybindingsLog',
			title: nls.localize2('toggleKeybindingsLog', "Toggle Keyboard Shortcuts Troubleshooting"),
			category: Categories.Developer,
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		const logging = accessor.get(IKeybindingService).toggleLogging();
		if (logging) {
			const commandService = accessor.get(ICommandService);
			commandService.executeCommand(showWindowLogActionId);
		}

		if (ToggleKeybindingsLogAction.disposable) {
			ToggleKeybindingsLogAction.disposable.dispose();
			ToggleKeybindingsLogAction.disposable = undefined;
			return;
		}

		const layoutService = accessor.get(ILayoutService);
		const disposables = new DisposableStore();

		const container = layoutService.activeContainer;
		const focusMarker = append(container, $('.focus-troubleshooting-marker'));
		disposables.add(toDisposable(() => focusMarker.remove()));

		// Add CSS rule for focus marker
		const stylesheet = createStyleSheet(undefined, undefined, disposables);
		createCSSRule('.focus-troubleshooting-marker', `
			position: fixed;
			pointer-events: none;
			z-index: 100000;
			background-color: rgba(255, 0, 0, 0.2);
			border: 2px solid rgba(255, 0, 0, 0.8);
			border-radius: 2px;
			display: none;
		`, stylesheet);

		const onKeyDown = disposables.add(new Emitter<KeyboardEvent>());

		function registerWindowListeners(window: Window, disposables: DisposableStore): void {
			disposables.add(disposables.add(new DomEmitter(window, 'keydown', true)).event(e => onKeyDown.fire(e)));
		}

		for (const { window, disposables } of getWindows()) {
			registerWindowListeners(window, disposables);
		}

		disposables.add(onDidRegisterWindow(({ window, disposables }) => registerWindowListeners(window, disposables)));

		disposables.add(layoutService.onDidChangeActiveContainer(() => {
			layoutService.activeContainer.appendChild(focusMarker);
		}));

		disposables.add(onKeyDown.event(e => {
			const target = e.target as HTMLElement;
			if (target) {
				const position = getDomNodePagePosition(target);
				focusMarker.style.top = `${position.top}px`;
				focusMarker.style.left = `${position.left}px`;
				focusMarker.style.width = `${position.width}px`;
				focusMarker.style.height = `${position.height}px`;
				focusMarker.style.display = 'block';

				// Hide after timeout
				setTimeout(() => {
					focusMarker.style.display = 'none';
				}, 800);
			}
		}));

		ToggleKeybindingsLogAction.disposable = disposables;
	}
}

registerAction2(ToggleKeybindingsLogAction);
