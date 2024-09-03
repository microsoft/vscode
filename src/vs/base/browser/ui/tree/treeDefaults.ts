/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncDataTree } from './asyncDataTree.js';
import { Action } from '../../../common/actions.js';
import * as nls from '../../../../nls.js';

export class CollapseAllAction<TInput, T, TFilterData = void> extends Action {

	constructor(private viewer: AsyncDataTree<TInput, T, TFilterData>, enabled: boolean) {
		super('vs.tree.collapse', nls.localize('collapse all', "Collapse All"), 'collapse-all', enabled);
	}

	override async run(): Promise<any> {
		this.viewer.collapseAll();
		this.viewer.setSelection([]);
		this.viewer.setFocus([]);
	}
}
