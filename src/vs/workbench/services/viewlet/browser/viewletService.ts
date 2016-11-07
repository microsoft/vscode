/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { ISidebar } from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import Event from 'vs/base/common/event';
import { ViewletDescriptor } from 'vs/workbench/browser/viewlet';

export class ViewletService implements IViewletService {

	public _serviceBrand: any;

	private sidebarPart: ISidebar;

	constructor(
		sidebarPart: ISidebar
	) {
		this.sidebarPart = sidebarPart;
	}

	public get onDidViewletOpen(): Event<IViewlet> {
		return this.sidebarPart.onDidViewletOpen;
	}

	public get onDidViewletClose(): Event<IViewlet> {
		return this.sidebarPart.onDidViewletClose;
	}

	public openViewlet(id: string, focus?: boolean): TPromise<IViewlet> {
		return this.sidebarPart.openViewlet(id, focus);
	}

	public toggleViewlet(id: string): TPromise<IViewlet> {
		return TPromise.as(null);
	}

	public getActiveViewlet(): IViewlet {
		return this.sidebarPart.getActiveViewlet();
	}

	public getViewletDescriptors(): ViewletDescriptor[] {
		return [];
	}
}