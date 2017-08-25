/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { localize } from 'vs/nls';
import { registerColor, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { IDebugService, State } from 'vs/workbench/parts/debug/common/debug';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { STATUS_BAR_NO_FOLDER_BACKGROUND, STATUS_BAR_NO_FOLDER_FOREGROUND, STATUS_BAR_BACKGROUND, Themable, STATUS_BAR_FOREGROUND, STATUS_BAR_NO_FOLDER_BORDER, STATUS_BAR_BORDER } from 'vs/workbench/common/theme';
import { addClass, removeClass } from 'vs/base/browser/dom';

// colors for theming

export const STATUS_BAR_DEBUGGING_BACKGROUND = registerColor('statusBar.debuggingBackground', {
	dark: '#CC6633',
	light: '#CC6633',
	hc: '#CC6633'
}, localize('statusBarDebuggingBackground', "Status bar background color when a program is being debugged. The status bar is shown in the bottom of the window"));

export const STATUS_BAR_DEBUGGING_FOREGROUND = registerColor('statusBar.debuggingForeground', {
	dark: STATUS_BAR_FOREGROUND,
	light: STATUS_BAR_FOREGROUND,
	hc: STATUS_BAR_FOREGROUND
}, localize('statusBarDebuggingForeground', "Status bar foreground color when a program is being debugged. The status bar is shown in the bottom of the window"));

export const STATUS_BAR_DEBUGGING_BORDER = registerColor('statusBar.debuggingBorder', {
	dark: STATUS_BAR_BORDER,
	light: STATUS_BAR_BORDER,
	hc: STATUS_BAR_BORDER
}, localize('statusBarDebuggingBorder', "Status bar border color separating to the sidebar and editor when a program is being debugged. The status bar is shown in the bottom of the window"));

export class StatusBarColorProvider extends Themable implements IWorkbenchContribution {
	private static ID = 'debug.statusbarColorProvider';

	constructor(
		@IThemeService themeService: IThemeService,
		@IDebugService private debugService: IDebugService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IPartService private partService: IPartService
	) {
		super(themeService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.debugService.onDidChangeState(state => this.updateStyles()));
		this.toUnbind.push(this.contextService.onDidChangeWorkspaceRoots(state => this.updateStyles()));
	}

	protected updateStyles(): void {
		super.updateStyles();

		const container = this.partService.getContainer(Parts.STATUSBAR_PART);
		if (this.isDebugging()) {
			addClass(container, 'debugging');
		} else {
			removeClass(container, 'debugging');
		}

		container.style.backgroundColor = this.getColor(this.getColorKey(STATUS_BAR_NO_FOLDER_BACKGROUND, STATUS_BAR_DEBUGGING_BACKGROUND, STATUS_BAR_BACKGROUND));
		container.style.color = this.getColor(this.getColorKey(STATUS_BAR_NO_FOLDER_FOREGROUND, STATUS_BAR_DEBUGGING_FOREGROUND, STATUS_BAR_FOREGROUND));

		const borderColor = this.getColor(this.getColorKey(STATUS_BAR_NO_FOLDER_BORDER, STATUS_BAR_DEBUGGING_BORDER, STATUS_BAR_BORDER)) || this.getColor(contrastBorder);
		container.style.borderTopWidth = borderColor ? '1px' : null;
		container.style.borderTopStyle = borderColor ? 'solid' : null;
		container.style.borderTopColor = borderColor;
	}

	private getColorKey(noFolderColor: string, debuggingColor: string, normalColor: string): string {

		// Not debugging
		if (!this.isDebugging()) {
			if (this.contextService.hasWorkspace()) {
				return normalColor;
			}

			return noFolderColor;
		}

		// Debugging
		return debuggingColor;
	}

	private isDebugging(): boolean {
		if (this.debugService.state === State.Inactive) {
			return false;
		}

		if (this.isRunningWithoutDebug()) {
			return false;
		}

		return true;
	}

	private isRunningWithoutDebug(): boolean {
		const process = this.debugService.getViewModel().focusedProcess;

		return process && process.configuration && process.configuration.noDebug;
	}

	public getId(): string {
		return StatusBarColorProvider.ID;
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const statusBarItemDebuggingForeground = theme.getColor(STATUS_BAR_DEBUGGING_FOREGROUND);
	if (statusBarItemDebuggingForeground) {
		collector.addRule(`.monaco-workbench > .part.statusbar.debugging > .statusbar-item .mask-icon { background-color: ${statusBarItemDebuggingForeground} !important; }`);
	}
});