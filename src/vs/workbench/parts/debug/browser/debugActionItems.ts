/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lifecycle from 'vs/base/common/lifecycle';
import * as errors from 'vs/base/common/errors';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { KeyCode } from 'vs/base/common/keyCodes';
import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import { SelectActionItem, IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDebugService, IGlobalConfig, NO_CONFIGURATIONS_LABEL, State } from 'vs/workbench/parts/debug/common/debug';

const $ = dom.$;

export class StartDebugActionItem extends EventEmitter implements IActionItem {

	public actionRunner: IActionRunner;
	private container: HTMLElement;
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
		}));
		this.toDispose.push(this.selectBox.onDidSelect(configurationName => {
			this.debugService.getViewModel().setSelectedConfigurationName(configurationName);
			this.actionRunner.run(this.action).done(null, errors.onUnexpectedError);
		}));
	}

	public render(container: HTMLElement): void {
		this.container = container;
		this.container.tabIndex = 0;
		dom.addClass(container, 'start-debug-action-item');
		const icon = dom.append(container, $('.icon'));
		icon.title = this.action.label;
		icon.tabIndex = 0;

		this.toDispose.push(dom.addDisposableListener(icon, 'click', () => {
			this.actionRunner.run(this.action, this.context).done(null, errors.onUnexpectedError);
		}));
		this.toDispose.push(dom.addDisposableListener(icon, 'keyup', (e: KeyboardEvent) => {
			let event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter)) {
				this.actionRunner.run(this.action, this.context).done(null, errors.onUnexpectedError);
			}
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
			this.selectBox.enabled = false;
		} else {
			const options = config.configurations.filter(cfg => typeof cfg.name === 'string').map(cfg => cfg.name);
			if (config.compounds) {
				options.push(...config.compounds.filter(compound => typeof compound.name === 'string' && compound.configurations && compound.configurations.length)
					.map(compound => compound.name));
			}

			const selected = options.indexOf(this.debugService.getViewModel().selectedConfigurationName);
			this.selectBox.setOptions(options, selected);
			this.selectBox.enabled = true;
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
