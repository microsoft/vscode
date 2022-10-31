/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { Disposable, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';

export interface ActionSet<T> extends IDisposable {
	readonly validActions: readonly T[];
	readonly allActions: readonly T[];
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

export interface ListMenuItem<T> {
	item?: T;
	kind?: any;
	group?: any;
}

export interface IActionList<T> extends IDisposable {
	hide(): void;
	focusPrevious(): void;
	focusNext(): void;
	layout(minWidth: number): number;
	toMenuItems(items: readonly T[], showHeaders: boolean): ListMenuItem<T>[];
	acceptSelected(options?: { readonly preview?: boolean }): void;
	domNode: HTMLElement;
}

export abstract class BaseActionWidget<T> extends Disposable {
	public showDisabled = false;
	public list = this._register(new MutableDisposable<IActionList<T>>());
	constructor() {
		super();
	}

	public acceptSelected(options?: { readonly preview?: boolean }) {
		this.list.value?.acceptSelected(options);
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

	public toMenuItems(actions: readonly T[], showHeaders: boolean): ListMenuItem<T>[] {
		const list = this.list.value;
		if (!list) {
			throw new Error('No list');
		}
		return list.toMenuItems(actions, showHeaders);
	}
}

export function stripNewlines(str: string): string {
	return str.replace(/\r\n|\r|\n/g, ' ');
}
