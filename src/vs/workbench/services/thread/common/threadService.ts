/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IThreadService = createDecorator<IThreadService>('threadService');

export interface IThreadService {
	_serviceBrand: any;

	/**
	 * Always returns a proxy.
	 */
	get<T>(identifier: ProxyIdentifier<T>): T;

	/**
	 * Register instance.
	 */
	set<T>(identifier: ProxyIdentifier<T>, value: T): void;
}

export class ProxyIdentifier<T> {
	_proxyIdentifierBrand: void;

	isMain: boolean;
	id: string;

	constructor(isMain: boolean, id: string) {
		this.isMain = isMain;
		this.id = id;
	}
}

export function createMainContextProxyIdentifier<T>(identifier: string): ProxyIdentifier<T> {
	return new ProxyIdentifier(true, 'm' + identifier);
}

export function createExtHostContextProxyIdentifier<T>(identifier: string): ProxyIdentifier<T> {
	return new ProxyIdentifier(false, 'e' + identifier);
}
