'use strict';

import { TreeExplorerNode, TreeExplorerNodeProvider } from 'vscode';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, {Emitter} from 'vs/base/common/event';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ITreeExplorerViewletService = createDecorator<ITreeExplorerViewletService>('customViewletService');

export interface ITreeExplorerViewletService {
	_serviceBrand: any;

	registerTreeContentProvider(providerId: string, provider: TreeExplorerNodeProvider): void;
	provideTreeContent(providerId: string): TPromise<TreeExplorerNode>;
	resolveChildren(providerId: string, node: TreeExplorerNode): TPromise<TreeExplorerNode[]>;
}

export class TreeExplorerViewletService implements ITreeExplorerViewletService {
	public _serviceBrand: any;

	private _treeContentProviders: { [providerId: string]: TreeExplorerNodeProvider; };

	constructor(
		@IInstantiationService private _instantiationService: IInstantiationService
	) {
		this._treeContentProviders = Object.create(null);
	}

	registerTreeContentProvider(providerId: string, provider: TreeExplorerNodeProvider): void {
		this._treeContentProviders[providerId] = provider;
	}

	provideTreeContent(providerId: string): TPromise<TreeExplorerNode> {
		return TPromise.wrap(this._treeContentProviders[providerId].provideRootNode());
	}

	resolveChildren(providerId: string, node: TreeExplorerNode): TPromise<TreeExplorerNode[]> {
		return TPromise.wrap(this._treeContentProviders[providerId].resolveChildren(node));
	}
}
