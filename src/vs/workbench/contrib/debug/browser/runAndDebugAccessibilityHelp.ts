/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { AccessibilityHelpNLS } from '../../../../editor/common/standaloneStrings.js';
import { FocusedViewContext, SidebarFocusContext } from '../../../common/contextkeys.js';
import { BREAKPOINTS_VIEW_ID, CALLSTACK_VIEW_ID, LOADED_SCRIPTS_VIEW_ID, VARIABLES_VIEW_ID, WATCH_VIEW_ID } from '../common/debug.js';

export class RunAndDebugAccessibilityHelp implements IAccessibleViewImplementation {
	priority = 120;
	name = 'runAndDebugHelp';
	when = ContextKeyExpr.or(
		ContextKeyExpr.and(ContextKeyExpr.equals('activeViewlet', 'workbench.view.debug'), SidebarFocusContext),
		ContextKeyExpr.equals(FocusedViewContext.key, VARIABLES_VIEW_ID),
		ContextKeyExpr.equals(FocusedViewContext.key, WATCH_VIEW_ID),
		ContextKeyExpr.equals(FocusedViewContext.key, CALLSTACK_VIEW_ID),
		ContextKeyExpr.equals(FocusedViewContext.key, LOADED_SCRIPTS_VIEW_ID),
		ContextKeyExpr.equals(FocusedViewContext.key, BREAKPOINTS_VIEW_ID)
	);
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
			localize('debug.help', "Access debug output and evaluate expressions in the debug console, which can be focused with{0}.", '<keybinding:workbench.panel.repl.view.focus>'),
			AccessibilityHelpNLS.setBreakpoint,
			AccessibilityHelpNLS.addToWatch,
			localize('onceDebugging', "Once debugging, the following commands will be available:"),
			localize('debug.restartDebugging', "- Debug: Restart Debugging command{0} will restart the current debug session.", '<keybinding:workbench.action.debug.restart>'),
			localize('debug.stopDebugging', "- Debug: Stop Debugging command{0} will stop the current debugging session.", '<keybinding:workbench.action.debug.stop>'),
			localize('debug.continue', "- Debug: Continue command{0} will continue execution until the next breakpoint.", '<keybinding:workbench.action.debug.continue>'),
			localize('debug.stepInto', "- Debug: Step Into command{0} will step into the next function call.", '<keybinding:workbench.action.debug.stepInto>'),
			localize('debug.stepOver', "- Debug: Step Over command{0} will step over the current function call.", '<keybinding:workbench.action.debug.stepOver>'),
			localize('debug.stepOut', "- Debug: Step Out command{0} will step out of the current function call.", '<keybinding:workbench.action.debug.stepOut>'),
			localize('debug.views', 'The debug viewlet is comprised of several views that can be focused with the following commands or navigated to via tab then arrow keys:'),
			localize('debug.focusBreakpoints', "- Debug: Focus Breakpoints View command{0} will focus the breakpoints view.", '<keybinding:workbench.debug.action.focusBreakpointsView>'),
			localize('debug.focusCallStack', "- Debug: Focus Call Stack View command{0} will focus the call stack view.", '<keybinding:workbench.debug.action.focusCallStackView>'),
			localize('debug.focusVariables', "- Debug: Focus Variables View command{0} will focus the variables view.", '<keybinding:workbench.debug.action.focusVariablesView>'),
			localize('debug.focusWatch', "- Debug: Focus Watch View command{0} will focus the watch view.", '<keybinding:workbench.debug.action.focusWatchView>'),
			localize('debug.watchSetting', "The setting {0} controls whether watch variable changes are announced.", 'accessibility.debugWatchVariableAnnouncements'),
		].join('\n');
	}
}

