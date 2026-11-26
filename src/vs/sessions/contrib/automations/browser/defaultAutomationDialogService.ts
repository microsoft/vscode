/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { ButtonBar, IButton } from '../../../../base/browser/ui/button/button.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../base/common/platform.js';
import { isDefined } from '../../../../base/common/types.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IAutomationFormPresentation } from './automationDialog.js';
import { AutomationDialogService, IAutomationDialogButtons, IAutomationDialogControls, IAutomationDialogFocusElements, IAutomationDialogShownContext } from './automationDialogService.js';

const $ = DOM.$;

/**
 * The desktop Automations dialog: a centered modal with a title bar above the
 * form and Save and Cancel beside the notification center.
 */
export class DefaultAutomationDialogService extends AutomationDialogService {

	protected override readonly dialogOptions = {};
	protected override readonly formPresentation: IAutomationFormPresentation = {};

	protected override renderFooterActions(container: HTMLElement, controls: IAutomationDialogControls, store: DisposableStore): IAutomationDialogButtons {
		const buttonBar = store.add(new ButtonBar(container));
		const createSaveButton = (): IButton => {
			const button = buttonBar.addButton(defaultButtonStyles);
			button.label = controls.saveLabel;
			store.add(button.onDidClick(() => controls.save()));
			return button;
		};
		const createCancelButton = (): IButton => {
			const button = buttonBar.addButton({ ...defaultButtonStyles, secondary: true });
			button.label = controls.cancelLabel;
			store.add(button.onDidClick(() => controls.cancel()));
			return button;
		};
		if (isWindows) {
			const save = createSaveButton();
			return { save, cancel: createCancelButton() };
		}
		const cancel = createCancelButton();
		return { save: createSaveButton(), cancel };
	}

	protected override renderHeader(container: HTMLElement, controls: IAutomationDialogControls): undefined {
		DOM.append(container, $('.automation-titlebar', { 'aria-hidden': 'true' }, controls.title));
		return undefined;
	}

	protected override getFocusOrder(elements: IAutomationDialogFocusElements): HTMLElement[] {
		return [...elements.fields, elements.notificationAction, elements.save, elements.cancel].filter(isDefined);
	}

	protected override didShowDialog(context: IAutomationDialogShownContext): void {
		context.focusFirst();
	}
}
