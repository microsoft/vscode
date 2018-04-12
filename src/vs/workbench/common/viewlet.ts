/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IComposite } from 'vs/workbench/common/composite';

export interface IViewlet extends IComposite {

	/**
	 * Returns the minimal width needed to avoid any content horizontal truncation
	 */
	getOptimalWidth(): number;
}
