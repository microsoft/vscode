/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { InternalTreeExplorerNode, InternalTreeExplorerNodeProvider } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';

export const ITreeExplorerService = createDecorator<ITreeExplorerService>('treeExplorerService');

export interface ITreeExplorerService {
	_serviceBrand: any;

	onTreeExplorerNodeProviderRegistered: Event<String>;

	registerTreeExplorerNodeProvider(providerId: string, provider: InternalTreeExplorerNodeProvider): void;
	hasProvider(providerId: string): boolean;

	provideRootNode(providerId: string): TPromise<InternalTreeExplorerNode>;
	resolveChildren(providerId: string, node: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]>;
	executeCommand(providerId: string, node: InternalTreeExplorerNode): TPromise<void>;
}
