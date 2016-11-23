/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IResourceInput } from 'vs/platform/editor/common/editor';

export interface IOptions {

	/**
	 * Instructs the workbench to open the provided files right after startup.
	 */
	filesToOpen?: IResourceInput[];

	/**
	 * Instructs the workbench to create and open the provided files right after startup.
	 */
	filesToCreate?: IResourceInput[];

	/**
	 * Instructs the workbench to open a diff of the provided files right after startup.
	 */
	filesToDiff?: IResourceInput[];
}