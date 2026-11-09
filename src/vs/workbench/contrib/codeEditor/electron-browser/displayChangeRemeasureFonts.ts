/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThrottledDelayer } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { FontMeasurements } from '../../../../editor/browser/config/fontMeasurements.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

class DisplayChangeRemeasureFonts extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.displayChangeRemeasureFonts';

	private readonly _delayer = this._register(new ThrottledDelayer(2000));

	constructor(
		@INativeHostService nativeHostService: INativeHostService
	) {
		super();

		this._register(nativeHostService.onDidChangeDisplay(() => {
			this._delayer.trigger(() => {
				FontMeasurements.clearAllFontInfos();
				return Promise.resolve();
			});
		}));
	}
}

registerWorkbenchContribution2(DisplayChangeRemeasureFonts.ID, DisplayChangeRemeasureFonts, WorkbenchPhase.Eventually);
