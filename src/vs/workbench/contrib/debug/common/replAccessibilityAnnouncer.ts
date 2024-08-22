/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility';
import { ILogService } from '../../../../platform/log/common/log';
import { IWorkbenchContribution } from '../../../common/contributions';
import { IDebugService } from './debug';

export class ReplAccessibilityAnnouncer extends Disposable implements IWorkbenchContribution {
	static ID = 'debug.replAccessibilityAnnouncer';
	constructor(
		@IDebugService debugService: IDebugService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ILogService logService: ILogService
	) {
		super();
		const viewModel = debugService.getViewModel();
		this._register(viewModel.onDidFocusSession((session) => {
			if (!session) {
				return;
			}
			this._register(session.onDidChangeReplElements((element) => {
				if (!element || !('originalExpression' in element)) {
					// element was removed or hasn't been resolved yet
					return;
				}
				const value = element.toString();
				accessibilityService.status(value);
				logService.trace('ReplAccessibilityAnnouncer#onDidChangeReplElements', element.originalExpression + ': ' + value);
			}));
		}));
	}
}
