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
import { IEditorContribution } from 'vs/editor/common/editorCommon';
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
	private readonly _decorationsTypes = new Set<string>();

	private _decorationIds: string[] = [];

	constructor(private readonly _editor: ICodeEditor,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		this._disposables.add(InlineHintsProviderRegistry.onDidChange(() => this._update()));
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
		let decorations: IModelDeltaDecoration[] = [];
		const newDecorationsTypes: { [key: string]: boolean } = {};
		const { fontSize, fontFamily } = this._getLayoutInfo();
		const backgroundColor = this._themeService.getColorTheme().getColor(editorInlineHintBackground);
		const fontColor = this._themeService.getColorTheme().getColor(editorInlineHintForeground);

		for (let i = 0; i < hintsData.length; i++) {
			const hint = hintsData[i].list;
			for (let j = 0; j < hint.length && decorations.length < MAX_DECORATORS; j++) {
				const { text, range, hoverMessage, whitespaceBefore, whitespaceAfter } = hint[j];
				const marginBefore = whitespaceBefore ? fontSize / 3 : 0;
				const marginAfter = whitespaceAfter ? fontSize / 3 : 0;

				const subKey = hash(text).toString(16);
				let key = 'inlineHints-' + subKey;

				if (!this._decorationsTypes.has(key) && !newDecorationsTypes[key]) {
					this._codeEditorService.registerDecorationType(key, {
						before: {
							contentText: text,
							backgroundColor: `${backgroundColor}`,
							color: `${fontColor}`,
							margin: `0px ${marginAfter}px 0px ${marginBefore}px`,
							fontSize: `${fontSize}px`,
							fontFamily: fontFamily,
							padding: '0px 2px'
						}
					}, undefined, this._editor);
				}

				newDecorationsTypes[key] = true;
				const options = this._codeEditorService.resolveDecorationOptions(key, true);
				if (hoverMessage) {
					options.hoverMessage = new MarkdownString().appendText(hoverMessage);
				}

				decorations.push({
					range: {
						startLineNumber: range.startLineNumber,
						startColumn: range.startColumn,
						endLineNumber: range.endLineNumber,
						endColumn: range.endColumn
					},
					options
				});
			}
		}

		this._decorationsTypes.forEach(subType => {
			if (!newDecorationsTypes[subType]) {
				this._codeEditorService.removeDecorationType(subType);
			}
		});

		this._decorationIds = this._editor.deltaDecorations(this._decorationIds, decorations);
	}

	private _getLayoutInfo() {
		const options = this._editor.getOption(EditorOption.inlineHints);
		let fontSize = options.fontSize;
		if (!fontSize || fontSize < 5) {
			fontSize = (this._editor.getOption(EditorOption.fontSize) * .9) | 0;
		}

		const fontFamily = options.fontFamily;
		return { fontSize, fontFamily };
	}

	private _removeAllDecorations(): void {
		this._decorationIds = this._editor.deltaDecorations(this._decorationIds, []);

		this._decorationsTypes.forEach(subType => {
			this._codeEditorService.removeDecorationType(subType);
		});
	}
}

registerEditorContribution(InlineHintsController.ID, InlineHintsController);
