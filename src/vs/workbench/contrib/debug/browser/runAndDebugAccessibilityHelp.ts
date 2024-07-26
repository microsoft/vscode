/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Disposable } from 'vs/base/common/lifecycle';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { AccessibilityHelpNLS } from 'vs/editor/common/standaloneStrings';

export class RunAndDebugAccessibilityHelp implements IAccessibleViewImplentation {
	priority = 120;
	name = 'runAndDebugHelp';
	when = ContextKeyExpr.equals('activeViewlet', 'workbench.view.debug');
	type: AccessibleViewType = AccessibleViewType.Help;
	getProvider(accessor: ServicesAccessor) {
		return new RunAndDebugAccessibilityHelpProvider(accessor.get(ICommandService), accessor.get(IViewsService));
	}
}

class RunAndDebugAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	public readonly id = AccessibleViewProviderId.RunAndDebug;
	public readonly verbositySettingKey = AccessibilityVerbositySettingId.Debug;
	public readonly options = { type: AccessibleViewType.Help };
	private _focusedView: string | undefined;
	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IViewsService private readonly _viewsService: IViewsService
	) {
		super();
		this._focusedView = this._viewsService.getFocusedViewName();
	}

	public onClose(): void {
		switch (this._focusedView) {
			case 'Watch':
				this._commandService.executeCommand('workbench.debug.action.focusWatchView');
				break;
			case 'Variables':
				this._commandService.executeCommand('workbench.debug.action.focusVariablesView');
				break;
			case 'Call Stack':
				this._commandService.executeCommand('workbench.debug.action.focusCallStackView');
				break;
			case 'Breakpoints':
				this._commandService.executeCommand('workbench.debug.action.focusBreakpointsView');
				break;
			default:
				this._commandService.executeCommand('workbench.view.debug');
		}
	}

	public provideContent(): string {
		return [
			localize('debug.showRunAndDebug', "The Show Run and Debug view command{0} will open the current view.", '<keybinding:workbench.view.debug>'),
			localize('debug.startDebugging', "The Debug: Start Debugging command{0} will start a debug session.", '<keybinding:workbench.action.debug.start>'),
			AccessibilityHelpNLS.setBreakpoint,
			localize('onceDebugging', "Once debugging, the following commands will be available:"),
			localize('debug.continue', "- Debug: Continue command{0} will continue execution until the next breakpoint.", '<keybinding:workbench.action.debug.continue>'),
			localize('debug.stepInto', "- Debug: Step Into command{0} will step into the next function call.", '<keybinding:workbench.action.debug.stepInto>'),
			localize('debug.stepOver', "- Debug: Step Over command{0} will step over the current function call.", '<keybinding:workbench.action.debug.stepOver>'),
			localize('debug.stepOut', "- Debug: Step Out command{0} will step out of the current function call.", '<keybinding:workbench.action.debug.stepOut>'),
			localize('debug.views', 'The debug viewlet is comprised of several views that can be focused with the following commands or navigated to via tab then arrow keys:'),
			localize('debug.focusBreakpoints', "- Debug: Focus Breakpoints View command{0} will focus the breakpoints view.", '<keybinding:workbench.debug.action.focusBreakpointsView>'),
			localize('debug.focusCallStack', "- Debug: Focus Call Stack View command{0} will focus the call stack view.", '<keybinding:workbench.debug.action.focusCallStackView>'),
			localize('debug.focusVariables', "- Debug: Focus Variables View command{0} will focus the variables view.", '<keybinding:workbench.debug.action.focusVariablesView>'),
			localize('debug.focusWatch', "- Debug: Focus Watch View command{0} will focus the watch view.", '<keybinding:workbench.debug.action.focusWatchView>'),
			localize('debug.help', "The debug console is a Read-Eval-Print-Loop that allows you to evaluate expressions and run commands and can be focused with{0}.", '<keybinding:workbench.panel.repl.view.focus>'),
			localize('debug.watchSetting', "The setting {0} controls whether watch variable changes are announced.", 'accessibility.debugWatchVariableAnnouncements'),
		].join('\n');
	}
}

