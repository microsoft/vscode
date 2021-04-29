/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { hash } from 'vs/base/common/hash';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IContentDecorationRenderOptions, IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { InlineHintsProvider, InlineHintsProviderRegistry, InlineHint } from 'vs/editor/common/modes';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { flatten } from 'vs/base/common/arrays';
import { editorInlineHintForeground, editorInlineHintBackground } from 'vs/platform/theme/common/colorRegistry';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Range } from 'vs/editor/common/core/range';
import { LanguageFeatureRequestDelays } from 'vs/editor/common/modes/languageFeatureRegistry';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { URI } from 'vs/base/common/uri';
import { IRange } from 'vs/base/common/range';
import { assertType } from 'vs/base/common/types';
import { ITextModelService } from 'vs/editor/common/services/resolverService';

const MAX_DECORATORS = 500;

export interface InlineHintsData {
	list: InlineHint[];
	provider: InlineHintsProvider;
}

export async function getInlineHints(model: ITextModel, ranges: Range[], token: CancellationToken): Promise<InlineHintsData[]> {
	const datas: InlineHintsData[] = [];
	const providers = InlineHintsProviderRegistry.ordered(model).reverse();
	const promises = flatten(providers.map(provider => ranges.map(range => Promise.resolve(provider.provideInlineHints(model, range, token)).then(result => {
		if (result) {
			datas.push({ list: result, provider });
		}
	}, err => {
		onUnexpectedExternalError(err);
	}))));

	await Promise.all(promises);

	return datas;
}

export class InlineHintsController implements IEditorContribution {

	static readonly ID: string = 'editor.contrib.InlineHints';

	// static get(editor: ICodeEditor): InlineHintsController {
	// 	return editor.getContribution<InlineHintsController>(this.ID);
	// }

	private readonly _disposables = new DisposableStore();
	private readonly _sessionDisposables = new DisposableStore();
	private readonly _getInlineHintsDelays = new LanguageFeatureRequestDelays(InlineHintsProviderRegistry, 250, 2500);

	private _decorationsTypeIds: string[] = [];
	private _decorationIds: string[] = [];

	constructor(
		private readonly _editor: ICodeEditor,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		this._disposables.add(InlineHintsProviderRegistry.onDidChange(() => this._update()));
		this._disposables.add(_themeService.onDidColorThemeChange(() => this._update()));
		this._disposables.add(_editor.onDidChangeModel(() => this._update()));
		this._disposables.add(_editor.onDidChangeModelLanguage(() => this._update()));
		this._disposables.add(_editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.inlineHints)) {
				this._update();
			}
		}));

		this._update();
	}

	dispose(): void {
		this._sessionDisposables.dispose();
		this._removeAllDecorations();
		this._disposables.dispose();
	}

	private _update(): void {
		this._sessionDisposables.clear();

		if (!this._editor.getOption(EditorOption.inlineHints).enabled) {
			this._removeAllDecorations();
			return;
		}

		const model = this._editor.getModel();
		if (!model || !InlineHintsProviderRegistry.has(model)) {
			this._removeAllDecorations();
			return;
		}

		const scheduler = new RunOnceScheduler(async () => {
			const t1 = Date.now();

			const cts = new CancellationTokenSource();
			this._sessionDisposables.add(toDisposable(() => cts.dispose(true)));

			const visibleRanges = this._editor.getVisibleRangesPlusViewportAboveBelow();
			const result = await getInlineHints(model, visibleRanges, cts.token);

			// update moving average
			const newDelay = this._getInlineHintsDelays.update(model, Date.now() - t1);
			scheduler.delay = newDelay;

			// render hints
			this._updateHintsDecorators(result);

		}, this._getInlineHintsDelays.get(model));

		this._sessionDisposables.add(scheduler);

		// update inline hints when content or scroll position changes
		this._sessionDisposables.add(this._editor.onDidChangeModelContent(() => scheduler.schedule()));
		this._disposables.add(this._editor.onDidScrollChange(() => scheduler.schedule()));
		scheduler.schedule();

		// update inline hints when any any provider fires an event
		const providerListener = new DisposableStore();
		this._sessionDisposables.add(providerListener);
		for (const provider of InlineHintsProviderRegistry.all(model)) {
			if (typeof provider.onDidChangeInlineHints === 'function') {
				providerListener.add(provider.onDidChangeInlineHints(() => scheduler.schedule()));
			}
		}
	}

	private _updateHintsDecorators(hintsData: InlineHintsData[]): void {
		const { fontSize, fontFamily } = this._getLayoutInfo();
		const backgroundColor = this._themeService.getColorTheme().getColor(editorInlineHintBackground);
		const fontColor = this._themeService.getColorTheme().getColor(editorInlineHintForeground);

		const newDecorationsTypeIds: string[] = [];
		const newDecorationsData: IModelDeltaDecoration[] = [];

		const fontFamilyVar = '--inlineHintsFontFamily';
		this._editor.getContainerDomNode().style.setProperty(fontFamilyVar, fontFamily);

		for (const { list: hints } of hintsData) {

			for (let j = 0; j < hints.length && newDecorationsData.length < MAX_DECORATORS; j++) {
				const { text, range, description: hoverMessage, whitespaceBefore, whitespaceAfter } = hints[j];
				const marginBefore = whitespaceBefore ? (fontSize / 3) | 0 : 0;
				const marginAfter = whitespaceAfter ? (fontSize / 3) | 0 : 0;

				const before: IContentDecorationRenderOptions = {
					contentText: text,
					backgroundColor: `${backgroundColor}`,
					color: `${fontColor}`,
					margin: `0px ${marginAfter}px 0px ${marginBefore}px`,
					fontSize: `${fontSize}px`,
					fontFamily: `var(${fontFamilyVar})`,
					padding: `0px ${(fontSize / 4) | 0}px`,
					borderRadius: `${(fontSize / 4) | 0}px`,
				};
				const key = 'inlineHints-' + hash(before).toString(16);
				this._codeEditorService.registerDecorationType(key, { before }, undefined, this._editor);

				// decoration types are ref-counted which means we only need to
				// call register und remove equally often
				newDecorationsTypeIds.push(key);

				const options = this._codeEditorService.resolveDecorationOptions(key, true);
				if (typeof hoverMessage === 'string') {
					options.hoverMessage = new MarkdownString().appendText(hoverMessage);
				} else if (hoverMessage) {
					options.hoverMessage = hoverMessage;
				}

				newDecorationsData.push({
					range,
					options
				});
			}
		}

		this._decorationsTypeIds.forEach(this._codeEditorService.removeDecorationType, this._codeEditorService);
		this._decorationsTypeIds = newDecorationsTypeIds;

		this._decorationIds = this._editor.deltaDecorations(this._decorationIds, newDecorationsData);
	}

	private _getLayoutInfo() {
		const options = this._editor.getOption(EditorOption.inlineHints);
		const editorFontSize = this._editor.getOption(EditorOption.fontSize);
		let fontSize = options.fontSize;
		if (!fontSize || fontSize < 5 || fontSize > editorFontSize) {
			fontSize = (editorFontSize * .9) | 0;
		}
		const fontFamily = options.fontFamily;
		return { fontSize, fontFamily };
	}

	private _removeAllDecorations(): void {
		this._decorationIds = this._editor.deltaDecorations(this._decorationIds, []);
		this._decorationsTypeIds.forEach(this._codeEditorService.removeDecorationType, this._codeEditorService);
		this._decorationsTypeIds = [];
	}
}

registerEditorContribution(InlineHintsController.ID, InlineHintsController);

CommandsRegistry.registerCommand('_executeInlineHintProvider', async (accessor, ...args: [URI, IRange]): Promise<InlineHint[]> => {

	const [uri, range] = args;
	assertType(URI.isUri(uri));
	assertType(Range.isIRange(range));

	const ref = await accessor.get(ITextModelService).createModelReference(uri);
	try {
		const data = await getInlineHints(ref.object.textEditorModel, [Range.lift(range)], CancellationToken.None);
		return flatten(data.map(item => item.list)).sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));

	} finally {
		ref.dispose();
	}
});
