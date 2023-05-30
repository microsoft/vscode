/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IRange } from 'vs/base/common/range';
import { URI } from 'vs/base/common/uri';
import { LanguageSelector } from 'vs/editor/common/languageSelector';
import { ISubmenuItem } from 'vs/platform/actions/common/actions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IShareableItem {
	resourceUri: URI;
	location?: IRange;
}

export interface IShareProvider {
	readonly id: string;
	readonly label: string;
	readonly priority: number;
	readonly selector: LanguageSelector;
	prepareShare?(item: IShareableItem, token: CancellationToken): Thenable<boolean | undefined>;
	provideShare(item: IShareableItem, token: CancellationToken): Thenable<URI | undefined>;
}

export const IShareService = createDecorator<IShareService>('shareService');
export interface IShareService {
	_serviceBrand: undefined;

	registerShareProvider(provider: IShareProvider): IDisposable;
	getShareActions(): ISubmenuItem[];
	provideShare(item: IShareableItem, token: CancellationToken): Thenable<URI | undefined>;
}
