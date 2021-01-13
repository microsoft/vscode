/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, RunOnceScheduler } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { hash } from 'vs/base/common/hash';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { InlineHintsProvider, InlineHintsProviderRegistry, InlineHint } from 'vs/editor/common/modes';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { flatten } from 'vs/base/common/arrays';
import { editorInlineHintForeground, editorInlineHintBackground } from 'vs/platform/theme/common/colorRegistry';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Range } from 'vs/editor/common/core/range';
import { LanguageFeatureRequestDelays } from 'vs/editor/common/modes/languageFeatureRegistry';

const MAX_DECORATORS = 500;

export interface InlineHintsData {
	list: InlineHint[];
	provider: InlineHintsProvider;
}

export function getInlineHints(model: ITextModel, ranges: Range[], token: CancellationToken): Promise<InlineHintsData[]> {
	const datas: InlineHintsData[] = [];
	const providers = InlineHintsProviderRegistry.ordered(model).reverse();
	const promises = flatten(providers.map(provider => ranges.map(range => Promise.resolve(provider.provideInlineHints(model, range, token)).then(result => {
		if (result) {
			datas.push({ list: result, provider });
		}
	}))));

	return Promise.all(promises).then(() => datas);
}

export class InlineHintsDetector extends Disposable implements IEditorContribution {

	static readonly ID: string = 'editor.contrib.InlineHints';
	private readonly _localToDispose = this._register(new DisposableStore());
	private _decorationsIds: string[] = [];
	private _hintsDatas = new Map<string, InlineHintsData>();
	private _hintsDecoratorIds: string[] = [];
	private readonly _decorationsTypes = new Set<string>();
	private _isEnabled: boolean;
	private _getInlineHintsPromise: CancelablePromise<InlineHintsData[]> | undefined;
	private readonly _getInlineHintsDelays = new LanguageFeatureRequestDelays(InlineHintsProviderRegistry, 250, 2500);

	constructor(private readonly _editor: ICodeEditor,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();
		this._register(_editor.onDidChangeModel(() => {
			this._isEnabled = this.isEnabled();
			this._onModelChanged();
		}));
		this._register(_editor.onDidChangeModelLanguage(() => this._onModelChanged()));
		this._register(InlineHintsProviderRegistry.onDidChange(() => this._onModelChanged()));
		this._register(_editor.onDidChangeConfiguration(() => {
			let prevIsEnabled = this._isEnabled;
			this._isEnabled = this.isEnabled();
			if (prevIsEnabled !== this._isEnabled) {
				if (this._isEnabled) {
					this._onModelChanged();
				} else {
					this._removeAllDecorations();
				}
			}
		}));
		this._register(_editor.onDidScrollChange(() => {
			this._onModelChanged();
		}));

		this._isEnabled = this.isEnabled();
		this._onModelChanged();
	}

	isEnabled(): boolean {
		const model = this._editor.getModel();
		if (!model) {
			return false;
		}

		return this._editor.getOption(EditorOption.inlineHints).enabled;
	}

	static get(editor: ICodeEditor): InlineHintsDetector {
		return editor.getContribution<InlineHintsDetector>(this.ID);
	}

	dispose(): void {
		this._stop();
		this._removeAllDecorations();
		super.dispose();
	}

	private _onModelChanged(): void {
		this._stop();

		if (!this._isEnabled) {
			return;
		}
		const model = this._editor.getModel();

		if (!model || !InlineHintsProviderRegistry.has(model)) {
			return;
		}

		const scheduler = new RunOnceScheduler(() => {
			const t1 = Date.now();

			this._getInlineHintsPromise?.cancel();
			this._getInlineHintsPromise = createCancelablePromise(token => {
				const visibleRanges = this._editor.getVisibleRangesPlusViewportAboveBelow();
				return getInlineHints(model, visibleRanges, token);
			});

			this._getInlineHintsPromise.then(result => {
				// update moving average
				const newDelay = this._getInlineHintsDelays.update(model, Date.now() - t1);
				scheduler.delay = newDelay;

				// render hints
				this._updateDecorations(result);
				this._updateHintsDecorators(result);
			}, onUnexpectedError);

		}, this._getInlineHintsDelays.get(model));

		this._localToDispose.add(scheduler);
		this._localToDispose.add(this._editor.onDidChangeModelContent(() => {
			scheduler.schedule();
		}));
		scheduler.schedule();
	}

	private _stop(): void {
		if (this._getInlineHintsPromise) {
			this._getInlineHintsPromise.cancel();
			this._getInlineHintsPromise = undefined;
		}
		this._localToDispose.clear();
	}

	private _updateDecorations(hintsData: InlineHintsData[]): void {
		const decorations = flatten(hintsData.map(hints => hints.list.map(hint => {
			return {
				range: {
					startLineNumber: hint.range.startLineNumber,
					startColumn: hint.range.startColumn,
					endLineNumber: hint.range.endLineNumber,
					endColumn: hint.range.endColumn
				},
				options: ModelDecorationOptions.EMPTY
			};
		})));

		this._decorationsIds = this._editor.deltaDecorations(this._decorationsIds, decorations);

		this._hintsDatas = new Map<string, InlineHintsData>();
		this._decorationsIds.forEach((id, i) => this._hintsDatas.set(id, hintsData[i]));
	}

	private _updateHintsDecorators(hintsData: InlineHintsData[]): void {
		let decorations: IModelDeltaDecoration[] = [];
		let newDecorationsTypes: { [key: string]: boolean } = {};
		const { fontSize, fontFamily } = this._getLayoutInfo();
		const backgroundColor = this._themeService.getColorTheme().getColor(editorInlineHintBackground);
		const fontColor = this._themeService.getColorTheme().getColor(editorInlineHintForeground);

		for (let i = 0; i < hintsData.length; i++) {
			const hint = hintsData[i].list;
			for (let j = 0; j < hint.length && decorations.length < MAX_DECORATORS; j++) {
				const { text, range, whitespaceBefore, whitespaceAfter } = hint[j];
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
				decorations.push({
					range: {
						startLineNumber: range.startLineNumber,
						startColumn: range.startColumn,
						endLineNumber: range.endLineNumber,
						endColumn: range.endColumn
					},
					options: this._codeEditorService.resolveDecorationOptions(key, true)
				});
			}
		}

		this._decorationsTypes.forEach(subType => {
			if (!newDecorationsTypes[subType]) {
				this._codeEditorService.removeDecorationType(subType);
			}
		});

		this._hintsDecoratorIds = this._editor.deltaDecorations(this._hintsDecoratorIds, decorations);
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
		this._decorationsIds = this._editor.deltaDecorations(this._decorationsIds, []);
		this._hintsDecoratorIds = this._editor.deltaDecorations(this._hintsDecoratorIds, []);

		this._decorationsTypes.forEach(subType => {
			this._codeEditorService.removeDecorationType(subType);
		});
	}
}

registerEditorContribution(InlineHintsDetector.ID, InlineHintsDetector);
