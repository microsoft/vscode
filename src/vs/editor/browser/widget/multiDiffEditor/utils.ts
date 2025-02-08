/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionRunner, IAction } from '../../../../base/common/actions.js';

export class ActionRunnerWithContext extends ActionRunner {
	constructor(private readonly _getContext: () => unknown) {
		super();
	}

	protected override runAction(action: IAction, _context?: unknown): Promise<void> {
		const ctx = this._getContext();
		return super.runAction(action, ctx);
	}
}
