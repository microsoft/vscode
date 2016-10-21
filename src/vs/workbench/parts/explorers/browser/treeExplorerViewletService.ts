/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { InternalTreeExplorerNode, InternalTreeExplorerNodeProvider } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';
import { IMessageService, Severity } from 'vs/platform/message/common/message';

export const ITreeExplorerViewletService = createDecorator<ITreeExplorerViewletService>('customViewletService');

export interface ITreeExplorerViewletService {
	_serviceBrand: any;

	registerTreeExplorerNodeProvider(providerId: string, provider: InternalTreeExplorerNodeProvider): void;
	provideTreeContent(providerId: string): TPromise<InternalTreeExplorerNode>;
	resolveChildren(providerId: string, node: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]>;
	executeCommand(providerId: string, node: InternalTreeExplorerNode): TPromise<void>;
}

export class TreeExplorerViewletService implements ITreeExplorerViewletService {
	public _serviceBrand: any;

	private _treeExplorerNodeProvider: { [providerId: string]: InternalTreeExplorerNodeProvider };

	constructor(
		@IInstantiationService private _instantiationService: IInstantiationService,
		@IMessageService private messageService: IMessageService,
	) {
		this._treeExplorerNodeProvider = Object.create(null);
	}

	registerTreeExplorerNodeProvider(providerId: string, provider: InternalTreeExplorerNodeProvider): void {
		this._treeExplorerNodeProvider[providerId] = provider;
	}

	provideTreeContent(providerId: string): TPromise<InternalTreeExplorerNode> {
		const provider = this.getProvider(providerId);
		return TPromise.wrap(provider.provideRootNode());
	}

	resolveChildren(providerId: string, node: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]> {
		const provider = this.getProvider(providerId);
		return TPromise.wrap(provider.resolveChildren(node));
	}

	executeCommand(providerId: string, node: InternalTreeExplorerNode): TPromise<void> {
		const provider = this.getProvider(providerId);
		return TPromise.wrap(provider.executeCommand(node));
	}

	private getProvider(providerId: string): InternalTreeExplorerNodeProvider {
		const provider = this._treeExplorerNodeProvider[providerId];

		if (!provider) {
			this.messageService.show(Severity.Error, `No TreeExplorerNodeProvider with id '${providerId}' registered.`);
		}

		return provider;
	}
}
