/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const Ident = '$$memIdent$$';

export const IExtensionHostHeapService = createDecorator<IExtensionHostHeapService>('extensionHostHeapService');

export interface IExtensionHostHeapService {

	_serviceBrand: undefined;

	onDidFinalize: Event<number>;

	registerObject<T extends { [Ident]: number }>(obj: T): boolean;
}
