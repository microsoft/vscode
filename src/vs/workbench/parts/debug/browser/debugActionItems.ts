/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import {TPromise} from 'vs/base/common/winjs.base';
import {IAction} from 'vs/base/common/actions';
import {SelectActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {IDebugService} from 'vs/workbench/parts/debug/common/debug';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';

export class DebugSelectActionItem extends SelectActionItem {

	constructor(
		action: IAction,
		@IDebugService private debugService: IDebugService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(null, action, [], -1);

		this.registerConfigurationListeners(configurationService);
	}

	private registerConfigurationListeners(configurationService: IConfigurationService): void {
		this.toDispose.push(configurationService.onDidUpdateConfiguration(e => {
			this.updateOptions(true).done(null, errors.onUnexpectedError);
		}));
		this.toDispose.push(this.debugService.getConfigurationManager().onDidConfigurationChange(name => {
			this.updateOptions(false).done(null, errors.onUnexpectedError);
		}));
	}

	public render(container: HTMLElement): void {
		super.render(container);
		this.updateOptions(true).done(null, errors.onUnexpectedError);
	}

	private updateOptions(changeDebugConfiguration: boolean): TPromise<any> {
		const configurationManager = this.debugService.getConfigurationManager();
		return configurationManager.loadLaunchConfig().then(config => {
			if (!config || !config.configurations || config.configurations.length === 0) {
				this.setOptions([nls.localize('noConfigurations', "No Configurations")], 0);
				return changeDebugConfiguration ? this.actionRunner.run(this._action, null) : null;
			}

			const configurationNames = config.configurations.filter(cfg => !!cfg.name).map(cfg => cfg.name);
			const configurationName = configurationManager.configuration ? configurationManager.configuration.name : null;
			let selected = configurationNames.indexOf(configurationName);

			this.setOptions(configurationNames, selected);
			if (changeDebugConfiguration) {
				return this.actionRunner.run(this._action, this.getSelected());
			}
		});
	}
}
