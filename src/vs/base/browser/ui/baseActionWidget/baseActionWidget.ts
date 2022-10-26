/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { Disposable, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';

export interface ActionSet extends IDisposable {
	readonly validActions: readonly ActionItem[];
	readonly allActions: readonly ActionItem[];
	readonly hasAutoFix: boolean;

	readonly documentation: readonly {
		id: string;
		title: string;
		tooltip?: string;
		arguments?: any[];
	}[];
}
export interface ActionShowOptions {
	readonly includeDisabledActions: boolean;
	readonly fromLightbulb?: boolean;
	readonly showHeaders?: boolean;
}
export interface ActionItem extends Disposable { }

export interface ActionMenuItem {
	action?: ActionItem;
	kind?: any;
}

export interface IActionList extends Disposable {
	hide(): void;
	focusPrevious(): void;
	focusNext(): void;
	layout(minWidth: number): number;
	toMenuItems(actions: readonly ActionItem[], showHeaders: boolean): ActionMenuItem[];
	acceptSelected(options?: { readonly preview?: boolean }): void;
	domNode: HTMLElement;
}

export abstract class BaseActionWidget<ActionItem> extends Disposable {
	public showDisabled = false;
	public list = this._register(new MutableDisposable<IActionList>());
	constructor() {
		super();
	}

	public focusPrevious() {
		this.list?.value?.focusPrevious();
	}

	public focusNext() {
		this.list?.value?.focusNext();
	}

	public hide() {
		this.list.value?.hide();
		this.list.clear();
	}

	public clear() {
		this.list.clear();
	}

	public layout(minWidth: number) {
		this.list?.value?.layout(minWidth);
	}

	public abstract show(trigger: any, actions: any, anchor: IAnchor, container: HTMLElement | undefined, options: any, delegate: any): Promise<void>;
	public abstract toMenuItems(actions: readonly ActionItem[], showHeaders: boolean): ActionMenuItem[];
}
