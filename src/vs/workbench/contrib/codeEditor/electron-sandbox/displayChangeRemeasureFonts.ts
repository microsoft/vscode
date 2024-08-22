/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle';
import { FontMeasurements } from '../../../../editor/browser/config/fontMeasurements';
import { INativeHostService } from '../../../../platform/native/common/native';
import { Registry } from '../../../../platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from '../../../common/contributions';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle';

class DisplayChangeRemeasureFonts extends Disposable implements IWorkbenchContribution {

	constructor(
		@INativeHostService nativeHostService: INativeHostService
	) {
		super();

		this._register(nativeHostService.onDidChangeDisplay(() => {
			FontMeasurements.clearAllFontInfos();
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DisplayChangeRemeasureFonts, LifecyclePhase.Eventually);
