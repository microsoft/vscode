/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThrottledDelayer } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { FontMeasurements } from '../../../../editor/browser/config/fontMeasurements.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';

class DisplayChangeRemeasureFonts extends Disposable implements IWorkbenchContribution {

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

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DisplayChangeRemeasureFonts, LifecyclePhase.Eventually);
