/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
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
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IDebugService } from 'vs/workbench/parts/debug/common/debug';
import { IThemeService } from "vs/platform/theme/common/themeService";
import { attachSelectBoxStyler } from "vs/platform/theme/common/styler";
import { SIDE_BAR_BACKGROUND } from "vs/workbench/common/theme";

const $ = dom.$;

export class StartDebugActionItem extends EventEmitter implements IActionItem {

	private static ADD_CONFIGURATION = nls.localize('addConfiguration', "Add Configuration...");
	private static SEPARATOR = '─────────';

	public actionRunner: IActionRunner;
	private container: HTMLElement;
	private start: HTMLElement;
	private selectBox: SelectBox;
	private toDispose: lifecycle.IDisposable[];

	constructor(
		private context: any,
		private action: IAction,
		@IDebugService private debugService: IDebugService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ICommandService private commandService: ICommandService
	) {
		super();
		this.toDispose = [];
		this.selectBox = new SelectBox([], -1);
		this.toDispose.push(attachSelectBoxStyler(this.selectBox, themeService, {
			selectBackground: SIDE_BAR_BACKGROUND
		}));

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => {
			if (e.sourceConfig.launch) {
				this.updateOptions();
			}
		}));
		this.toDispose.push(this.selectBox.onDidSelect(configurationName => {
			if (configurationName === StartDebugActionItem.ADD_CONFIGURATION) {
				this.selectBox.select(this.debugService.getConfigurationManager().getConfigurationNames().indexOf(this.debugService.getViewModel().selectedConfigurationName));
				this.commandService.executeCommand('debug.addConfiguration').done(undefined, errors.onUnexpectedError);
			} else {
				this.debugService.getViewModel().setSelectedConfigurationName(configurationName);
			}
		}));
		this.toDispose.push(this.debugService.getViewModel().onDidSelectConfiguration(configurationName => {
			const manager = this.debugService.getConfigurationManager();
			this.selectBox.select(manager.getConfigurationNames().indexOf(configurationName));
		}));
	}

	public render(container: HTMLElement): void {
		this.container = container;
		dom.addClass(container, 'start-debug-action-item');
		this.start = dom.append(container, $('.icon'));
		this.start.title = this.action.label;
		this.start.tabIndex = 0;

		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.CLICK, () => {
			this.start.blur();
			this.actionRunner.run(this.action, this.context).done(null, errors.onUnexpectedError);
		}));

		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (this.action.enabled && e.button === 0) {
				dom.addClass(this.start, 'active');
			}
		}));
		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_UP, () => {
			dom.removeClass(this.start, 'active');
		}));
		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_OUT, () => {
			dom.removeClass(this.start, 'active');
		}));

		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter)) {
				this.actionRunner.run(this.action, this.context).done(null, errors.onUnexpectedError);
			}
			if (event.equals(KeyCode.RightArrow)) {
				this.selectBox.focus();
				event.stopPropagation();
			}
		}));

		const selectBoxContainer = $('.configuration');
		this.selectBox.render(dom.append(container, selectBoxContainer));
		this.toDispose.push(dom.addDisposableListener(selectBoxContainer, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.LeftArrow)) {
				this.start.focus();
				event.stopPropagation();
			}
		}));

		this.updateOptions();
	}

	public setActionContext(context: any): void {
		this.context = context;
	}

	public isEnabled(): boolean {
		return true;
	}

	public focus(fromRight?: boolean): void {
		if (fromRight) {
			this.selectBox.focus();
		} else {
			this.start.focus();
		}
	}

	public blur(): void {
		this.container.blur();
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
	}

	private updateOptions(): void {
		const options = this.debugService.getConfigurationManager().getConfigurationNames();
		if (options.length === 0) {
			options.push(nls.localize('noConfigurations', "No Configurations"));
		}
		const selected = options.indexOf(this.debugService.getViewModel().selectedConfigurationName);
		options.push(StartDebugActionItem.SEPARATOR);
		options.push(StartDebugActionItem.ADD_CONFIGURATION);
		this.selectBox.setOptions(options, selected, options.length - 2);
	}
}

export class FocusProcessActionItem extends SelectActionItem {
	constructor(
		action: IAction,
		@IDebugService private debugService: IDebugService,
		@IThemeService themeService: IThemeService
	) {
		super(null, action, [], -1);

		this.toDispose.push(attachSelectBoxStyler(this.selectBox, themeService));

		this.debugService.getViewModel().onDidFocusStackFrame(() => {
			const process = this.debugService.getViewModel().focusedProcess;
			if (process) {
				const names = this.debugService.getModel().getProcesses().map(p => p.name);
				this.select(names.indexOf(process.name));
			}
		});

		this.debugService.getModel().onDidChangeCallStack(() => {
			const process = this.debugService.getViewModel().focusedProcess;
			const names = this.debugService.getModel().getProcesses().map(p => p.name);
			this.setOptions(names, process ? names.indexOf(process.name) : undefined);
		});
	}
}
