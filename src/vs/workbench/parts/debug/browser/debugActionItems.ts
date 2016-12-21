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
import { IDebugService, NO_CONFIGURATIONS_LABEL } from 'vs/workbench/parts/debug/common/debug';

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
			if (e.sourceConfig.launch) {
				this.updateOptions();
			}
		}));
		this.toDispose.push(this.selectBox.onDidSelect(configurationName => {
			this.debugService.getViewModel().setSelectedConfigurationName(configurationName);
		}));
	}

	public render(container: HTMLElement): void {
		this.container = container;
		dom.addClass(container, 'start-debug-action-item');
		const icon = dom.append(container, $('.icon'));
		icon.title = this.action.label;
		icon.tabIndex = 0;

		this.toDispose.push(dom.addDisposableListener(icon, dom.EventType.CLICK, () => {
			icon.blur();
			this.actionRunner.run(this.action, this.context).done(null, errors.onUnexpectedError);
		}));

		this.toDispose.push(dom.addDisposableListener(icon, dom.EventType.MOUSE_DOWN, () => {
			if (this.selectBox.enabled) {
				dom.addClass(icon, 'active');
			}
		}));
		this.toDispose.push(dom.addDisposableListener(icon, dom.EventType.MOUSE_UP, () => {
			dom.removeClass(icon, 'active');
		}));
		this.toDispose.push(dom.addDisposableListener(icon, dom.EventType.MOUSE_OUT, () => {
			dom.removeClass(icon, 'active');
		}));

		this.toDispose.push(dom.addDisposableListener(icon, dom.EventType.KEY_UP, (e: KeyboardEvent) => {
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
		return this.selectBox.enabled;
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

	private setEnabled(enabled: boolean): void {
		this.selectBox.enabled = enabled;
		if (!enabled) {
			this.selectBox.setOptions([NO_CONFIGURATIONS_LABEL], 0);
		}
	}

	private updateOptions(): void {
		const options = this.debugService.getConfigurationManager().getConfigurationNames();
		if (options.length === 0) {
			this.setEnabled(false);
		} else {
			this.setEnabled(true);
			const selected = options.indexOf(this.debugService.getViewModel().selectedConfigurationName);
			this.selectBox.setOptions(options, selected);
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
