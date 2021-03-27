/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IElectronEnvironmentService = createDecorator<IElectronEnvironmentService>('electronEnvironmentService');

export interface IElectronEnvironmentService {

	_serviceBrand: undefined;

	readonly windowId: number;

	readonly sharedIPCHandle: string;
}

export class ElectronEnvironmentService implements IElectronEnvironmentService {

	_serviceBrand: undefined;

	constructor(
		public readonly windowId: number,
		public readonly sharedIPCHandle: string
	) { }
}
