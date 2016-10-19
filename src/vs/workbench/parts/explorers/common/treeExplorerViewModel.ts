/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { TreeExplorerNodeProvider } from 'vscode';

export class InternalTreeExplorerNode implements TreeExplorerNodeContent {
	static idCounter = 1;

	id: number;

	label: string = 'label';
	hasChildren: boolean = true;
	clickCommand: string = null;

	constructor(node: any, provider: TreeExplorerNodeProvider<any>) {
		this.id = InternalTreeExplorerNode.idCounter++;

		if (provider.getLabel) {
			this.label = provider.getLabel(node);
		}
		if (provider.getHasChildren) {
			this.hasChildren = provider.getHasChildren(node);
		}
		if (provider.getClickCommand) {
			this.clickCommand = provider.getClickCommand(node);
		}
	}
}

export interface InternalTreeExplorerNodeProvider {
	provideRootNode(): Thenable<InternalTreeExplorerNode>;
	resolveChildren(node: InternalTreeExplorerNode): Thenable<InternalTreeExplorerNode[]>;
	executeCommand(node: TreeExplorerNodeContent): TPromise<void>;
}

export interface TreeExplorerNodeContent {
	label: string;
	hasChildren: boolean;
	clickCommand: string;
}
