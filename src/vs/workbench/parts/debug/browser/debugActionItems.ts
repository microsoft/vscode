/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lifecycle from 'vs/base/common/lifecycle';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import * as dom from 'vs/base/browser/dom';
import { SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import { SelectActionItem, IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDebugService, IGlobalConfig, NO_CONFIGURATIONS_LABEL, State } from 'vs/workbench/parts/debug/common/debug';

const $ = dom.$;

export class StartDebugActionItem extends EventEmitter implements IActionItem {

	public actionRunner: IActionRunner;
	private container: HTMLElement;
	private nameContainer: HTMLElement;
	private selectBox: SelectBox;
	private toDispose: lifecycle.IDisposable[];

	constructor(
		private context: any,
		private action: IAction,
		@IDebugService private debugService: IDebugService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super();
		this.toDispose = [];
		this.selectBox = new SelectBox([], -1);
		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => {
			this.updateOptions();
			this.nameContainer.textContent = this.debugService.getViewModel().selectedConfigurationName;
		}));
		this.toDispose.push(this.selectBox.onDidSelect(configurationName => {
			this.debugService.getViewModel().setSelectedConfigurationName(configurationName);
			this.nameContainer.textContent = configurationName;
		}));
	}

	public render(container: HTMLElement): void {
		this.container = container;
		dom.addClass(container, 'start-debug-action-item');
		const debugStartContainer = dom.append(container, $('.start-debug'));
		dom.append(debugStartContainer, $('.icon'));
		this.nameContainer = dom.append(debugStartContainer, $('.name'));
		this.nameContainer.textContent = this.debugService.getViewModel().selectedConfigurationName;

		this.toDispose.push(dom.addDisposableListener(debugStartContainer, 'click', () => {
			this.actionRunner.run(this.action, this.context);
		}));

		this.selectBox.render(dom.append(container, $('.configuration')));
		this.updateOptions();
	}

	public setActionContext(context: any): void {
		this.context = context;
	}

	public isEnabled(): boolean {
		return this.debugService.state !== State.Inactive;
	}

	public focus(): void {
		this.container.focus();
	}

	public blur(): void {
		this.container.blur();
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
	}

	private updateOptions(): void {
		const config = this.configurationService.getConfiguration<IGlobalConfig>('launch');
		if (!config || !config.configurations || config.configurations.length === 0) {
			this.selectBox.setOptions([NO_CONFIGURATIONS_LABEL], 0);
		} else {
			const options = config.configurations.filter(cfg => !!cfg.name).map(cfg => cfg.name);
			if (config.compounds) {
				options.push(...config.compounds.filter(compound => !!compound.name).map(compound => compound.name));
			}

			const selected = options.indexOf(this.debugService.getViewModel().selectedConfigurationName);
			this.selectBox.setOptions(options, selected);
		}

		this.debugService.getViewModel().setSelectedConfigurationName(this.selectBox.getSelected());
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
