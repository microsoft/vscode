/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import winjs = require('vs/base/common/winjs.base');
import lifecycle = require('vs/base/common/lifecycle');
import actions = require('vs/base/common/actions');
import actionbar = require('vs/base/browser/ui/actionbar/actionbar');
import actionsrenderer = require('vs/base/parts/tree/browser/actionsRenderer');
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import tree = require('vs/base/parts/tree/browser/tree');
import { Resource } from 'vs/workbench/parts/markers/common/markersModel';

class RemoveResourceAction extends actions.Action {
	constructor() {
		super('remove', nls.localize('RemoveAction.label', "Remove"), 'action-remove');
	}

	public run(context?: any): winjs.TPromise<any> {
		return (<tree.ITree>context['tree']).refresh();
	}
}

export class ActionContainer implements lifecycle.IDisposable {

	private cache: { [actionId:string]:actions.IAction; };
	private instantiationService: IInstantiationService;

	constructor(instantiationService: IInstantiationService) {
		this.cache = <any> {};
		this.instantiationService = instantiationService;
	}

	protected getAction(ctor: any, ...args: any[]): any {
		var action = this.cache[ctor.ID];

		if (!action) {
			args.unshift(ctor);
			action = this.cache[ctor.ID] = this.instantiationService.createInstance.apply(this.instantiationService, args);
		}

		return action;
	}

	public dispose(): void {
		Object.keys(this.cache).forEach(k => {
			this.cache[k].dispose();
		});

		this.cache = null;
	}
}


export class ActionProvider extends ActionContainer implements actionsrenderer.IActionProvider {

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super(instantiationService);
	}

	public hasActions(tree: tree.ITree, element: any): boolean {
		return element instanceof Resource;
	}

	public getActions(tree: tree.ITree, element: any): winjs.TPromise<actions.IAction[]> {
		return winjs.TPromise.as(this.getActionsForResource());
	}

	public getActionsForResource(): actions.IAction[] {
		return [new RemoveResourceAction()];
	}

	public hasSecondaryActions(tree: tree.ITree, element: any): boolean {
		return false;
	}

	public getSecondaryActions(tree: tree.ITree, element: any): winjs.TPromise<actions.IAction[]> {
		return winjs.TPromise.as([]);
	}

	public getActionItem(tree: tree.ITree, element: any, action: actions.IAction): actionbar.IActionItem {
		return null;
	}
}