/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vscode';
import { ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import * as goToDefinition from './provider';

export function create(accessor: ServicesAccessor): Disposable {
	return goToDefinition.register(accessor);
}
