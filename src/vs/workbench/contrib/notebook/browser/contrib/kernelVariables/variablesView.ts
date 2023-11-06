/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

const VARIABLES_VIEW_CONTAINER_ID = 'variablesViewContainer';

export class VariablesView extends Disposable implements IWorkbenchContribution {

	constructor() {
		super();
	}

}
