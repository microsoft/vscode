/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDebugService } from './debug.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Expression } from './debugModel.js';

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
				if (!e || e.value === Expression.DEFAULT_VALUE) {
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
