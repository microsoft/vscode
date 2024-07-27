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
import { AccessibilityHelpNLS } from 'vs/editor/common/standaloneStrings';

export class ReplAccessibilityHelp implements IAccessibleViewImplentation {
	priority = 120;
	name = 'replHelp';
	when = ContextKeyExpr.equals('focusedView', 'workbench.panel.repl.view');
	type: AccessibleViewType = AccessibleViewType.Help;
	getProvider(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const replView = getReplView(viewsService);
		if (!replView) {
			return undefined;
		}
		return new ReplAccessibilityHelpProvider(replView);
	}
}

class ReplAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	public readonly id = AccessibleViewProviderId.ReplHelp;
	public readonly verbositySettingKey = AccessibilityVerbositySettingId.Debug;
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
			localize('repl.help', "The debug console is a Read-Eval-Print-Loop that allows you to evaluate expressions and run commands and can be focused with{0}.", '<keybinding:workbench.panel.repl.view.focus>'),
			localize('repl.output', "The debug console output can be navigated to from the input field with the Focus Previous Widget command{0}.", '<keybinding:widgetNavigation.focusPrevious>'),
			localize('repl.input', "The debug console input can be navigated to from the output with the Focus Next Widget command{0}.", '<keybinding:widgetNavigation.focusNext>'),
			localize('repl.history', "The debug console output history can be navigated with the up and down arrow keys."),
			localize('repl.accessibleView', "The Open Accessible View command{0} will allow character by character navigation of the console output.", '<keybinding:editor.action.accessibleView>'),
			localize('repl.showRunAndDebug', "The Show Run and Debug view command{0} will open the Run and Debug view.", '<keybinding:workbench.view.debug>'),
			AccessibilityHelpNLS.setBreakpoint,
			localize('repl.lazyVariables', "The setting `debug.expandLazyVariables` controls whether variables are evaluated automatically. This is enabled by default when using a screen reader."),
			localize('repl.continue', "The Debug: Continue command{0} will continue execution until the next breakpoint.", '<keybinding:workbench.action.debug.continue>'),
			localize('repl.stepInto', "The Debug: Step Into command{0} will step into the next function call.", '<keybinding:workbench.action.debug.stepInto>'),
			localize('repl.stepOver', "The Debug: Step Over command{0} will step over the current function call.", '<keybinding:workbench.action.debug.stepOver>'),
			localize('repl.stepOut', "The Debug: Step Out command{0} will step out of the current function call.", '<keybinding:workbench.action.debug.stepOut>'),
		].join('\n');
	}
}

