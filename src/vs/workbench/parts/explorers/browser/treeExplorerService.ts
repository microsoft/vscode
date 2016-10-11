'use strict';

import { TreeExplorerNodeProvider } from 'vscode';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, {Emitter} from 'vs/base/common/event';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { InternalTreeExplorerNode, InternalTreeExplorerNodeProvider } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';

export const ITreeExplorerService = createDecorator<ITreeExplorerService>('customViewletService');

export interface ITreeExplorerService {
	_serviceBrand: any;

	registerTreeContentProvider(providerId: string, provider: InternalTreeExplorerNodeProvider): void;
	provideTreeContent(providerId: string): TPromise<InternalTreeExplorerNode>;
	resolveChildren(providerId: string, node: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]>;
	resolveCommand(providerId: string, node: InternalTreeExplorerNode): TPromise<void>;
}

export class TreeExplorerViewletService implements ITreeExplorerService {
	public _serviceBrand: any;

	private _treeContentProviders: { [providerId: string]: InternalTreeExplorerNodeProvider };

	constructor(
		@IInstantiationService private _instantiationService: IInstantiationService
	) {
		this._treeContentProviders = Object.create(null);
	}

	registerTreeContentProvider(providerId: string, provider: InternalTreeExplorerNodeProvider): void {
		this._treeContentProviders[providerId] = provider;
	}

	provideTreeContent(providerId: string): TPromise<InternalTreeExplorerNode> {
		return TPromise.wrap(this._treeContentProviders[providerId].provideRootNode());
	}

	resolveChildren(providerId: string, node: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]> {
		return TPromise.wrap(this._treeContentProviders[providerId].resolveChildren(node));
	}

	resolveCommand(providerId: string, node: InternalTreeExplorerNode): TPromise<void> {
		return TPromise.wrap(this._treeContentProviders[providerId].resolveCommand(node));
	}
}
