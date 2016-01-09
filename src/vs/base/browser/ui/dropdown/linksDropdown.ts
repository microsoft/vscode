/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as WinJS from 'vs/base/common/winjs.base';
import * as Platform from 'vs/base/common/platform';
import * as Types from 'vs/base/common/types';
import * as Actions from 'vs/base/common/actions';
import * as Dropdown from 'vs/base/browser/ui/dropdown/dropdown';

export interface ILinksDropdownMenuOptions extends Dropdown.IDropdownMenuOptions {
	tooltip: string;
}

export class LinksDropdownMenu extends Dropdown.DropdownMenu {

	constructor (container:HTMLElement, options: ILinksDropdownMenuOptions) {
		super(container, options);

		this.tooltip = options.tooltip;
	}

	/*protected*/ public onEvent(e:Event, activeElement: HTMLElement):void {
		if (e instanceof KeyboardEvent && ((<KeyboardEvent>e).ctrlKey || (Platform.isMacintosh && (<KeyboardEvent>e).metaKey))) {
			return; // allow to use Ctrl/Meta in workspace dropdown menu
		}

		this.hide();
	}
}

export class LinkDropdownAction extends Actions.Action {

	constructor(id:string, name:string, clazz:string, url:()=>string, forceOpenInNewTab?:boolean);
	constructor(id:string, name:string, clazz:string, url:string, forceOpenInNewTab?:boolean);
	constructor(id:string, name:string, clazz:string, url:any, forceOpenInNewTab?:boolean) {
		super(id, name, clazz, true, (e:Event)=>{
			var urlString = url;

			if (Types.isFunction(url)) {
				urlString = url();
			}

			if (forceOpenInNewTab || (e instanceof MouseEvent && ((<MouseEvent>e).ctrlKey || (Platform.isMacintosh && (<MouseEvent>e).metaKey)))) {
				window.open(urlString, '_blank');
			} else {
				window.location.href = urlString;
			}

			return WinJS.Promise.as(true);
		});
	}
}