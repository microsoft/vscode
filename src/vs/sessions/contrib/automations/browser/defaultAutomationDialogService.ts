/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/defaultAutomationDialog.css';
import * as DOM from '../../../../base/browser/dom.js';
import { ButtonBar, IButton } from '../../../../base/browser/ui/button/button.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../base/common/platform.js';
import { assertReturnsDefined, isDefined } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { defaultButtonStyles, defaultDialogStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { createWorkbenchDialogOptions } from '../../../../workbench/browser/parts/dialogs/dialog.js';
import { IAutomationFormPresentation, isAutomationDialogPopupTarget, shouldPassThroughAutomationDialogCommand } from './automationDialog.js';
import { AutomationDialogService, automationDialogAllowableCommands, IAutomationDialogButtons, IAutomationDialogControls, IAutomationDialogFocusElements, IAutomationDialogShownContext, IAutomationDialogSurface, IAutomationDialogSurfaceOptions } from './automationDialogService.js';

const $ = DOM.$;

/**
 * The desktop Automations dialog: a centered modal with a title bar above the
 * form and Save and Cancel beside the notification center.
 */
export class DefaultAutomationDialogService extends AutomationDialogService {

	protected override readonly formPresentation: IAutomationFormPresentation = {};

	protected override createSurface(options: IAutomationDialogSurfaceOptions): IAutomationDialogSurface {
		const store = new DisposableStore();
		let element: HTMLElement | undefined;
		const dialog = store.add(new Dialog(
			options.container,
			options.title,
			[],
			createWorkbenchDialogOptions({
				type: 'none',
				extraClasses: ['automation-dialog'],
				disableDefaultAction: true,
				isExternalFocusAllowed: isAutomationDialogPopupTarget,
				// textLinkForeground stamps inline styles onto chat input picker chips.
				dialogStyles: { ...defaultDialogStyles, textLinkForeground: undefined },
				renderFooter: container => {
					container.classList.add('dialog-buttons', 'automation-dialog-footer-actions');
					container.parentElement?.classList.add('dialog-buttons-row', 'automation-dialog-footer-row');
					options.renderFooter(container);
				},
				renderBody: container => {
					container.classList.add('automation-dialog-body');
					element = container.closest<HTMLElement>('.monaco-dialog-box') ?? undefined;
					options.renderBody(container);
				},
			}, this.keybindingService, this.layoutService, this.hostService, automationDialogAllowableCommands,
				(commandId, event) => shouldPassThroughAutomationDialogCommand(commandId, event.target)),
		));
		const dialogElement = assertReturnsDefined(element);
		// eslint-disable-next-line eslint-js/no-restricted-syntax -- Dialog owns its close toolbar and exposes no enablement API.
		const closeToolbar = dialogElement.querySelector<HTMLElement>('.dialog-toolbar') ?? undefined;
		// Dialog stops resolving once its close button is used, so ignore that button while a save is committing.
		store.add(DOM.addDisposableListener(options.container, DOM.EventType.CLICK, (event: MouseEvent) => {
			if (options.isCommitting() && DOM.isHTMLElement(event.target) && closeToolbar?.contains(event.target)) {
				DOM.EventHelper.stop(event, true);
				event.stopImmediatePropagation();
			}
		}, true));
		void dialog.show().then(() => options.onDidDismiss());
		return {
			element: dialogElement,
			setCommitting: committing => {
				dialogElement.classList.toggle('committing', committing);
				closeToolbar?.toggleAttribute('inert', committing);
			},
			dispose: () => store.dispose(),
		};
	}

	protected override async showOneTimeAutomation(title: string, details: readonly string[]): Promise<void> {
		const dialog = new Dialog(
			this.layoutService.activeContainer,
			title,
			[localize('automation.dialog.close', "Close")],
			createWorkbenchDialogOptions({ type: 'info', detail: details.join('\n\n') }, this.keybindingService, this.layoutService, this.hostService),
		);
		try {
			await dialog.show();
		} finally {
			dialog.dispose();
		}
	}

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
