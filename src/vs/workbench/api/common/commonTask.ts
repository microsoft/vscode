/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { UriComponents } from 'vs/base/common/uri';

export interface TaskDefinitionTransfer {
	type: string;
	[name: string]: any;
}

export interface TaskItemTransfer {
	id: string;
	label: string;
	definition: TaskDefinitionTransfer;
	workspaceFolderUri: UriComponents;
}

export interface TaskExecutionTransfer {
	id: string;
}