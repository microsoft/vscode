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
	registerDebugView(view: IDebugViewConstructorSignature, order: number, weight: number): void;
	getDebugViews(): { view: IDebugViewConstructorSignature, weight: number }[];
}

class DebugViewRegistryImpl implements IDebugViewRegistry {
	private debugViews: { view: IDebugViewConstructorSignature, order: number, weight: number }[];

	constructor() {
		this.debugViews = [];
	}

	public registerDebugView(view: IDebugViewConstructorSignature, order: number, weight: number): void {
		this.debugViews.push({ view, order, weight });
	}

	public getDebugViews(): { view: IDebugViewConstructorSignature, weight: number }[] {
		return this.debugViews.sort((first, second) => first.order - second.order)
			.map(viewWithOrder => ({ view: viewWithOrder.view, weight: viewWithOrder.weight }));
	}
}

export const DebugViewRegistry = <IDebugViewRegistry>new DebugViewRegistryImpl();
