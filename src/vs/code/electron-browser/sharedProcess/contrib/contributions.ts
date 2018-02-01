/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import { NodeCachedDataCleaner } from 'vs/code/electron-browser/sharedProcess/contrib/nodeCachedDataCleaner';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { LanguagePacksCache } from 'vs/platform/localizations/node/localizations';

export function createSharedProcessContributions(service: IInstantiationService): IDisposable {
	return combinedDisposable([
		service.createInstance(NodeCachedDataCleaner),
		service.createInstance(LanguagePacksCache)
	]);
}
