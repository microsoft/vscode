/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionStoragePaths } from 'vs/workbench/api/common/extHostStoragePaths';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';

export class ExtensionStoragePaths implements IExtensionStoragePaths {

	readonly _serviceBrand: undefined;

	readonly whenReady: Promise<any> = Promise.resolve();

	//todo@joh -> this isn't proper but also hard to get right...
	workspaceValue(_extension: IExtensionDescription): string | undefined {
		return '';
	}

	globalValue(_extension: IExtensionDescription): string {
		return '';
	}
}
