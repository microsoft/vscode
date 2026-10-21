/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { Action } from '../../../../base/common/actions.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';

class SessionPickerActionViewItem extends ActionViewItem {
	get trigger(): HTMLElement {
		return this.label!;
	}

	protected override updateLabel(): void { }
	protected override updateAriaLabel(): void { }
}

/** Hosts a custom picker label while retaining standard toolbar activation and hovers. */
export function createSessionPickerToolbar(
	store: DisposableStore,
	container: HTMLElement,
	instantiationService: IInstantiationService,
	id: string,
	label: string,
	run: () => void,
	hoverDelegate?: IHoverDelegate,
): { trigger: HTMLElement; action: Action } {
	const action = store.add(new Action(id, label, undefined, true, run));
	let item: SessionPickerActionViewItem;
	const toolbar = store.add(instantiationService.createInstance(WorkbenchToolBar, container, {
		ariaLabel: localize('sessionPickerToolbar', "Session Picker"),
		hoverDelegate,
		actionViewItemProvider: (action, options) => item = new SessionPickerActionViewItem(undefined, action, { ...options, icon: false, label: false }),
	}));
	toolbar.setActions([action]);
	return { trigger: item!.trigger, action };
}
