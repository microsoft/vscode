/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { createHotClass } from '../../../../base/common/hotReloadHelpers.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorunWithStore, derived } from '../../../../base/common/observable.js';
import { debouncedObservable } from '../../../../base/common/observableInternal/utils.js';
import Severity from '../../../../base/common/severity.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import { ILanguageStatusService } from '../../../services/languageStatus/common/languageStatusService.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';

export class InlineCompletionLanguageStatusBarContribution extends Disposable {
	public static readonly hot = createHotClass(InlineCompletionLanguageStatusBarContribution);

	public static Id = 'vs.editor.contrib.inlineCompletionLanguageStatusBarContribution';
	public static readonly languageStatusBarDisposables = new Set<DisposableStore>();

	private readonly _c = InlineCompletionsController.get(this._editor);

	private readonly _state = derived(this, reader => {
		const model = this._c?.model.read(reader);
		if (!model) { return undefined; }
		if (!observableCodeEditor(this._editor).isFocused.read(reader)) {
			return undefined;
		}

		return {
			model,
			status: debouncedObservable(model.status, 300),
		};
	});

	constructor(
		private readonly _editor: ICodeEditor,
		@ILanguageStatusService private readonly _languageStatusService: ILanguageStatusService,
	) {
		super();

		this._register(autorunWithStore((reader, store) => {
			const state = this._state.read(reader);
			if (!state) {
				return;
			}

			const status = state.status.read(reader);

			const statusMap: Record<typeof status, { shortLabel: string; label: string; loading: boolean }> = {
				loading: { shortLabel: '', label: localize('inlineSuggestionLoading', "Loading..."), loading: true, },
				ghostText: { shortLabel: '$(lightbulb)', label: '$(copilot) ' + localize('inlineCompletionAvailable', "Inline completion available"), loading: false, },
				inlineEdit: { shortLabel: '$(lightbulb-sparkle)', label: '$(copilot) ' + localize('inlineEditAvailable', "Inline edit available"), loading: false, },
				noSuggestion: { shortLabel: '$(circle-slash)', label: '$(copilot) ' + localize('noInlineSuggestionAvailable', "No inline suggestion available"), loading: false, },
			};

			// Make sure previous status is cleared before the new is registered. This works, but is a bit hacky.
			// TODO: Use a workbench contribution to get singleton behavior.
			InlineCompletionLanguageStatusBarContribution.languageStatusBarDisposables.forEach(d => d.clear());

			InlineCompletionLanguageStatusBarContribution.languageStatusBarDisposables.add(store);
			store.add({
				dispose: () => InlineCompletionLanguageStatusBarContribution.languageStatusBarDisposables.delete(store)
			});

			store.add(this._languageStatusService.addStatus({
				accessibilityInfo: undefined,
				busy: statusMap[status].loading,
				command: undefined,
				detail: localize('inlineSuggestionsSmall', "Inline suggestions"),
				id: 'inlineSuggestions',
				label: { value: statusMap[status].label, shortValue: statusMap[status].shortLabel },
				name: localize('inlineSuggestions', "Inline Suggestions"),
				selector: { pattern: state.model.textModel.uri.fsPath },
				severity: Severity.Info,
				source: 'inlineSuggestions',
			}));
		}));
	}
}
