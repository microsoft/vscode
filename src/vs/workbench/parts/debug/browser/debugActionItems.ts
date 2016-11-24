/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import errors = require('vs/base/common/errors');
import { IAction } from 'vs/base/common/actions';
import { SelectActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDebugService, IGlobalConfig, NO_CONFIGURATIONS_LABEL } from 'vs/workbench/parts/debug/common/debug';

export class SelectConfigurationActionItem extends SelectActionItem {

	constructor(
		action: IAction,
		@IDebugService private debugService: IDebugService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(null, action, [], -1);

		this.toDispose.push(configurationService.onDidUpdateConfiguration(e => {
			this.updateOptions(true);
		}));
		this.toDispose.push(this.debugService.getViewModel().onDidSelectConfigurationName(name => {
			this.updateOptions(false);
		}));
	}

	public render(container: HTMLElement): void {
		super.render(container);
		this.updateOptions(true);
	}

	private updateOptions(changeDebugConfiguration: boolean): void {
		const config = this.configurationService.getConfiguration<IGlobalConfig>('launch');
		if (!config || !config.configurations || config.configurations.length === 0) {
			this.setOptions([NO_CONFIGURATIONS_LABEL], 0);
		} else {
			const options = config.configurations.filter(cfg => !!cfg.name).map(cfg => cfg.name);
			if (config.compounds) {
				options.push(...config.compounds.filter(compound => !!compound.name).map(compound => compound.name));
			}

			const selected = options.indexOf(this.debugService.getViewModel().selectedConfigurationName);
			this.setOptions(options, selected);
		}

		if (changeDebugConfiguration) {
			this.actionRunner.run(this._action, this.getSelected()).done(null, errors.onUnexpectedError);
		}
	}
}

export class FocusProcessActionItem extends SelectActionItem {
	constructor(
		action: IAction,
		@IDebugService private debugService: IDebugService
	) {
		super(null, action, [], -1);

		this.debugService.getViewModel().onDidFocusProcess(p => {
			const names = this.debugService.getModel().getProcesses().map(p => p.name);
			this.setOptions(names, p ? names.indexOf(p.name) : 0);
		});
	}
}
