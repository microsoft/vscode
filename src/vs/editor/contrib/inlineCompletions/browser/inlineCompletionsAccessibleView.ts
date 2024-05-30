/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { InlineCompletionContextKeys } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionContextKeys';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';
import { AccessibleViewType, AccessibleViewProviderId } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export class InlineCompletionsAccessibleView extends Disposable implements IAccessibleViewImplentation {
	readonly type = AccessibleViewType.View;
	readonly priority = 95;
	readonly name = 'inline-completions';
	readonly when = ContextKeyExpr.and(InlineCompletionContextKeys.inlineSuggestionVisible);
	getProvider(accessor: ServicesAccessor) {
		const codeEditorService = accessor.get(ICodeEditorService);
		function resolveProvider() {
			const editor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
			if (!editor) {
				return;
			}
			const model = InlineCompletionsController.get(editor)?.model.get();
			const state = model?.state.get();
			if (!model || !state) {
				return;
			}
			const lineText = model.textModel.getLineContent(state.primaryGhostText.lineNumber);
			const ghostText = state.primaryGhostText.renderForScreenReader(lineText);
			if (!ghostText) {
				return;
			}
			const language = editor.getModel()?.getLanguageId() ?? undefined;
			return {
				id: AccessibleViewProviderId.InlineCompletions,
				verbositySettingKey: 'accessibility.verbosity.inlineCompletions',
				provideContent() { return lineText + ghostText; },
				onClose() {
					model.stop();
					editor.focus();
				},
				next() {
					model.next();
					setTimeout(() => resolveProvider(), 50);
				},
				previous() {
					model.previous();
					setTimeout(() => resolveProvider(), 50);
				},
				options: { language, type: AccessibleViewType.View }
			};
		}
		return resolveProvider();
	}
	constructor() {
		super();
	}
}
