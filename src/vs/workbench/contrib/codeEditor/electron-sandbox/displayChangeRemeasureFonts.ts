/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Disposable } from 'vs/base/common/lifecycle';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { clearAllFontInfos } from 'vs/editor/browser/config/configuration';

class DisplayChangeRemeasureFonts extends Disposable implements IWorkbenchContribution {

	constructor(
		@INativeHostService nativeHostService: INativeHostService
	) {
		super();

		this._register(nativeHostService.onDidChangeDisplay(() => {
			clearAllFontInfos();
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DisplayChangeRemeasureFonts, LifecyclePhase.Eventually);
