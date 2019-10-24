/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import * as vscode from 'vscode';
import { ExtHostSearchShape } from '../common/extHost.protocol';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IExtHostSearch extends ExtHostSearchShape {
	registerTextSearchProvider(scheme: string, provider: vscode.TextSearchProvider): IDisposable;
	registerFileSearchProvider(scheme: string, provider: vscode.FileSearchProvider): IDisposable;
}

export const IExtHostSearch = createDecorator<IExtHostSearch>('IExtHostSearch');
