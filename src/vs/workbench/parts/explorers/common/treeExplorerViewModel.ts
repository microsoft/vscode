/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { TreeExplorerNodeProvider } from 'vscode';

export interface InternalTreeExplorerNodeContent {
	label: string;
	hasChildren: boolean;
	clickCommand: string;
}

export class InternalTreeExplorerNode implements InternalTreeExplorerNodeContent {
	private static idCounter = 1;

	id: number;

	label: string;
	hasChildren: boolean;
	clickCommand: string;

	constructor(node: any, provider: TreeExplorerNodeProvider<any>) {
		this.id = InternalTreeExplorerNode.idCounter++;

		this.label = provider.getLabel ? provider.getLabel(node) : node.toString();
		this.hasChildren = provider.getHasChildren ? provider.getHasChildren(node) : true;
		this.clickCommand = provider.getClickCommand ? provider.getClickCommand(node) : null;
	}
}

export interface InternalTreeExplorerNodeProvider {
	provideRootNode(): Thenable<InternalTreeExplorerNodeContent>;
	resolveChildren(node: InternalTreeExplorerNodeContent): Thenable<InternalTreeExplorerNodeContent[]>;
	executeCommand(node: InternalTreeExplorerNodeContent): TPromise<any>;
}
