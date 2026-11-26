/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobileAutomations.css';
import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ButtonBar, unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { SelectBoxNative } from '../../../../base/browser/ui/selectBox/selectBoxNative.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isDefined } from '../../../../base/common/types.js';
import { ResultKind } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { showMobileContentSheet } from '../../../../workbench/contrib/sessions/browser/mobile/mobilePickerSheet.js';
import { trackMobileSheetNavigation } from '../../../../workbench/contrib/sessions/browser/mobile/mobileSheetNavigation.js';
import { IAutomationFormPresentation, isAutomationDialogPopupTarget, shouldPassThroughAutomationDialogCommand } from '../../automations/browser/automationDialog.js';
import { AutomationDialogService, automationDialogAllowableCommands, IAutomationDialogButtons, IAutomationDialogControls, IAutomationDialogFocusElements, IAutomationDialogShownContext, IAutomationDialogSurface, IAutomationDialogSurfaceOptions } from '../../automations/browser/automationDialogService.js';

const $ = DOM.$;

/**
 * The phone Automations form: a full-screen sheet with Cancel and Save in its
 * header, native pickers, and browser Back dismissing it like other sheets.
 */
export class MobileAutomationDialogService extends AutomationDialogService {

	protected override readonly formPresentation: IAutomationFormPresentation = {
		createScheduleSelect: (options, selected, ariaLabel) => new SelectBoxNative(options, selected, defaultSelectBoxStyles, { ariaLabel, nativeActivation: true }),
		showPromptLabel: true,
	};

	protected override createSurface(options: IAutomationDialogSurfaceOptions): IAutomationDialogSurface {
		const store = new DisposableStore();
		const previousFocus = DOM.getActiveElement();
		const element = DOM.append(options.container, $('.automation-dialog.automation-phone-form', {
			role: 'dialog',
			'aria-modal': 'true',
			'aria-label': options.title,
			tabindex: '-1',
		}));
		store.add(toDisposable(() => {
			element.remove();
			if (DOM.isHTMLElement(previousFocus) && previousFocus.isConnected) {
				previousFocus.focus();
			}
		}));
		const body = DOM.append(element, $('.automation-dialog-body'));
		const footerActions = DOM.append(DOM.append(element, $('.automation-dialog-footer-row')), $('.automation-dialog-footer-actions'));
		options.renderFooter(footerActions);
		options.renderBody(body);

		// Registered after the form's own keyboard handling so popups close before the page reacts.
		// Like the desktop modal, the page blocks workbench keybindings behind it and closes on Escape.
		const targetWindow = DOM.getWindow(options.container);
		let sawEscapeKeyDown = false;
		store.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Escape)) {
				sawEscapeKeyDown = true;
			}
			if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space) || keyboardEvent.equals(KeyCode.Tab) || keyboardEvent.equals(KeyMod.Shift | KeyCode.Tab)) {
				return;
			}
			const resolved = this.keybindingService.softDispatch(keyboardEvent, this.layoutService.activeContainer);
			if (resolved.kind === ResultKind.KbFound && resolved.commandId && !automationDialogAllowableCommands.has(resolved.commandId) && !shouldPassThroughAutomationDialogCommand(resolved.commandId, keyboardEvent.target)) {
				DOM.EventHelper.stop(event, true);
			}
		}, true));
		store.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_UP, (event: KeyboardEvent) => {
			if (DOM.isHTMLElement(event.target) && isAutomationDialogPopupTarget(event.target)) {
				return;
			}
			DOM.EventHelper.stop(event, true);
			if (new StandardKeyboardEvent(event).equals(KeyCode.Escape) && sawEscapeKeyDown) {
				options.onDidDismiss();
			}
		}, true));

		return {
			element,
			setCommitting: committing => element.classList.toggle('committing', committing),
			dispose: () => store.dispose(),
		};
	}

	protected override showOneTimeAutomation(title: string, details: readonly string[]): Promise<void> {
		return showMobileContentSheet(this.layoutService.mainContainer, title, body => {
			for (const detail of details) {
				DOM.append(body, $('p.automation-phone-one-time-detail')).textContent = detail;
			}
		});
	}

	protected override renderFooterActions(): undefined {
		return undefined;
	}

	protected override renderHeader(container: HTMLElement, controls: IAutomationDialogControls, store: DisposableStore): IAutomationDialogButtons {
		const header = DOM.append(container, $('.automation-phone-form-header'));
		const buttonBar = store.add(new ButtonBar(header));
		const cancel = buttonBar.addButton({ ...unthemedButtonStyles, secondary: true });
		cancel.label = controls.cancelLabel;
		store.add(cancel.onDidClick(() => controls.cancel()));
		DOM.append(header, $('span.automation-phone-form-title', { 'aria-hidden': 'true' }, controls.title));
		const save = buttonBar.addButton({ ...unthemedButtonStyles, secondary: true });
		save.label = controls.saveLabel;
		store.add(save.onDidClick(() => controls.save()));
		return { save, cancel };
	}

	protected override getFocusOrder(elements: IAutomationDialogFocusElements): HTMLElement[] {
		return [elements.cancel, elements.save, ...elements.fields, elements.notificationAction].filter(isDefined);
	}

	protected override didShowDialog(context: IAutomationDialogShownContext): void {
		const navigation = context.store.add(new MutableDisposable());
		// Back while a save is committing keeps the form open and re-arms the history entry.
		const trackForm = () => trackMobileSheetNavigation(context.container, () => {
			if (context.isCommitting()) {
				navigation.value = trackForm();
			} else {
				context.close();
			}
		});
		navigation.value = trackForm();
		context.dialogElement.focus();
	}
}
