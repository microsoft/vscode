/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from '../../../common/contributions';
import { IDebugService, State } from '../common/debug';
import { dispose, IDisposable } from '../../../../base/common/lifecycle';
import { IHostService } from '../../../services/host/browser/host';
import { ITitleService } from '../../../services/title/browser/titleService';

export class DebugTitleContribution implements IWorkbenchContribution {

	private toDispose: IDisposable[] = [];

	constructor(
		@IDebugService debugService: IDebugService,
		@IHostService hostService: IHostService,
		@ITitleService titleService: ITitleService
	) {
		const updateTitle = () => {
			if (debugService.state === State.Stopped && !hostService.hasFocus) {
				titleService.updateProperties({ prefix: '🔴' });
			} else {
				titleService.updateProperties({ prefix: '' });
			}
		};
		this.toDispose.push(debugService.onDidChangeState(updateTitle));
		this.toDispose.push(hostService.onDidChangeFocus(updateTitle));
	}

	dispose(): void {
		dispose(this.toDispose);
	}
}
