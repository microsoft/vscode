/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

export class InputLatencyContrib extends Disposable implements IWorkbenchContribution {
	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
		this._register(_configurationService.onDidChangeConfiguration(() => this._refresh()));
		this._refresh();
	}

	private _refresh() {
		const value = this._configurationService.getValue<boolean>('performance.inputLatency') || false;
		if (Event.enableDefer !== value) {
			console.warn('Event.enableDefer = ', value);
			Event.enableDefer = value;
		}
	}
}
