/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, TimeoutTimer, createCancelablePromise } from 'vs/base/common/async';
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
import { inlineHintForeground, inlineHintBackground } from 'vs/platform/theme/common/colorRegistry';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Range } from 'vs/editor/common/core/range';

const MAX_DECORATORS = 500;

export interface InlineHintsData {
	list: InlineHint[];
	provider: InlineHintsProvider;
}

export function getSignatures(model: ITextModel, ranges: Range[], token: CancellationToken): Promise<InlineHintsData[]> {
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

	static readonly RECOMPUTE_TIME = 1000; // ms

	private readonly _localToDispose = this._register(new DisposableStore());
	private _computePromise: CancelablePromise<InlineHintsData[]> | null;
	private _timeoutTimer: TimeoutTimer | null;

	private _decorationsIds: string[] = [];
	private _hintsDatas = new Map<string, InlineHintsData>();

	private _hintsDecoratorIds: string[] = [];
	private readonly _decorationsTypes = new Set<string>();

	private _isEnabled: boolean;

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
		}))

		this._timeoutTimer = null;
		this._computePromise = null;
		this._isEnabled = this.isEnabled();
		this._onModelChanged();
	}

	isEnabled(): boolean {
		const model = this._editor.getModel();
		if (!model) {
			return false;
		}

		return this._editor.getOption(EditorOption.showInlineHints);
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

		this._localToDispose.add(this._editor.onDidChangeModelContent(() => {
			if (!this._timeoutTimer) {
				this._timeoutTimer = new TimeoutTimer();
				this._timeoutTimer.cancelAndSet(() => {
					this._timeoutTimer = null;

					this._beginCompute();
				}, InlineHintsDetector.RECOMPUTE_TIME);
			}
		}));
		this._beginCompute();
	}

	private _beginCompute(): void {
		this._computePromise = createCancelablePromise(token => {
			const model = this._editor.getModel();
			if (!model) {
				return Promise.resolve([]);
			}

			const visibleRanges = this._editor.getVisibleRangesPlusViewportAboveBelow();
			return getSignatures(model, visibleRanges, token);
		});
		this._computePromise.then((hintsData) => {
			this._updateDecorations(hintsData);
			this._updateHintsDecorators(hintsData);
			this._computePromise = null;
		}, onUnexpectedError);
	}

	private _stop(): void {
		if (this._timeoutTimer) {
			this._timeoutTimer.cancel();
			this._timeoutTimer = null;
		}
		if (this._computePromise) {
			this._computePromise.cancel();
			this._computePromise = null;
		}
		this._localToDispose.clear();
	}

	private _updateDecorations(hintsData: InlineHintsData[]): void {
		const decorations = flatten(hintsData.map(hints => hints.list.map(hint => {
			return {
				range: {
					startLineNumber: hint.position.lineNumber,
					startColumn: hint.position.column,
					endLineNumber: hint.position.lineNumber,
					endColumn: hint.position.column
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
		const { fontSize } = this._getLayoutInfo();
		const backgroundColor = this._themeService.getColorTheme().getColor(inlineHintBackground);
		const fontColor = this._themeService.getColorTheme().getColor(inlineHintForeground);

		for (let i = 0; i < hintsData.length; i++) {
			const hint = hintsData[i].list;
			for (let j = 0; j < hint.length && decorations.length < MAX_DECORATORS; j++) {
				const { text, position } = hint[j];

				const subKey = hash(text).toString(16);
				let key = 'inlineHints-' + subKey;

				if (!this._decorationsTypes.has(key) && !newDecorationsTypes[key]) {
					this._codeEditorService.registerDecorationType(key, {
						before: {
							contentText: text,
							backgroundColor: `${backgroundColor}`,
							color: `${fontColor}`,
							margin: '0px 5px 0px 0px',
							fontSize: `${fontSize}px`,
							padding: '0px 2px'
						}
					}, undefined, this._editor);
				}

				newDecorationsTypes[key] = true;
				decorations.push({
					range: {
						startLineNumber: position.lineNumber,
						startColumn: position.column,
						endLineNumber: position.lineNumber,
						endColumn: position.column
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
		const fontSize = (this._editor.getOption(EditorOption.fontSize) * .9) | 0;
		return { fontSize };
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
