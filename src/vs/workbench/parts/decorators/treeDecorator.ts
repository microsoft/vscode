/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import tree = require('vs/base/parts/tree/browser/tree');
import lifecycle = require('vs/base/common/lifecycle');
import {Registry} from 'vs/platform/platform';
import {IDecoratorRegistry, Extensions as DecoratorExtensions} from 'vs/workbench/parts/decorators/decoratorRegistry';

export class TreeDecorator implements tree.IDecorator {

	protected decorators: tree.IDecorator[] = [];
	protected toDispose: lifecycle.IDisposable[] = [];
	constructor() {
	}

	public onActivate(tree: tree.ITree): void {
		this.decorators = Registry.as<IDecoratorRegistry>(DecoratorExtensions.Decorators).getDecorators();
		this.decorators.forEach(decorator=>decorator.onActivate(tree));
	}

	public decorate(tree: tree.ITree, element: any, templateId: string, row: tree.IRow): void {
		this.decorators.forEach(decorator=>decorator.decorate(tree,element,templateId, row));
	}

	public dispose(): void {
		this.decorators.forEach(decorator => decorator.dispose());
		this.toDispose.forEach(item => item.dispose());
	}
}