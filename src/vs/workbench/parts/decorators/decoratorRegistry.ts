/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Registry, BaseRegistry} from 'vs/platform/platform';
import {IConstructorSignature0} from 'vs/platform/instantiation/common/instantiation';
import tree = require('vs/base/parts/tree/browser/tree');

export namespace Extensions {
	export const Decorators = 'decorator.contributions.kind';
}

export type IDecoratorSignature = IConstructorSignature0<tree.IDecorator>;

export interface IDecoratorRegistry {

	/**
	 * Registers a decorator to the platform that will be loaded when the workbench starts and disposed when
	 * the workbench shuts down.
	 */
	registerDecorator(decorator: IDecoratorSignature): void;

	/**
	 * Returns all decorators that are known to the platform.
	 */
	getDecorators(): tree.IDecorator[];
}

class DecorationsRegistry extends BaseRegistry<tree.IDecorator> implements IDecoratorRegistry {

	public registerDecorator(ctor: IDecoratorSignature): void {
		super._register(ctor);
	}

	public getDecorators(): tree.IDecorator[] {
		return super._getInstances();
	}

	public setDecorators(contributions: tree.IDecorator[]): void {
		super._setInstances(contributions);
	}
}

Registry.add(Extensions.Decorators, new DecorationsRegistry());