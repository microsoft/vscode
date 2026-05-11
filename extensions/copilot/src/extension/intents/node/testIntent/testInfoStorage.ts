/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../../util/common/services';
import { URI } from '../../../../util/vs/base/common/uri';
import { Range } from '../../../../vscodeTypes';


export const ITestGenInfoStorage = createServiceIdentifier<ITestGenInfoStorage>('ITestGenInfoStorage');

export interface ITestGenInfo {
	uri: URI;
	target: Range;
	identifier: string | undefined;
}

/**
 * Global storage for test generation information that allows data flow between
 * test gen entry points such as (context menu item and code action) and an inline chat that
 * are created from those entry points.
 */
export interface ITestGenInfoStorage {
	readonly _serviceBrand: undefined;

	sourceFileToTest: ITestGenInfo | undefined;
}

export class TestGenInfoStorage implements ITestGenInfoStorage {
	declare _serviceBrand: undefined;

	sourceFileToTest = undefined;
}
