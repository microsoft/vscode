/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { parseLinkedText } from 'vs/base/common/linkedText';
import { LRUCache } from 'vs/base/common/map';
import { IRange } from 'vs/base/common/range';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { CssProperties, DynamicCssRules } from 'vs/editor/browser/editorDom';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorOption, EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { InlayHint, InlayHintKind, InlayHintsProviderRegistry } from 'vs/editor/common/languages';
import { LanguageFeatureRequestDelays } from 'vs/editor/common/languages/languageFeatureRegistry';
import { IModelDeltaDecoration, InjectedTextOptions, ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationInjectedTextOptions } from 'vs/editor/common/model/textModel';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ClickLinkGesture } from 'vs/editor/contrib/gotoSymbol/link/clickLinkGesture';
import { InlayHintItem, InlayHintsFragments } from 'vs/editor/contrib/inlayHints/inlayHints';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import * as colors from 'vs/platform/theme/common/colorRegistry';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';

const MAX_DECORATORS = 1500;


class InlayHintsCache {

	private readonly _entries = new LRUCache<string, InlayHintItem[]>(50);

	get(model: ITextModel): InlayHintItem[] | undefined {
		const key = InlayHintsCache._key(model);
		return this._entries.get(key);
	}

	set(model: ITextModel, value: InlayHintItem[]): void {
		const key = InlayHintsCache._key(model);
		this._entries.set(key, value);
	}

	private static _key(model: ITextModel): string {
		return `${model.uri.toString()}/${model.getVersionId()}`;
	}
}

export class InlayHintLabelPart {
	constructor(readonly item: InlayHintItem, readonly index: number, readonly href?: string) { }
}

export class InlayHintsController implements IEditorContribution {

	static readonly ID: string = 'editor.contrib.InlayHints';

	static get(editor: ICodeEditor) {
		return editor.getContribution(InlayHintsController.ID) ?? undefined;
	}

	private readonly _disposables = new DisposableStore();
	private readonly _sessionDisposables = new DisposableStore();
	private readonly _getInlayHintsDelays = new LanguageFeatureRequestDelays(InlayHintsProviderRegistry, 25, 500);
	private readonly _cache = new InlayHintsCache();
	private readonly _decorationsMetadata = new Map<string, { item: InlayHintItem, classNameRef: IDisposable }>();
	private readonly _ruleFactory = new DynamicCssRules(this._editor);

	private _activeInlayHintPart?: InlayHintLabelPart;

	constructor(
		private readonly _editor: ICodeEditor,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		this._disposables.add(InlayHintsProviderRegistry.onDidChange(() => this._update()));
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
		this._removeAllDecorations();

		if (!this._editor.getOption(EditorOption.inlayHints).enabled) {
			return;
		}

		const model = this._editor.getModel();
		if (!model || !InlayHintsProviderRegistry.has(model)) {
			return;
		}

		// iff possible, quickly update from cache
		const cached = this._cache.get(model);
		if (cached) {
			this._updateHintsDecorators([model.getFullModelRange()], cached);
		}

		const scheduler = new RunOnceScheduler(async () => {
			const t1 = Date.now();

			const cts = new CancellationTokenSource();
			this._sessionDisposables.add(toDisposable(() => cts.dispose(true)));

			const ranges = this._getHintsRanges();
			const inlayHints = await InlayHintsFragments.create(model, ranges, cts.token);
			this._sessionDisposables.add(inlayHints);
			this._sessionDisposables.add(inlayHints.onDidReceiveProviderSignal(() => scheduler.schedule()));

			scheduler.delay = this._getInlayHintsDelays.update(model, Date.now() - t1);
			if (cts.token.isCancellationRequested) {
				return;
			}
			this._updateHintsDecorators(ranges, inlayHints.items);
			this._cacheHintsForFastRestore(model);

		}, this._getInlayHintsDelays.get(model));

		this._sessionDisposables.add(scheduler);

		// update inline hints when content or scroll position changes
		this._sessionDisposables.add(this._editor.onDidChangeModelContent(() => scheduler.schedule()));
		this._sessionDisposables.add(this._editor.onDidScrollChange(() => scheduler.schedule()));
		scheduler.schedule();

		// link gesture
		this._sessionDisposables.add(this._installLinkGesture());
	}

	private _installLinkGesture(): IDisposable {

		let removeHighlight = () => { };
		const gesture = new ClickLinkGesture(this._editor);

		gesture.onMouseMoveOrRelevantKeyDown(e => {
			const [mouseEvent] = e;
			if (mouseEvent.target.type !== MouseTargetType.CONTENT_TEXT || typeof mouseEvent.target.detail !== 'object' || !mouseEvent.hasTriggerModifier) {
				removeHighlight();
				return;
			}
			const model = this._editor.getModel()!;
			const options = mouseEvent.target.detail?.injectedText?.options;
			if (options instanceof ModelDecorationInjectedTextOptions && options.attachedData instanceof InlayHintLabelPart && options.attachedData.href) {
				this._activeInlayHintPart = options.attachedData;

				const lineNumber = this._activeInlayHintPart.item.hint.position.lineNumber;
				const range = new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber));
				const lineHints = new Set<InlayHintItem>();
				for (let data of this._decorationsMetadata.values()) {
					if (range.containsPosition(data.item.hint.position)) {
						lineHints.add(data.item);
					}
				}
				this._updateHintsDecorators([range], Array.from(lineHints));
				removeHighlight = () => {
					this._activeInlayHintPart = undefined;
					this._updateHintsDecorators([range], Array.from(lineHints));
				};
			}
		});
		gesture.onCancel(removeHighlight);
		gesture.onExecute(e => {
			if (e.target.type !== MouseTargetType.CONTENT_TEXT || typeof e.target.detail !== 'object' || !e.hasTriggerModifier) {
				return;
			}
			const options = e.target.detail?.injectedText?.options;
			if (options instanceof ModelDecorationInjectedTextOptions && options.attachedData instanceof InlayHintLabelPart && options.attachedData.href) {
				this._openerService.open(options.attachedData.href, { allowCommands: true, openToSide: e.hasSideBySideModifier });
			}
		});
		return gesture;
	}

	private _cacheHintsForFastRestore(model: ITextModel): void {
		const items = new Set<InlayHintItem>();
		for (const [id, obj] of this._decorationsMetadata) {
			if (items.has(obj.item)) {
				// an inlay item can be rendered as multiple decorations
				// but they will all uses the same range
				continue;
			}
			items.add(obj.item);
			const range = model.getDecorationRange(id);
			if (range) {
				// update range with whatever the editor has tweaked it to
				obj.item.anchor.range = range;
			}
		}
		this._cache.set(model, Array.from(items));
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

	private _updateHintsDecorators(ranges: Range[], items: readonly InlayHintItem[]): void {

		const { fontSize, fontFamily } = this._getLayoutInfo();
		const newDecorationsData: { item: InlayHintItem, decoration: IModelDeltaDecoration, classNameRef: IDisposable }[] = [];

		const fontFamilyVar = '--code-editorInlayHintsFontFamily';
		this._editor.getContainerDomNode().style.setProperty(fontFamilyVar, fontFamily);

		for (const item of items) {

			// text w/ links
			const { nodes } = parseLinkedText(item.hint.label);
			const marginBefore = item.hint.whitespaceBefore ? (fontSize / 3) | 0 : 0;
			const marginAfter = item.hint.whitespaceAfter ? (fontSize / 3) | 0 : 0;

			for (let i = 0; i < nodes.length; i++) {
				const node = nodes[i];

				const isFirst = i === 0;
				const isLast = i === nodes.length - 1;
				const isLink = typeof node === 'object';

				const cssProperties: CssProperties = {
					fontSize: `${fontSize}px`,
					fontFamily: `var(${fontFamilyVar}), ${EDITOR_FONT_DEFAULTS.fontFamily}`,
					verticalAlign: 'middle',
				};

				this._fillInColors(cssProperties, item.hint);

				if (isLink) {
					cssProperties.textDecoration = 'underline';

					if (this._activeInlayHintPart?.item === item && this._activeInlayHintPart.index === i && this._activeInlayHintPart.href === node.href) {
						// active link!
						cssProperties.cursor = 'pointer';
						cssProperties.color = themeColorFromId(colors.editorActiveLinkForeground);
					}
				}

				if (isFirst && isLast) {
					// only element
					cssProperties.margin = `0px ${marginAfter}px 0px ${marginBefore}px`;
					cssProperties.padding = `1px ${Math.max(1, fontSize / 4) | 0}px`;
					cssProperties.borderRadius = `${(fontSize / 4) | 0}px`;
				} else if (isFirst) {
					// first element
					cssProperties.margin = `0px 0 0 ${marginAfter}px`;
					cssProperties.padding = `1px 0 0 ${Math.max(1, fontSize / 4) | 0}px`;
					cssProperties.borderRadius = `${(fontSize / 4) | 0}px 0 0 ${(fontSize / 4) | 0}px`;
				} else if (isLast) {
					// last element
					cssProperties.margin = `0px ${marginAfter}px 0 0`;
					cssProperties.padding = `1px ${Math.max(1, fontSize / 4) | 0}px 0 0`;
					cssProperties.borderRadius = `0 ${(fontSize / 4) | 0}px ${(fontSize / 4) | 0}px 0`;
				} else {
					cssProperties.padding = `1px 0 1px 0`;
				}

				const classNameRef = this._ruleFactory.createClassNameRef(cssProperties);

				newDecorationsData.push({
					item,
					classNameRef,
					decoration: {
						range: item.anchor.range,
						options: {
							[item.anchor.direction]: {
								content: fixSpace(isLink ? node.label : node),
								inlineClassNameAffectsLetterSpacing: true,
								inlineClassName: classNameRef.className,
								attachedData: new InlayHintLabelPart(item, i, isLink ? node.href : undefined)
							} as InjectedTextOptions,
							description: 'InlayHint',
							showIfCollapsed: !item.anchor.usesWordRange,
							stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
						}
					},
				});
			}

			if (newDecorationsData.length > MAX_DECORATORS) {
				break;
			}
		}

		// collect all decoration ids that are affected by the ranges
		// and only update those decorations
		const decorationIdsToReplace: string[] = [];
		for (const range of ranges) {

			for (const { id } of this._editor.getDecorationsInRange(range) ?? []) {
				const metadata = this._decorationsMetadata.get(id);
				if (metadata) {
					decorationIdsToReplace.push(id);
					metadata.classNameRef.dispose();
					this._decorationsMetadata.delete(id);
				}
			}
		}
		const newDecorationIds = this._editor.deltaDecorations(decorationIdsToReplace, newDecorationsData.map(d => d.decoration));
		for (let i = 0; i < newDecorationIds.length; i++) {
			const data = newDecorationsData[i];
			this._decorationsMetadata.set(newDecorationIds[i], { item: data.item, classNameRef: data.classNameRef });
		}
	}

	private _fillInColors(props: CssProperties, hint: InlayHint): void {
		if (hint.kind === InlayHintKind.Parameter) {
			props.backgroundColor = themeColorFromId(colors.editorInlayHintParameterBackground);
			props.color = themeColorFromId(colors.editorInlayHintParameterForeground);
		} else if (hint.kind === InlayHintKind.Type) {
			props.backgroundColor = themeColorFromId(colors.editorInlayHintTypeBackground);
			props.color = themeColorFromId(colors.editorInlayHintTypeForeground);
		} else {
			props.backgroundColor = themeColorFromId(colors.editorInlayHintBackground);
			props.color = themeColorFromId(colors.editorInlayHintForeground);
		}
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
		this._editor.deltaDecorations(Array.from(this._decorationsMetadata.keys()), []);
		for (let obj of this._decorationsMetadata.values()) {
			obj.classNameRef.dispose();
		}
		this._decorationsMetadata.clear();
	}
}



// Prevents the view from potentially visible whitespace
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
		const model = await InlayHintsFragments.create(ref.object.textEditorModel, [Range.lift(range)], CancellationToken.None);
		const result = model.items.map(i => i.hint);
		setTimeout(() => model.dispose(), 0); // dispose after sending to ext host
		return result;
	} finally {
		ref.dispose();
	}
});
