/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { KeyCode } from 'vs/base/common/keyCodes';
import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { SelectBox, ISelectOptionItem } from 'vs/base/browser/ui/selectBox/selectBox';
import { SelectActionViewItem, IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IDebugService, IDebugSession, IDebugConfiguration } from 'vs/workbench/contrib/debug/common/debug';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachSelectBoxStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { selectBorder } from 'vs/platform/theme/common/colorRegistry';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

const $ = dom.$;

export class StartDebugActionViewItem implements IActionViewItem {

	private static readonly SEPARATOR = '─────────';

	actionRunner!: IActionRunner;
	private container!: HTMLElement;
	private start!: HTMLElement;
	private selectBox: SelectBox;
	private options: { label: string, handler?: (() => boolean) }[] = [];
	private toDispose: IDisposable[];
	private selected = 0;

	constructor(
		private context: any,
		private action: IAction,
		@IDebugService private readonly debugService: IDebugService,
		@IThemeService private readonly themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextViewService contextViewService: IContextViewService,
	) {
		this.toDispose = [];
		this.selectBox = new SelectBox([], -1, contextViewService, undefined, { ariaLabel: nls.localize('debugLaunchConfigurations', 'Debug Launch Configurations') });
		this.toDispose.push(this.selectBox);
		this.toDispose.push(attachSelectBoxStyler(this.selectBox, themeService, {
			selectBackground: SIDE_BAR_BACKGROUND
		}));

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('launch')) {
				this.updateOptions();
			}
		}));
		this.toDispose.push(this.debugService.getConfigurationManager().onDidSelectConfiguration(() => {
			this.updateOptions();
		}));
	}

	render(container: HTMLElement): void {
		this.container = container;
		dom.addClass(container, 'start-debug-action-item');
		this.start = dom.append(container, $('.icon'));
		this.start.title = this.action.label;
		this.start.setAttribute('role', 'button');
		this.start.tabIndex = 0;

		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.CLICK, () => {
			this.start.blur();
			this.actionRunner.run(this.action, this.context);
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
				this.actionRunner.run(this.action, this.context);
			}
			if (event.equals(KeyCode.RightArrow)) {
				this.selectBox.focus();
				event.stopPropagation();
			}
		}));
		this.toDispose.push(this.selectBox.onDidSelect(e => {
			const target = this.options[e.index];
			const shouldBeSelected = target.handler ? target.handler() : false;
			if (shouldBeSelected) {
				this.selected = e.index;
			} else {
				// Some select options should not remain selected https://github.com/Microsoft/vscode/issues/31526
				this.selectBox.select(this.selected);
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

	setActionContext(context: any): void {
		this.context = context;
	}

	isEnabled(): boolean {
		return true;
	}

	focus(fromRight?: boolean): void {
		if (fromRight) {
			this.selectBox.focus();
		} else {
			this.start.focus();
		}
	}

	blur(): void {
		this.container.blur();
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}

	private updateOptions(): void {
		this.selected = 0;
		this.options = [];
		const manager = this.debugService.getConfigurationManager();
		const launches = manager.getLaunches();
		const inWorkspace = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
		launches.forEach(launch =>
			launch.getConfigurationNames().forEach(name => {
				if (name === manager.selectedConfiguration.name && launch === manager.selectedConfiguration.launch) {
					this.selected = this.options.length;
				}
				const label = inWorkspace ? `${name} (${launch.name})` : name;
				this.options.push({ label, handler: () => { manager.selectConfiguration(launch, name); return true; } });
			}));

		if (this.options.length === 0) {
			this.options.push({ label: nls.localize('noConfigurations', "No Configurations"), handler: () => false });
		} else {
			this.options.push({ label: StartDebugActionViewItem.SEPARATOR, handler: undefined });
		}

		const disabledIdx = this.options.length - 1;
		launches.filter(l => !l.hidden).forEach(l => {
			const label = inWorkspace ? nls.localize("addConfigTo", "Add Config ({0})...", l.name) : nls.localize('addConfiguration', "Add Configuration...");
			this.options.push({
				label, handler: () => {
					this.commandService.executeCommand('debug.addConfiguration', l.uri.toString());
					return false;
				}
			});
		});

		this.selectBox.setOptions(this.options.map((data, index) => <ISelectOptionItem>{ text: data.label, isDisabled: (index === disabledIdx ? true : undefined) }), this.selected);
	}
}

export class FocusSessionActionViewItem extends SelectActionViewItem {
	constructor(
		action: IAction,
		@IDebugService protected readonly debugService: IDebugService,
		@IThemeService themeService: IThemeService,
		@IContextViewService contextViewService: IContextViewService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(null, action, [], -1, contextViewService, { ariaLabel: nls.localize('debugSession', 'Debug Session') });

		this._register(attachSelectBoxStyler(this.selectBox, themeService));

		this._register(this.debugService.getViewModel().onDidFocusSession(() => {
			const session = this.debugService.getViewModel().focusedSession;
			if (session) {
				const index = this.getSessions().indexOf(session);
				this.select(index);
			}
		}));

		this._register(this.debugService.onDidNewSession(() => this.update()));
		this._register(this.debugService.onDidEndSession(() => this.update()));

		this.update();
	}

	protected getActionContext(_: string, index: number): any {
		return this.debugService.getModel().getSessions()[index];
	}

	private update() {
		const session = this.debugService.getViewModel().focusedSession;
		const sessions = this.getSessions();
		const names = sessions.map(s => {
			const label = s.getLabel();
			if (s.parentSession) {
				// Indent child sessions so they look like children
				return `\u00A0\u00A0${label}`;
			}

			return label;
		});
		this.setOptions(names.map(data => <ISelectOptionItem>{ text: data }), session ? sessions.indexOf(session) : undefined);
	}

	protected getSessions(): ReadonlyArray<IDebugSession> {
		const showSubSessions = this.configurationService.getValue<IDebugConfiguration>('debug').showSubSessionsInToolBar;
		const sessions = this.debugService.getModel().getSessions();

		return showSubSessions ? sessions : sessions.filter(s => !s.parentSession);
	}
}
