/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import { NodeCachedDataCleaner } from 'vs/code/electron-browser/sharedProcess/contrib/nodeCachedDataCleaner';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { LanguagePackExtensions } from 'vs/code/electron-browser/sharedProcess/contrib/languagePackExtensions';
import { IDisposable, combinedDisposable } from 'vs/base/common/lifecycle';

export function createSharedProcessContributions(service: IInstantiationService): IDisposable {
	return combinedDisposable([
		service.createInstance(NodeCachedDataCleaner),
		service.createInstance(LanguagePackExtensions)
	]);
}
