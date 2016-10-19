/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { InternalTreeExplorerNode, InternalTreeExplorerNodeProvider } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';

export const ITreeExplorerViewletService = createDecorator<ITreeExplorerViewletService>('customViewletService');

export interface ITreeExplorerViewletService {
	_serviceBrand: any;

	registerTreeExplorerNodeProvider(providerId: string, provider: InternalTreeExplorerNodeProvider): void;
	provideTreeContent(providerId: string): TPromise<InternalTreeExplorerNode>;
	resolveChildren(providerId: string, node: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]>;
	resolveCommand(providerId: string, node: InternalTreeExplorerNode): TPromise<void>;
}

export class TreeExplorerViewletService implements ITreeExplorerViewletService {
	public _serviceBrand: any;

	private _treeExplorerNodeProvider: { [providerId: string]: InternalTreeExplorerNodeProvider };

	constructor(
		@IInstantiationService private _instantiationService: IInstantiationService
	) {
		this._treeExplorerNodeProvider = Object.create(null);
	}

	registerTreeExplorerNodeProvider(providerId: string, provider: InternalTreeExplorerNodeProvider): void {
		this._treeExplorerNodeProvider[providerId] = provider;
	}

	provideTreeContent(providerId: string): TPromise<InternalTreeExplorerNode> {
		return TPromise.wrap(this._treeExplorerNodeProvider[providerId].provideRootNode());
	}

	resolveChildren(providerId: string, node: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]> {
		return TPromise.wrap(this._treeExplorerNodeProvider[providerId].resolveChildren(node));
	}

	resolveCommand(providerId: string, node: InternalTreeExplorerNode): TPromise<void> {
		return TPromise.wrap(this._treeExplorerNodeProvider[providerId].executeCommand(node));
	}
}
