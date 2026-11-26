/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobileAutomations.css';
import * as DOM from '../../../../base/browser/dom.js';
import { ButtonBar, unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { SelectBoxNative } from '../../../../base/browser/ui/selectBox/selectBoxNative.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isDefined } from '../../../../base/common/types.js';
import { defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { trackMobileSheetNavigation } from '../../../../workbench/contrib/sessions/browser/mobile/mobileSheetNavigation.js';
import { IAutomationFormPresentation } from '../../automations/browser/automationDialog.js';
import { AutomationDialogService, IAutomationDialogButtons, IAutomationDialogControls, IAutomationDialogFocusElements, IAutomationDialogShownContext } from '../../automations/browser/automationDialogService.js';

const $ = DOM.$;

/**
 * The phone Automations form: a full-screen sheet with Cancel and Save in its
 * header, native pickers, and browser Back dismissing it like other sheets.
 */
export class MobileAutomationDialogService extends AutomationDialogService {

	protected override readonly dialogOptions = {
		modalBlockExtraClasses: ['automation-phone-form'],
		disableCloseButton: true,
	};

	protected override readonly formPresentation: IAutomationFormPresentation = {
		createScheduleSelect: (options, selected, ariaLabel) => new SelectBoxNative(options, selected, defaultSelectBoxStyles, { ariaLabel, nativeActivation: true }),
		showPromptLabel: true,
	};

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
		context.dialogElement?.focus();
	}
}
