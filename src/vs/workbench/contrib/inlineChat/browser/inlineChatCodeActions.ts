/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CodeAction, CodeActionList } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { CodeActionKind } from '../../../../editor/contrib/codeAction/common/types.js';
import { ACTION_START, CTX_INLINE_CHAT_POSSIBLE, CTX_INLINE_CHAT_V1_ENABLED, CTX_INLINE_CHAT_V2_ENABLED } from '../common/inlineChat.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';

export class InlineChatCodeActionsProvider {

	static registerProvider(instantiationService: IInstantiationService): { dispose(): void } {
		return instantiationService.invokeFunction(accessor => {
			const languageFeaturesService = accessor.get(ILanguageFeaturesService);

			const provider = instantiationService.createInstance(InlineChatCodeActionsProvider);
			return languageFeaturesService.codeActionProvider.register('*', provider);
		});
	}

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
	}

	async provideCodeActions(model: ITextModel, range: Range | Selection): Promise<CodeActionList | undefined> {
		// Check if inline chat is enabled and possible
		const inlineChatContextKey = ContextKeyExpr.and(
			ContextKeyExpr.or(CTX_INLINE_CHAT_V1_ENABLED, CTX_INLINE_CHAT_V2_ENABLED),
			CTX_INLINE_CHAT_POSSIBLE,
			EditorContextKeys.writable,
			EditorContextKeys.editorSimpleInput.negate()
		);

		if (!this.contextKeyService.contextMatchesRules(inlineChatContextKey)) {
			return undefined;
		}

		const actions: CodeAction[] = [];

		// Show AI actions submenu when there's a non-empty selection
		if (!range.isEmpty()) {
			const textInSelection = model.getValueInRange(range);
			if (!/^\s*$/.test(textInSelection)) {
				const baseKind = CodeActionKind.RefactorRewrite.append('ai');
				const selection = new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
				const runOptions = {
					initialSelection: selection,
					initialRange: range,
					position: range.getStartPosition()
				};

				// Fix action - automatically sends a fix request
				actions.push({
					kind: baseKind.append('fix').value,
					isAI: true,
					title: localize('fix', "Fix"),
					command: {
						id: ACTION_START,
						title: localize('fix', "Fix"),
						arguments: [{
							...runOptions,
							message: localize('fixMessage', "Fix this code"),
							autoSend: true
						}]
					},
				});

				// Translate action - opens a language picker
				actions.push({
					kind: baseKind.append('translate').value,
					isAI: true,
					title: localize('translate', "Translate"),
					command: {
						id: 'inlineChat.showTranslateLanguagePicker',
						title: localize('translate', "Translate"),
						arguments: [runOptions]
					},
				});

				// Paraphrase action - opens a style picker
				actions.push({
					kind: baseKind.append('paraphrase').value,
					isAI: true,
					title: localize('paraphrase', "Paraphrase"),
					command: {
						id: 'inlineChat.showParaphraseStylePicker',
						title: localize('paraphrase', "Paraphrase"),
						arguments: [runOptions]
					},
				});

				// Chat Inline action - opens inline chat without auto-sending
				actions.push({
					kind: baseKind.append('inlineChat').value,
					isAI: true,
					title: localize('openInlineChat', "Chat Inline"),
					command: {
						id: ACTION_START,
						title: localize('openInlineChat', "Chat Inline"),
						arguments: [runOptions]
					},
				});
			}
		}

		if (actions.length === 0) {
			return undefined;
		}

		return {
			actions,
			dispose() { }
		};
	}
}

