/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { Disposable, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ILogService } from 'vs/platform/log/common/log';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class DebugWatchAccessibilityAnnouncer extends Disposable implements IWorkbenchContribution {
	static ID = 'workbench.contrib.debugWatchAccessibilityAnnouncer';
	private readonly _listener: MutableDisposable<IDisposable> = this._register(new MutableDisposable());
	constructor(
		@IDebugService private readonly _debugService: IDebugService,
		@ILogService private readonly _logService: ILogService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
		this._setListener();
		this._register(_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('accessibility.debugWatchVariableAnnouncements')) {
				this._setListener();
			}
		}));
	}

	private _setListener(): void {
		const value = this._configurationService.getValue('accessibility.debugWatchVariableAnnouncements');
		if (value && !this._listener.value) {
			this._listener.value = this._debugService.getModel().onDidChangeWatchExpressionValue((e) => {
				if (!e || e.value === 'not available') {
					return;
				}

				// TODO: get user feedback, perhaps setting to configure verbosity + whether value, name, neither, or both are announced
				this._accessibilityService.alert(`${e.name} = ${e.value}`);
				this._logService.trace(`debugAccessibilityAnnouncerValueChanged ${e.name} ${e.value}`);
			});
		} else {
			this._listener.clear();
		}
	}
}
