'use strict';

import { ITreeNode, TreeContentProvider } from 'vscode';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, {Emitter} from 'vs/base/common/event';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TreeViewNode } from 'vs/workbench/parts/explorers/common/treeViewModel';

export const ITreeExplorerViewletService = createDecorator<ITreeExplorerViewletService>('customViewletService');

export interface ITreeExplorerViewletService {
	_serviceBrand: any;

	registerTreeContentProvider(providerId: string, provider: TreeContentProvider): void;
	provideTreeContent(providerId: string): TPromise<ITreeNode>;
}

export class TreeExplorerViewletService implements ITreeExplorerViewletService {
	public _serviceBrand: any;

	private _treeContentProviders: { [providerId: string]: TreeContentProvider; };

	constructor(
		@IInstantiationService private _instantiationService: IInstantiationService,
	) {
		this._treeContentProviders = Object.create(null);
	}

	registerTreeContentProvider(providerId: string, provider: TreeContentProvider): void {
		this._treeContentProviders[providerId] = provider;
	}

	provideTreeContent(providerId: string): TPromise<ITreeNode> {
		return TPromise.wrap(this._treeContentProviders[providerId].provideTreeContent());
	}
}
