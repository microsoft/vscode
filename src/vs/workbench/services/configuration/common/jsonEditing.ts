/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export const IJSONEditingService = createDecorator<IJSONEditingService>('jsonEditingService');

export enum JSONEditingErrorCode {

	/**
	 * Error when trying to write and save to the file while it is dirty in the editor.
	 */
	ERROR_FILE_DIRTY,

	/**
	 * Error when trying to write to a file that contains JSON errors.
	 */
	ERROR_INVALID_FILE
}

export class JSONEditingError extends Error {
	constructor(message: string, public code: JSONEditingErrorCode) {
		super(message);
	}
}

export interface IJSONValue {
	key: string;
	value: any;
}

export interface IJSONEditingService {

	_serviceBrand: ServiceIdentifier<any>;

	write(resource: URI, value: IJSONValue, save: boolean): TPromise<void>;
}