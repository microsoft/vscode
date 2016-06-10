/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import lifecycle = require('vs/base/common/lifecycle');
import platform = require('vs/base/common/platform');
import DOM = require('vs/base/browser/dom');
import {TPromise} from 'vs/base/common/winjs.base';
import {Builder, Dimension} from 'vs/base/browser/builder';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ITerminalService, TERMINAL_PANEL_ID} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {Panel} from 'vs/workbench/browser/panel';
import {TerminalConfigHelper} from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import {TerminalInstance} from 'vs/workbench/parts/terminal/electron-browser/terminalInstance';

export class TerminalPanel extends Panel {

	private toDispose: lifecycle.IDisposable[] = [];
	private terminalInstances: TerminalInstance[] = [];

	private parentDomElement: HTMLElement;
	private themeStyleElement: HTMLElement;
	private configurationHelper: TerminalConfigHelper;
	private activeTerminalIndex: number;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITerminalService private terminalService: ITerminalService,
		@IThemeService private themeService: IThemeService
	) {
		super(TERMINAL_PANEL_ID, telemetryService);
	}

	public layout(dimension?: Dimension): void {
		if (this.terminalInstances.length > 0) {
			this.terminalInstances[this.activeTerminalIndex].layout(dimension);
		}
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);
		this.parentDomElement = parent.getHTMLElement();
		this.themeStyleElement = document.createElement('style');
		this.parentDomElement.appendChild(this.themeStyleElement);
		this.configurationHelper = new TerminalConfigHelper(platform.platform, this.configurationService, this.parentDomElement);
		this.toDispose.push(DOM.addDisposableListener(this.parentDomElement, 'wheel', (event: WheelEvent) => {
			this.terminalInstances[this.activeTerminalIndex].dispatchEvent(new WheelEvent(event.type, event));
		}));

		return this.createTerminal();
	}

	public createNewTerminalInstance() : TPromise<void> {
		return this.createTerminal().then(() => {
			this.updateFont();
			this.focus();
		});
	}

	public setVisible(visible: boolean): TPromise<void> {
		if (visible) {
			if (this.terminalInstances.length > 0) {
				this.updateFont();
				this.updateTheme();
			} else {
				return super.setVisible(visible).then(() => {
					this.createTerminal();
					this.updateFont();
					this.updateTheme();
					return Promise.resolve(void 0);
				});
			}
		}
		return super.setVisible(visible);
	}

	private createTerminal(): TPromise<void> {
		return new TPromise<void>(resolve => {
			this.terminalInstances.push(new TerminalInstance(this.configurationHelper.getShell(), this.parentDomElement, this.contextService, this.terminalService, this.onTerminalInstanceExit.bind(this)));
			this.setActiveTerminal(this.terminalInstances.length - 1);
			this.toDispose.push(this.themeService.onDidThemeChange(this.updateTheme.bind(this)));
			this.toDispose.push(this.configurationService.onDidUpdateConfiguration(this.updateFont.bind(this)));
			resolve(void 0);
		});
	}

	private setActiveTerminal(index: number) {
		this.activeTerminalIndex = index;
		this.terminalInstances.forEach((terminalInstance, i) => {
			terminalInstance.toggleVisibility(i === this.activeTerminalIndex);
		});
	}

	private onTerminalInstanceExit(terminalInstance: TerminalInstance): void {
		for (var i = 0; i < this.terminalInstances.length; i++) {
			if (this.terminalInstances[i] === terminalInstance) {
				if (this.activeTerminalIndex === i) {
					this.activeTerminalIndex = -1;
				} else if (this.activeTerminalIndex > i) {
					this.activeTerminalIndex--;
				}
				this.terminalInstances.splice(i, 1);
			}
		}
		this.terminalService.toggle();
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
			css += `.monaco-workbench .integrated-terminal .terminal .xterm-color-${index} { color: ${color}; }` +
				`.monaco-workbench .integrated-terminal .terminal .xterm-color-${index}::selection { background-color: ${rgba}; }` +
				`.monaco-workbench .integrated-terminal .terminal .xterm-bg-color-${index} { background-color: ${color}; }` +
				`.monaco-workbench .integrated-terminal .terminal .xterm-bg-color-${index}::selection { color: ${color}; }`;
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

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
		while (this.terminalInstances.length > 0) {
			this.terminalInstances.pop().dispose();
		}
		super.dispose();
	}
}
