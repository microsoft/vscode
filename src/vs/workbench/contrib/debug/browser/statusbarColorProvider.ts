/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ColorTransformType, asCssVariable, asCssVariableName, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService, State, IDebugSession, IDebugConfiguration } from 'vs/workbench/contrib/debug/common/debug';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { STATUS_BAR_FOREGROUND, STATUS_BAR_BORDER, COMMAND_CENTER_BACKGROUND } from 'vs/workbench/common/theme';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IStatusbarService } from 'vs/workbench/services/statusbar/browser/statusbar';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';


// colors for theming

export const STATUS_BAR_DEBUGGING_BACKGROUND = registerColor('statusBar.debuggingBackground', {
	dark: '#CC6633',
	light: '#CC6633',
	hcDark: '#BA592C',
	hcLight: '#B5200D'
}, localize('statusBarDebuggingBackground', "Status bar background color when a program is being debugged. The status bar is shown in the bottom of the window"));

export const STATUS_BAR_DEBUGGING_FOREGROUND = registerColor('statusBar.debuggingForeground', {
	dark: STATUS_BAR_FOREGROUND,
	light: STATUS_BAR_FOREGROUND,
	hcDark: STATUS_BAR_FOREGROUND,
	hcLight: '#FFFFFF'
}, localize('statusBarDebuggingForeground', "Status bar foreground color when a program is being debugged. The status bar is shown in the bottom of the window"));

export const STATUS_BAR_DEBUGGING_BORDER = registerColor('statusBar.debuggingBorder', {
	dark: STATUS_BAR_BORDER,
	light: STATUS_BAR_BORDER,
	hcDark: STATUS_BAR_BORDER,
	hcLight: STATUS_BAR_BORDER
}, localize('statusBarDebuggingBorder', "Status bar border color separating to the sidebar and editor when a program is being debugged. The status bar is shown in the bottom of the window"));

export const COMMAND_CENTER_DEBUGGING_BACKGROUND = registerColor(
	'commandCenter.debuggingBackground',
	{
		dark: { value: STATUS_BAR_DEBUGGING_BACKGROUND, op: ColorTransformType.Transparent, factor: 0.258 },
		hcDark: { value: STATUS_BAR_DEBUGGING_BACKGROUND, op: ColorTransformType.Transparent, factor: 0.258 },
		light: { value: STATUS_BAR_DEBUGGING_BACKGROUND, op: ColorTransformType.Transparent, factor: 0.258 },
		hcLight: { value: STATUS_BAR_DEBUGGING_BACKGROUND, op: ColorTransformType.Transparent, factor: 0.258 }
	},
	localize('commandCenter-activeBackground', "Command center background color when a program is being debugged"),
	true
);

export class StatusBarColorProvider implements IWorkbenchContribution {

	private readonly disposables = new DisposableStore();
	private disposable: IDisposable | undefined;

	private set enabled(enabled: boolean) {
		if (enabled === !!this.disposable) {
			return;
		}

		if (enabled) {
			this.disposable = this.statusbarService.overrideStyle({
				priority: 10,
				foreground: STATUS_BAR_DEBUGGING_FOREGROUND,
				background: STATUS_BAR_DEBUGGING_BACKGROUND,
				border: STATUS_BAR_DEBUGGING_BORDER,
			});
		} else {
			this.disposable!.dispose();
			this.disposable = undefined;
		}
	}

	constructor(
		@IDebugService private readonly debugService: IDebugService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		this.debugService.onDidChangeState(this.update, this, this.disposables);
		this.contextService.onDidChangeWorkbenchState(this.update, this, this.disposables);
		this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('debug.enableStatusBarColor') || e.affectsConfiguration('debug.toolBarLocation')) {
				this.update();
			}
		});
		this.update();
	}

	protected update(): void {
		const debugConfig = this.configurationService.getValue<IDebugConfiguration>('debug');
		const isInDebugMode = isStatusbarInDebugMode(this.debugService.state, this.debugService.getModel().getSessions());
		if (!debugConfig.enableStatusBarColor) {
			this.enabled = false;
		} else {
			this.enabled = isInDebugMode;
		}

		const isInCommandCenter = debugConfig.toolBarLocation === 'commandCenter';
		this.layoutService.container.style.setProperty(asCssVariableName(COMMAND_CENTER_BACKGROUND), isInCommandCenter && isInDebugMode
			? asCssVariable(COMMAND_CENTER_DEBUGGING_BACKGROUND)
			: ''
		);

	}

	dispose(): void {
		this.disposable?.dispose();
		this.disposables.dispose();
	}
}

export function isStatusbarInDebugMode(state: State, sessions: IDebugSession[]): boolean {
	if (state === State.Inactive || state === State.Initializing || sessions.every(s => s.suppressDebugStatusbar || s.configuration?.noDebug)) {
		return false;
	}

	return true;
}
