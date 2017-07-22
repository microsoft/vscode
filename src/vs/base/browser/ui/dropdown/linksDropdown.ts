/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { isMacintosh } from 'vs/base/common/platform';
import { isFunction } from 'vs/base/common/types';
import { Action } from 'vs/base/common/actions';
import { DropdownMenu, IDropdownMenuOptions } from 'vs/base/browser/ui/dropdown/dropdown';

export interface ILinksDropdownMenuOptions extends IDropdownMenuOptions {
	tooltip: string;
}

export class LinksDropdownMenu extends DropdownMenu {

	constructor(container: HTMLElement, options: ILinksDropdownMenuOptions) {
		super(container, options);

		this.tooltip = options.tooltip;
	}

	protected onEvent(e: Event, activeElement: HTMLElement): void {
		if (e instanceof KeyboardEvent && ((<KeyboardEvent>e).ctrlKey || (isMacintosh && (<KeyboardEvent>e).metaKey))) {
			return; // allow to use Ctrl/Meta in workspace dropdown menu
		}

		this.hide();
	}
}

export class LinkDropdownAction extends Action {

	constructor(id: string, name: string, clazz: string, url: () => string, forceOpenInNewTab?: boolean);
	constructor(id: string, name: string, clazz: string, url: string, forceOpenInNewTab?: boolean);
	constructor(id: string, name: string, clazz: string, url: any, forceOpenInNewTab?: boolean) {
		super(id, name, clazz, true, (e: Event) => {
			let urlString = url;

			if (isFunction(url)) {
				urlString = url();
			}

			if (forceOpenInNewTab || (e instanceof MouseEvent && ((<MouseEvent>e).ctrlKey || (isMacintosh && (<MouseEvent>e).metaKey)))) {
				window.open(urlString, '_blank');
			} else {
				window.location.href = urlString;
			}

			return TPromise.as(true);
		});
	}
}