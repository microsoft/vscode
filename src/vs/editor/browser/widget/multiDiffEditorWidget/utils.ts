/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionRunner, IAction } from 'vs/base/common/actions';

export class ActionRunnerWithContext extends ActionRunner {
	constructor(private readonly _getContext: () => any) {
		super();
	}

	protected override runAction(action: IAction, _context?: unknown): Promise<void> {
		return super.runAction(action, this._getContext());
	}
}
