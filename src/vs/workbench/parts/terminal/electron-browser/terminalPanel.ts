/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import lifecycle = require('vs/base/common/lifecycle');
import platform = require('vs/base/common/platform');
import DOM = require('vs/base/browser/dom');
import {IAction} from 'vs/base/common/actions';
import {TPromise} from 'vs/base/common/winjs.base';
import {Builder, Dimension} from 'vs/base/browser/builder';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ITerminalService, TERMINAL_PANEL_ID} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {Panel} from 'vs/workbench/browser/panel';
import {TerminalConfigHelper} from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import {TerminalInstance} from 'vs/workbench/parts/terminal/electron-browser/terminalInstance';
import {CloseTerminalAction, CreateNewTerminalAction, FocusNextTerminalAction, FocusPreviousTerminalAction} from 'vs/workbench/parts/terminal/electron-browser/terminalActions';
import {ScrollableElement} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {ScrollbarVisibility} from 'vs/base/browser/ui/scrollbar/scrollableElementOptions';

export class TerminalPanel extends Panel {

	private toDispose: lifecycle.IDisposable[] = [];
	private terminalInstances: TerminalInstance[] = [];

	private actions: IAction[];
	private parentDomElement: HTMLElement;
	private tabsOuterContainer: HTMLElement;
	private tabsContainer: HTMLElement;
	private tabScrollbar: ScrollableElement;
	private terminalContainer: HTMLElement;
	private themeStyleElement: HTMLElement;
	private configurationHelper: TerminalConfigHelper;
	private activeTerminalIndex: number;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITerminalService private terminalService: ITerminalService,
		@IThemeService private themeService: IThemeService
	) {
		super(TERMINAL_PANEL_ID, telemetryService);
	}

	public layout(dimension?: Dimension): void {
		if (!dimension) {
			return;
		}
		if (this.terminalInstances.length > 0) {
			let computedStyle = window.getComputedStyle(this.tabsContainer);
			let height = dimension.height - parseInt(computedStyle.height.replace(/px/, ''), 10);
			let terminalContainerDimension = new Dimension(dimension.width, height);
			this.terminalInstances[this.activeTerminalIndex].layout(terminalContainerDimension);
		}
	}

	public getActions(): IAction[] {
		if (!this.actions) {
			this.actions = [
				this.instantiationService.createInstance(CreateNewTerminalAction, CreateNewTerminalAction.ID, CreateNewTerminalAction.LABEL),
				this.instantiationService.createInstance(CloseTerminalAction, CloseTerminalAction.ID, CloseTerminalAction.LABEL),
				this.instantiationService.createInstance(FocusPreviousTerminalAction, FocusPreviousTerminalAction.ID, FocusPreviousTerminalAction.LABEL),
				this.instantiationService.createInstance(FocusNextTerminalAction, FocusNextTerminalAction.ID, FocusNextTerminalAction.LABEL)
			];

			this.actions.forEach(a => {
				this.toDispose.push(a);
			});
		}

		return this.actions;
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);
		this.parentDomElement = parent.getHTMLElement();
		DOM.addClass(this.parentDomElement, 'integrated-terminal');
		this.themeStyleElement = document.createElement('style');
		this.tabsOuterContainer = document.createElement('div');
		DOM.addClass(this.tabsOuterContainer, 'tabs-outer-container');
		this.tabsContainer = document.createElement('ul');
		DOM.addClass(this.tabsContainer, 'tabs-container');

		// Custom Scrollbar
		this.tabScrollbar = new ScrollableElement(this.tabsContainer, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Hidden,
			scrollYToX: true,
			useShadows: false,
			canUseTranslate3d: true,
			horizontalScrollbarSize: 3
		});

		this.tabScrollbar.onScroll(e => {
			this.tabsContainer.scrollLeft = e.scrollLeft;
		});

		this.tabsOuterContainer.appendChild(this.tabScrollbar.getDomNode());

		this.terminalContainer = document.createElement('div');
		DOM.addClass(this.terminalContainer, 'terminal-outer-container');
		this.parentDomElement.appendChild(this.themeStyleElement);
		this.parentDomElement.appendChild(this.terminalContainer);
		this.parentDomElement.appendChild(this.tabsOuterContainer);

		this.configurationHelper = new TerminalConfigHelper(platform.platform, this.configurationService, this.parentDomElement);
		this.toDispose.push(DOM.addDisposableListener(this.terminalContainer, 'wheel', (event: WheelEvent) => {
			this.terminalInstances[this.activeTerminalIndex].dispatchEvent(new WheelEvent(event.type, event));
		}));

		return this.createTerminal().then(() => {
			return Promise.resolve(void 0);
		});
	}

	public createNewTerminalInstance(): TPromise<void> {
		return this.createTerminal().then(() => {
			this.updateFont();
			this.focus();
		});
	}

	public closeActiveTerminal(): TPromise<void> {
		return new TPromise<void>(resolve => {
			this.onTerminalInstanceExit(this.terminalInstances[this.activeTerminalIndex]);
		});
	}

	public setVisible(visible: boolean): TPromise<void> {
		if (visible) {
			if (this.terminalInstances.length > 0) {
				this.updateFont();
				this.updateTheme();
			} else {
				return super.setVisible(visible).then(() => {
					this.createNewTerminalInstance();
				});
			}
		}
		return super.setVisible(visible);
	}

	private createTerminal(): TPromise<TerminalInstance> {
		return new TPromise<TerminalInstance>(resolve => {
			var terminalInstance = new TerminalInstance(this.configurationHelper.getShell(), this.terminalContainer, this.contextService, this.terminalService, this.onTerminalInstanceExit.bind(this));
			this.terminalInstances.push(terminalInstance);
			this.setActiveTerminal(this.terminalInstances.length - 1);
			this.toDispose.push(this.themeService.onDidThemeChange(this.updateTheme.bind(this)));
			this.toDispose.push(this.configurationService.onDidUpdateConfiguration(this.updateFont.bind(this)));
			this.tabsContainer.appendChild(terminalInstance.getTabElement());
			resolve(terminalInstance);
		});
	}

	private setActiveTerminal(index: number) {
		this.activeTerminalIndex = index;
		this.terminalInstances.forEach((terminalInstance, i) => {
			let isActive = i === this.activeTerminalIndex;
			terminalInstance.toggleVisibility(isActive);
			DOM.toggleClass(terminalInstance.getTabElement(), 'active', isActive);
		});
	}

	private onTerminalInstanceExit(terminalInstance: TerminalInstance): void {
		for (var i = 0; i < this.terminalInstances.length; i++) {
			if (this.terminalInstances[i] === terminalInstance) {
				if (this.activeTerminalIndex > i) {
					this.activeTerminalIndex--;
				}
				let killedTerminal = this.terminalInstances.splice(i, 1)[0];
				killedTerminal.dispose();
			}
		}
		this.tabsContainer.removeChild(terminalInstance.getTabElement());
		if (this.terminalInstances.length === 0) {
			this.activeTerminalIndex = -1;
			this.terminalService.toggle();
		} else {
			this.setActiveTerminal(Math.min(this.activeTerminalIndex, this.terminalInstances.length - 1));
		}
	}

	private updateTheme(themeId?: string): void {
		if (!themeId) {
			themeId = this.themeService.getTheme();
		}
		let theme = this.configurationHelper.getTheme(themeId);

		let css = '';
		theme.forEach((color: string, index: number) => {
			// TODO: The classes could probably be reduced, it's so long to beat the specificity of the general rule.
			let rgba = this.convertHexCssColorToRgba(color, 0.996);
			css += `.monaco-workbench .panel.integrated-terminal .xterm .xterm-color-${index} { color: ${color}; }` +
				`.monaco-workbench .panel.integrated-terminal .xterm .xterm-color-${index}::selection { background-color: ${rgba}; }` +
				`.monaco-workbench .panel.integrated-terminal .xterm .xterm-bg-color-${index} { background-color: ${color}; }` +
				`.monaco-workbench .panel.integrated-terminal .xterm .xterm-bg-color-${index}::selection { color: ${color}; }`;
		});

		this.themeStyleElement.innerHTML = css;
	}

	/**
	 * Converts a CSS hex color (#rrggbb) to a CSS rgba color (rgba(r, g, b, a)).
	 */
	private convertHexCssColorToRgba(hex: string, alpha: number): string {
		let r = parseInt(hex.substr(1, 2), 16);
		let g = parseInt(hex.substr(3, 2), 16);
		let b = parseInt(hex.substr(5, 2), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	private updateFont(): void {
		if (this.terminalInstances.length === 0) {
			return;
		}
		this.terminalInstances[this.activeTerminalIndex].setFont(this.configurationHelper.getFont());
		this.layout(new Dimension(this.parentDomElement.offsetWidth, this.parentDomElement.offsetHeight));
	}

	public focus(): void {
		if (this.terminalInstances.length > 0) {
			this.terminalInstances[this.activeTerminalIndex].focus(true);
		}
	}

	public focusNext(): void {
		if (this.terminalInstances.length > 1) {
			this.activeTerminalIndex++;
			if (this.activeTerminalIndex >= this.terminalInstances.length) {
				this.activeTerminalIndex = 0;
			}
			this.setActiveTerminal(this.activeTerminalIndex);
			this.focus();
		}
	}

	public focusPrevious(): void {
		if (this.terminalInstances.length > 1) {
			this.activeTerminalIndex--;
			if (this.activeTerminalIndex < 0) {
				this.activeTerminalIndex = this.terminalInstances.length - 1;
			}
			this.setActiveTerminal(this.activeTerminalIndex);
			this.focus();
		}
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
		while (this.terminalInstances.length > 0) {
			this.terminalInstances.pop().dispose();
		}
		super.dispose();
	}
}
