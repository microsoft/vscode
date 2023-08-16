/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { constObservable } from 'vs/base/common/observable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IPosition } from 'vs/editor/common/core/position';
import { GhostText, GhostTextPart } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';
import { GhostTextWidget } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class MultiGhostTextController extends Disposable {
	static ID = 'editor.contrib.inlineCompletionsController';

	public static get(editor: ICodeEditor): MultiGhostTextController | null {
		return editor.getContribution<MultiGhostTextController>(MultiGhostTextController.ID);
	}

	private _widgets: GhostTextWidget[] = [];

	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		// @IContextKeyService private readonly contextKeyService: IContextKeyService,
		// @IConfigurationService private readonly configurationService: IConfigurationService,
		// @ICommandService private readonly commandService: ICommandService,
		// @ILanguageFeatureDebounceService private readonly debounceService: ILanguageFeatureDebounceService,
		// @ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		// @IAudioCueService private readonly audioCueService: IAudioCueService,
	) {
		super();


	}

	public showGhostText(ghostTexts: { position: IPosition; text: string }[]): void {
		for (const gt of ghostTexts) {
			const ghostText = new GhostText(gt.position.lineNumber, [new GhostTextPart(gt.position.column, gt.text.split('\n'), false)]);

			const instance = this.instantiationService.createInstance(GhostTextWidget, this.editor, {
				ghostText: constObservable(ghostText),
				minReservedLineCount: constObservable(0),
				targetTextModel: constObservable(this.editor.getModel() ?? undefined),
			});
			this._widgets.push(instance);

		}

	}
}
