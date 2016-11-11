/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';

export interface InternalTreeExplorerNodeContent {
	label: string;
	hasChildren: boolean;
	clickCommand: string;
}

export interface InternalTreeExplorerNode extends InternalTreeExplorerNodeContent {
	readonly id: string;
}

export interface InternalTreeExplorerNodeProvider {
	provideRootNode(): Thenable<InternalTreeExplorerNodeContent>;
	resolveChildren(node: InternalTreeExplorerNodeContent): Thenable<InternalTreeExplorerNodeContent[]>;
	executeCommand(node: InternalTreeExplorerNodeContent): TPromise<any>;
}
