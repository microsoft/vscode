/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Disposable } from 'vs/base/common/lifecycle';
import { getReplView, Repl } from 'vs/workbench/contrib/debug/browser/repl';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { localize } from 'vs/nls';

export class DebugAccessibilityHelp implements IAccessibleViewImplentation {
	priority = 120;
	name = 'debugConsoleHelp';
	when = ContextKeyExpr.equals('focusedView', 'workbench.panel.repl.view');
	type: AccessibleViewType = AccessibleViewType.Help;
	getProvider(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const replView = getReplView(viewsService);
		if (!replView) {
			return undefined;
		}
		return new DebugAccessibilityHelpProvider(replView);
	}
}

class DebugAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	public readonly id = AccessibleViewProviderId.DebugConsoleHelp;
	public readonly verbositySettingKey = AccessibilityVerbositySettingId.DebugConsole;
	public readonly options = { type: AccessibleViewType.Help };
	private _treeHadFocus = false;
	constructor(private readonly _replView: Repl) {
		super();
		this._treeHadFocus = !!_replView.getFocusedElement();
	}

	public onClose(): void {
		if (this._treeHadFocus) {
			return this._replView.focusTree();
		}
		this._replView.getReplInput().focus();
	}

	public provideContent(): string {
		return [
			localize('debugConsole.help', "The debug console is a REPL (Read-Eval-Print-Loop) that allows you to evaluate expressions and run commands."),
			localize('debugConsole.output', "The debug console output can be navigated to from the input field with the Focus Previous Widget command<keybinding:widgetNavigation.focusPrevious>."),
			localize('debugConsole.input', "The debug console input can be navigated to from the output with the Focus Next Widget command<keybinding:widgetNavigation.focusNext>."),
			localize('debugConsole.history', "The debug console output history can be navigated with the up and down arrow keys."),
			localize('debugConsole.accessibleView', "The Open Accessible View command<keybinding:editor.action.accessibleView> will allow character by character navigation of the console output."),
			localize('debugConsole.lazyVariables', "The setting `debug.expandLazyVariables` controls whether variables are evaluated automatically. This is enabled by default when using a screen reader."),
			localize('debugConsole.continue', "The Debug: Continue command<keybinding:workbench.action.debug.continue> will continue execution until the next breakpoint."),
			localize('debugConsole.stepInto', "The Debug: Step Into command<keybinding:workbench.action.debug.stepInto> will step into the next function call."),
			localize('debugConsole.stepOver', "The Debug: Step Over command<keybinding:workbench.action.debug.stepOver> will step over the current function call."),
			localize('debugConsole.stepOut', "The Debug: Step Out command<keybinding:workbench.action.debug.stepOut> will step out of the current function call."),
		].join('\n');
	}
}

