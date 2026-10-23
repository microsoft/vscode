/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IManagedHoverContent } from '../../../../base/browser/ui/hover/hover.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { Action } from '../../../../base/common/actions.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';

class SessionPickerActionViewItem extends ActionViewItem {
	tooltipProvider: (() => string) | undefined;

	get trigger(): HTMLElement {
		return this.label!;
	}

	protected override updateLabel(): void { }
	protected override updateAriaLabel(): void { }

	protected override getHoverContents(): IManagedHoverContent {
		const tooltipProvider = this.tooltipProvider;
		return tooltipProvider ? {
			markdown: async () => tooltipProvider(),
			markdownNotSupportedFallback: undefined,
		} : super.getHoverContents();
	}
}

const SESSION_PICKER_ID_ATTRIBUTE = 'data-session-picker-id';

/** The stable id of the picker hosted in `container` by {@link createSessionPickerToolbar}, if any. */
export function getSessionPickerId(container: HTMLElement): string | undefined {
	return container.getAttribute(SESSION_PICKER_ID_ATTRIBUTE) ?? undefined;
}

/**
 * Hosts a custom picker label while retaining standard toolbar activation and hovers.
 * Marks `container` with the picker's `id`, see {@link getSessionPickerId}.
 */
export function createSessionPickerToolbar(
	store: DisposableStore,
	container: HTMLElement,
	instantiationService: IInstantiationService,
	id: string,
	label: string,
	run: () => void,
	hoverDelegate?: IHoverDelegate,
	tooltipProvider?: () => string,
): { trigger: HTMLElement; action: Action } {
	container.setAttribute(SESSION_PICKER_ID_ATTRIBUTE, id);
	const action = store.add(new Action(id, label, undefined, true, run));
	let item: SessionPickerActionViewItem;
	const toolbar = store.add(instantiationService.createInstance(WorkbenchToolBar, container, {
		ariaLabel: localize('sessionPickerToolbar', "Session Picker"),
		hoverDelegate,
		actionViewItemProvider: (action, options) => {
			item = new SessionPickerActionViewItem(undefined, action, { ...options, icon: false, label: false });
			item.tooltipProvider = tooltipProvider;
			return item;
		},
	}));
	toolbar.setActions([action]);
	return { trigger: item!.trigger, action };
}
