/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IViewlet} from 'vs/workbench/common/viewlet';

export interface IExtensionsViewlet extends IViewlet {
	search(text: string, immediate?: boolean): void;
}