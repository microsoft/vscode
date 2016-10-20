/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';

export class RefreshViewExplorerAction extends Action {

	constructor() {
		super('workbench.action.customTreeExplorer.refresh', nls.localize('refresh', "Refresh"), 'customTreeExplorer-action toggle', true, () => {
			return TPromise.as(null);
		});
	}
}