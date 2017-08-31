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
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IDebugService } from 'vs/workbench/parts/debug/common/debug';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachSelectBoxStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { selectBorder } from 'vs/platform/theme/common/colorRegistry';

const $ = dom.$;

export class StartDebugActionItem extends EventEmitter implements IActionItem {

	private static SEPARATOR = '─────────';

	public actionRunner: IActionRunner;
	private container: HTMLElement;
	private start: HTMLElement;
	private selectBox: SelectBox;
	private options: { label: string, handler: (() => boolean) }[];
	private toDispose: lifecycle.IDisposable[];
	private selected: number;

	constructor(
		private context: any,
		private action: IAction,
		@IDebugService private debugService: IDebugService,
		@IThemeService private themeService: IThemeService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ICommandService private commandService: ICommandService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
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
		this.toDispose.push(this.selectBox.onDidSelect(e => {
			if (this.options[e.index].handler()) {
				this.selected = e.index;
			} else {
				// Some select options should not remain selected https://github.com/Microsoft/vscode/issues/31526
				this.selectBox.select(this.selected);
			}
		}));
		this.toDispose.push(this.debugService.getConfigurationManager().onDidSelectConfiguration(() => {
			this.updateOptions();
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
		this.toDispose.push(attachStylerCallback(this.themeService, { selectBorder }, colors => {
			this.container.style.border = colors.selectBorder ? `1px solid ${colors.selectBorder}` : null;
			selectBoxContainer.style.borderLeft = colors.selectBorder ? `1px solid ${colors.selectBorder}` : null;
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
		this.selected = 0;
		this.options = [];
		const manager = this.debugService.getConfigurationManager();
		const launches = manager.getLaunches();
		manager.getLaunches().forEach(launch =>
			launch.getConfigurationNames().forEach(name => {
				if (name === manager.selectedName && launch === manager.selectedLaunch) {
					this.selected = this.options.length;
				}
				const label = launches.length > 1 ? `${name} (${launch.name})` : name;
				this.options.push({ label, handler: () => { manager.selectConfiguration(launch, name); return true; } });
			}));

		if (this.options.length === 0) {
			this.options.push({ label: nls.localize('noConfigurations', "No Configurations"), handler: () => false });
		}
		this.options.push({ label: StartDebugActionItem.SEPARATOR, handler: undefined });

		const disabledIdx = this.options.length - 1;
		launches.forEach(l => {
			const label = launches.length > 1 ? nls.localize("addConfigTo", "Add Config ({0})...", l.name) : nls.localize('addConfiguration', "Add Configuration...");
			this.options.push({
				label, handler: () => {
					this.commandService.executeCommand('debug.addConfiguration', l.workspaceUri.toString()).done(undefined, errors.onUnexpectedError);
					return false;
				}
			});
		});

		this.selectBox.setOptions(this.options.map(data => data.label), this.selected, disabledIdx);
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
				const index = this.debugService.getModel().getProcesses().indexOf(process);
				this.select(index);
			}
		});

		this.debugService.getModel().onDidChangeCallStack(() => this.update());
		this.update();
	}

	private update() {
		const process = this.debugService.getViewModel().focusedProcess;
		const processes = this.debugService.getModel().getProcesses();
		const showRootName = this.debugService.getConfigurationManager().getLaunches().length > 1;
		const names = processes.map(p => p.getName(showRootName));
		this.setOptions(names, process ? processes.indexOf(process) : undefined);
	}
}
