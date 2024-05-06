/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { AccessibilityVerbositySettingId, accessibleViewIsShown } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import * as strings from 'vs/base/common/strings';
import { AccessibilityHelpAction, AccessibleViewAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';
import { InlineCompletionContextKeys } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionContextKeys';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IAccessibleViewOptions, AccessibleViewType, AccessibleViewProviderId, IAccessibleViewService } from 'vs/platform/accessibility/browser/accessibleView';
import { AccessibleViewRegistry } from 'vs/platform/accessibility/browser/accessibleViewRegistry';

export function descriptionForCommand(commandId: string, msg: string, noKbMsg: string, keybindingService: IKeybindingService): string {
	const kb = keybindingService.lookupKeybinding(commandId);
	if (kb) {
		return strings.format(msg, kb.getAriaLabel());
	}
	return strings.format(noKbMsg, commandId);
}

export class AccesibleViewHelpContribution extends Disposable {
	static ID: 'accesibleViewHelpContribution';
	constructor() {
		super();
		this._register(AccessibilityHelpAction.addImplementation(115, 'accessible-view', accessor => {
			accessor.get(IAccessibleViewService).showAccessibleViewHelp();
			return true;
		}, accessibleViewIsShown));
		AccessibleViewRegistry.getImplementations().forEach(impl => {
			if (impl.type === AccessibleViewType.View) {
				this._register(AccessibleViewAction.addImplementation(impl.priority, impl.name, impl.implementation, impl.when));
			} else {
				this._register(AccessibilityHelpAction.addImplementation(impl.priority, impl.name, impl.implementation, impl.when));
			}
		});
	}
}


export class AccesibleViewContributions extends Disposable {
	static ID: 'accesibleViewContributions';
	constructor() {
		super();
		AccessibleViewRegistry.getImplementations().forEach(impl => {
			if (impl.type === AccessibleViewType.View) {
				this._register(AccessibleViewAction.addImplementation(impl.priority, impl.name, impl.implementation, impl.when));
			} else {
				this._register(AccessibilityHelpAction.addImplementation(impl.priority, impl.name, impl.implementation, impl.when));
			}
		});
	}
}


export class InlineCompletionsAccessibleViewContribution extends Disposable {
	static ID: 'inlineCompletionsAccessibleViewContribution';
	private _options: IAccessibleViewOptions = { type: AccessibleViewType.View };
	constructor() {
		super();
		this._register(AccessibleViewAction.addImplementation(95, 'inline-completions', accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const codeEditorService = accessor.get(ICodeEditorService);
			const show = () => {
				const editor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
				if (!editor) {
					return false;
				}
				const model = InlineCompletionsController.get(editor)?.model.get();
				const state = model?.state.get();
				if (!model || !state) {
					return false;
				}
				const lineText = model.textModel.getLineContent(state.primaryGhostText.lineNumber);
				const ghostText = state.primaryGhostText.renderForScreenReader(lineText);
				if (!ghostText) {
					return false;
				}
				this._options.language = editor.getModel()?.getLanguageId() ?? undefined;
				accessibleViewService.show({
					id: AccessibleViewProviderId.InlineCompletions,
					verbositySettingKey: AccessibilityVerbositySettingId.InlineCompletions,
					provideContent() { return lineText + ghostText; },
					onClose() {
						model.stop();
						editor.focus();
					},
					next() {
						model.next();
						setTimeout(() => show(), 50);
					},
					previous() {
						model.previous();
						setTimeout(() => show(), 50);
					},
					options: this._options
				});
				return true;
			}; ContextKeyExpr.and(InlineCompletionContextKeys.inlineSuggestionVisible);
			return show();
		}));
	}
}
