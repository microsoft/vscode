'use strict';

import { TreeContentNode, TreeContentProvider } from 'vscode';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, {Emitter} from 'vs/base/common/event';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ITreeExplorerViewletService = createDecorator<ITreeExplorerViewletService>('customViewletService');

export interface ITreeExplorerViewletService {
	_serviceBrand: any;

	registerTreeContentProvider(providerId: string, provider: TreeContentProvider): void;
	provideTreeContent(providerId: string): TPromise<TreeContentNode>;
	resolveChildren(providerId: string, node: TreeContentNode): TPromise<TreeContentNode[]>;
}

export class TreeExplorerViewletService implements ITreeExplorerViewletService {
	public _serviceBrand: any;

	private _treeContentProviders: { [providerId: string]: TreeContentProvider; };

	constructor(
		@IInstantiationService private _instantiationService: IInstantiationService
	) {
		this._treeContentProviders = Object.create(null);
	}

	registerTreeContentProvider(providerId: string, provider: TreeContentProvider): void {
		this._treeContentProviders[providerId] = provider;
	}

	provideTreeContent(providerId: string): TPromise<TreeContentNode> {
		return TPromise.wrap(this._treeContentProviders[providerId].provideTreeContent());
	}

	resolveChildren(providerId: string, node: TreeContentNode): TPromise<TreeContentNode[]> {
		return TPromise.wrap(this._treeContentProviders[providerId].resolveChildren(node));
	}
}
