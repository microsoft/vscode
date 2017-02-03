/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { TreeExplorerView } from 'vs/workbench/parts/explorers/browser/views/treeExplorerView';
import { toViewletActionId } from 'vs/workbench/parts/explorers/common/treeExplorer';

export class RefreshViewExplorerAction extends Action {

	constructor(view: TreeExplorerView) {
		super(toViewletActionId('refresh'), nls.localize('refresh', "Refresh"), 'extensionViewlet-action toggle', true, () => {
			view.updateInput();
			return TPromise.as(null);
		});
	}
}
