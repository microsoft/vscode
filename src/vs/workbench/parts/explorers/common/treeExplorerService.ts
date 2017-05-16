/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { InternalTreeNode, InternalTreeNodeProvider } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';

export const ITreeExplorerService = createDecorator<ITreeExplorerService>('treeExplorerService');

export interface ITreeExplorerService {
	_serviceBrand: any;

	onDidChangeProvider: Event<string>;
	activeProvider: string;

	onTreeExplorerNodeProviderRegistered: Event<String>;
	registerTreeExplorerNodeProvider(providerId: string, provider: InternalTreeNodeProvider): void;
	hasProvider(providerId: string): boolean;
	getProvider(providerId: string): InternalTreeNodeProvider;

	provideRootNode(providerId: string): TPromise<InternalTreeNode>;
	resolveChildren(providerId: string, node: InternalTreeNode): TPromise<InternalTreeNode[]>;
	executeCommand(providerId: string, node: InternalTreeNode): TPromise<void>;
}
