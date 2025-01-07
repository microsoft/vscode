/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHotClass } from '../../../../base/common/hotReloadHelpers.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorunWithStore } from '../../../../base/common/observable.js';
import Severity from '../../../../base/common/severity.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ILanguageStatusService } from '../../../services/languageStatus/common/languageStatusService.js';

export class InlineCompletionLanguageStatusBarContribution extends Disposable {
	public static readonly hot = createHotClass(InlineCompletionLanguageStatusBarContribution);

	public static Id = 'vs.editor.contrib.inlineCompletionLanguageStatusBarContribution';

	// TODO always enable this!
	private readonly _inlineCompletionInlineEdits = observableConfigValue('editor.inlineSuggest.experimentalInlineEditsEnabled', false, this._configurationService);

	constructor(
		private readonly _editor: ICodeEditor,
		@ILanguageStatusService private readonly _languageStatusService: ILanguageStatusService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		const c = InlineCompletionsController.get(this._editor);

		this._register(autorunWithStore((reader, store) => {
			// TODO always enable this feature!
			if (!this._inlineCompletionInlineEdits.read(reader)) { return; }

			const model = c?.model.read(reader);
			if (!model) { return; }

			const status = model.status.read(reader);

			const statusMap: Record<typeof status, { shortLabel: string; label: string; loading: boolean }> = {
				loading: { shortLabel: '', label: 'Loading', loading: true, },
				ghostText: { shortLabel: '$(lightbulb)', label: 'Inline Completion available', loading: false, },
				inlineEdit: { shortLabel: '$(lightbulb-sparkle)', label: 'Inline Edit available', loading: false, },
				noSuggestion: { shortLabel: '$(circle-slash)', label: 'No inline suggestion available', loading: false, },
			};

			store.add(this._languageStatusService.addStatus({
				accessibilityInfo: undefined,
				busy: statusMap[status].loading,
				command: undefined,
				detail: 'Inline Suggestions',
				id: 'inlineSuggestions',
				label: { value: statusMap[status].label, shortValue: statusMap[status].shortLabel },
				name: 'Inline Suggestions',
				selector: { pattern: model.textModel.uri.fsPath },
				severity: Severity.Info,
				source: 'inlineSuggestions',
			}));
		}));
	}
}
