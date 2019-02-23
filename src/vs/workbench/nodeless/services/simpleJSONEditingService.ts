/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONEditingService, IJSONValue } from 'vs/workbench/services/configuration/common/jsonEditing';
import { URI } from 'vs/base/common/uri';

export class SimpleJSONEditingService implements IJSONEditingService {

	_serviceBrand: any;

	write(resource: URI, value: IJSONValue, save: boolean): Promise<void> {
		return Promise.resolve();
	}
}