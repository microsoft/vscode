/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import { ReplaceService } from 'vs/workbench/parts/search/browser/replaceService';

export function registerContributions(): void {
	registerSingleton(IReplaceService, ReplaceService);
}
