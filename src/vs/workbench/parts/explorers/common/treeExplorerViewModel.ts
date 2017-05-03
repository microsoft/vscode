/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';

export interface InternalTreeNodeContent {
	label: string;
	hasChildren: boolean;
	clickCommand: string;
}

export interface InternalTreeNode extends InternalTreeNodeContent {
	readonly id: string;
	readonly providerId: string;
}

export interface InternalTreeNodeProvider {
	id: string;
	provideRootNode(): Thenable<InternalTreeNodeContent>;
	resolveChildren(node: InternalTreeNodeContent): Thenable<InternalTreeNodeContent[]>;
	executeCommand(node: InternalTreeNodeContent): TPromise<any>;
	onRefresh?: Event<InternalTreeNodeContent>;
}
