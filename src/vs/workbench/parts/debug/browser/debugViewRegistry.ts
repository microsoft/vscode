/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionRunner } from 'vs/base/common/actions';
import { IViewletView } from 'vs/workbench/browser/viewlet';

// Debug view registration

export interface IDebugViewConstructorSignature {
	new (actionRunner: IActionRunner, viewletSetings: any, ...services: { _serviceBrand: any; }[]): IViewletView;
}

export interface IDebugViewRegistry {
	registerDebugView(view: IDebugViewConstructorSignature, order: number): void;
	getDebugViews(): IDebugViewConstructorSignature[];
}

class DebugViewRegistryImpl implements IDebugViewRegistry {
	private debugViews: { view: IDebugViewConstructorSignature, order: number }[];

	constructor() {
		this.debugViews = [];
	}

	public registerDebugView(view: IDebugViewConstructorSignature, order: number): void {
		this.debugViews.push({ view, order });
	}

	public getDebugViews(): IDebugViewConstructorSignature[] {
		return this.debugViews.sort((first, second) => first.order - second.order)
			.map(viewWithOrder => viewWithOrder.view);
	}
}

export var DebugViewRegistry = <IDebugViewRegistry>new DebugViewRegistryImpl();
