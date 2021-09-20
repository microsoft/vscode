/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten } from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { hash } from 'vs/base/common/hash';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { LRUCache } from 'vs/base/common/map';
import { IRange } from 'vs/base/common/range';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { InlayHint, InlayHintsProvider, InlayHintsProviderRegistry } from 'vs/editor/common/modes';
import { LanguageFeatureRequestDelays } from 'vs/editor/common/modes/languageFeatureRegistry';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { editorInlayHintBackground, editorInlayHintForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';

const MAX_DECORATORS = 500;

export interface InlayHintsData {
	list: InlayHint[];
	provider: InlayHintsProvider;
}

export async function getInlayHints(model: ITextModel, ranges: Range[], token: CancellationToken): Promise<InlayHintsData[]> {
	const datas: InlayHintsData[] = [];
	const providers = InlayHintsProviderRegistry.ordered(model).reverse();

	const promises = providers.map(provider => ranges.map(async range => {
		try {
			const result = await provider.provideInlayHints(model, range, token);
			const itemsInRange = result?.filter(hint => range.containsPosition(hint.position));
			if (itemsInRange?.length) {
				datas.push({ list: itemsInRange, provider });
			}
		} catch (err) {
			onUnexpectedExternalError(err);
		}
	}));

	await Promise.all(promises.flat());

	return datas;
}

class InlayHintsCache {

	private readonly _entries = new LRUCache<string, InlayHintsData[]>(50);

	get(model: ITextModel): InlayHintsData[] | undefined {
		const key = InlayHintsCache._key(model);
		return this._entries.get(key);
	}

	set(model: ITextModel, value: InlayHintsData[]): void {
		const key = InlayHintsCache._key(model);
		this._entries.set(key, value);
	}

	private static _key(model: ITextModel): string {
		return `${model.uri.toString()}/${model.getVersionId()}`;
	}
}

export class InlayHintsController implements IEditorContribution {

	static readonly ID: string = 'editor.contrib.InlayHints';

	private readonly _disposables = new DisposableStore();
	private readonly _sessionDisposables = new DisposableStore();
	private readonly _getInlayHintsDelays = new LanguageFeatureRequestDelays(InlayHintsProviderRegistry, 25, 2500);

	private readonly _cache = new InlayHintsCache();

	private _decorationsTypeIds: string[] = [];
	private _decorationIds: string[] = [];

	constructor(
		private readonly _editor: ICodeEditor,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		this._disposables.add(InlayHintsProviderRegistry.onDidChange(() => this._update()));
		this._disposables.add(_themeService.onDidColorThemeChange(() => this._update()));
		this._disposables.add(_editor.onDidChangeModel(() => this._update()));
		this._disposables.add(_editor.onDidChangeModelLanguage(() => this._update()));
		this._disposables.add(_editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.inlayHints)) {
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

		if (!this._editor.getOption(EditorOption.inlayHints).enabled) {
			this._removeAllDecorations();
			return;
		}

		const model = this._editor.getModel();
		if (!model || !InlayHintsProviderRegistry.has(model)) {
			this._removeAllDecorations();
			return;
		}

		// iff possible, quickly update from cache
		const cached = this._cache.get(model);
		if (cached) {
			this._updateHintsDecorators(cached);
		}

		const scheduler = new RunOnceScheduler(async () => {
			const t1 = Date.now();

			const cts = new CancellationTokenSource();
			this._sessionDisposables.add(toDisposable(() => cts.dispose(true)));

			const ranges = this._getHintsRanges();
			const result = await getInlayHints(model, ranges, cts.token);

			scheduler.delay = this._getInlayHintsDelays.update(model, Date.now() - t1);
			this._updateHintsDecorators(result);
			this._cache.set(model, result);

		}, this._getInlayHintsDelays.get(model));

		this._sessionDisposables.add(scheduler);

		// update inline hints when content or scroll position changes
		this._sessionDisposables.add(this._editor.onDidChangeModelContent(() => scheduler.schedule()));
		this._disposables.add(this._editor.onDidScrollChange(() => scheduler.schedule()));
		scheduler.schedule();

		// update inline hints when any any provider fires an event
		const providerListener = new DisposableStore();
		this._sessionDisposables.add(providerListener);
		for (const provider of InlayHintsProviderRegistry.all(model)) {
			if (typeof provider.onDidChangeInlayHints === 'function') {
				providerListener.add(provider.onDidChangeInlayHints(() => scheduler.schedule()));
			}
		}
	}

	private _getHintsRanges(): Range[] {
		const extra = 30;
		const model = this._editor.getModel()!;
		const visibleRanges = this._editor.getVisibleRangesPlusViewportAboveBelow();
		const result: Range[] = [];
		for (const range of visibleRanges.sort(Range.compareRangesUsingStarts)) {
			const extendedRange = model.validateRange(new Range(range.startLineNumber - extra, range.startColumn, range.endLineNumber + extra, range.endColumn));
			if (result.length === 0 || !Range.areIntersectingOrTouching(result[result.length - 1], extendedRange)) {
				result.push(extendedRange);
			} else {
				result[result.length - 1] = Range.plusRange(result[result.length - 1], extendedRange);
			}
		}
		return result;
	}

	private _updateHintsDecorators(hintsData: InlayHintsData[]): void {
		const { fontSize, fontFamily } = this._getLayoutInfo();
		const backgroundColor = this._themeService.getColorTheme().getColor(editorInlayHintBackground);
		const fontColor = this._themeService.getColorTheme().getColor(editorInlayHintForeground);

		const newDecorationsTypeIds: string[] = [];
		const newDecorationsData: IModelDeltaDecoration[] = [];

		const fontFamilyVar = '--inlayHintsFontFamily';
		this._editor.getContainerDomNode().style.setProperty(fontFamilyVar, fontFamily);

		for (const { list: hints } of hintsData) {

			for (let j = 0; j < hints.length && newDecorationsData.length < MAX_DECORATORS; j++) {
				const { text, position, whitespaceBefore, whitespaceAfter } = hints[j];
				const marginBefore = whitespaceBefore ? (fontSize / 3) | 0 : 0;
				const marginAfter = whitespaceAfter ? (fontSize / 3) | 0 : 0;

				const massagedText = fixSpace(text);

				const beforeInjectedText = {
					contentText: massagedText,
					backgroundColor: `${backgroundColor}`,
					color: `${fontColor}`,
					margin: `0px ${marginAfter}px 0px ${marginBefore}px`,
					fontSize: `${fontSize}px`,
					fontFamily: `var(${fontFamilyVar})`,
					padding: `0px ${(fontSize / 4) | 0}px`,
					borderRadius: `${(fontSize / 4) | 0}px`,
					verticalAlign: 'middle',
					affectsLetterSpacing: true
				};
				const key = 'inlayHints-' + hash(beforeInjectedText).toString(16);
				this._codeEditorService.registerDecorationType('inlay-hints-controller', key, { beforeInjectedText }, undefined, this._editor);

				// decoration types are ref-counted which means we only need to
				// call register und remove equally often
				newDecorationsTypeIds.push(key);

				const options = this._codeEditorService.resolveDecorationOptions(key, true);
				newDecorationsData.push({
					range: Range.fromPositions(position),
					options
				});
			}
		}

		this._decorationsTypeIds.forEach(this._codeEditorService.removeDecorationType, this._codeEditorService);
		this._decorationsTypeIds = newDecorationsTypeIds;

		this._decorationIds = this._editor.deltaDecorations(this._decorationIds, newDecorationsData);
	}

	private _getLayoutInfo() {
		const options = this._editor.getOption(EditorOption.inlayHints);
		const editorFontSize = this._editor.getOption(EditorOption.fontSize);
		let fontSize = options.fontSize;
		if (!fontSize || fontSize < 5 || fontSize > editorFontSize) {
			fontSize = (editorFontSize * .9) | 0;
		}
		const fontFamily = options.fontFamily || this._editor.getOption(EditorOption.fontFamily);
		return { fontSize, fontFamily };
	}

	private _removeAllDecorations(): void {
		this._decorationIds = this._editor.deltaDecorations(this._decorationIds, []);
		this._decorationsTypeIds.forEach(this._codeEditorService.removeDecorationType, this._codeEditorService);
		this._decorationsTypeIds = [];
	}
}

function fixSpace(str: string): string {
	const noBreakWhitespace = '\xa0';
	return str.replace(/[ \t]/g, noBreakWhitespace);
}

registerEditorContribution(InlayHintsController.ID, InlayHintsController);

CommandsRegistry.registerCommand('_executeInlayHintProvider', async (accessor, ...args: [URI, IRange]): Promise<InlayHint[]> => {

	const [uri, range] = args;
	assertType(URI.isUri(uri));
	assertType(Range.isIRange(range));

	const ref = await accessor.get(ITextModelService).createModelReference(uri);
	try {
		const data = await getInlayHints(ref.object.textEditorModel, [Range.lift(range)], CancellationToken.None);
		return flatten(data.map(item => item.list)).sort((a, b) => Position.compare(a.position, b.position));

	} finally {
		ref.dispose();
	}
});
