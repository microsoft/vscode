/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IMenubarService = createDecorator<IMenubarService>('menubarService');

export interface IMenubarProperties {
}

export interface IMenubarService {
	_serviceBrand: any;

	/**
	 * Add top-level menu.
	 */
	addMenu(menuTitle: string): void;

	/**
	 * Add item to menu
	 */
	addMenuItem(title: string, parent: string): void;

	/**
	 * Update some menubar properties.
	 */
	updateProperties(properties: IMenubarProperties): void;
}