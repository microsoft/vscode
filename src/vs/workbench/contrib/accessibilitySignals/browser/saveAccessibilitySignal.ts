/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { SaveReason } from '../../../common/editor.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';

export class SaveAccessibilitySignalContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.saveAccessibilitySignal';

	constructor(
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IWorkingCopyService private readonly _workingCopyService: IWorkingCopyService,
	) {
		super();
		this._register(this._workingCopyService.onDidSave(e => this._accessibilitySignalService.playSignal(AccessibilitySignal.save, { userGesture: e.reason === SaveReason.EXPLICIT })));
	}
}
