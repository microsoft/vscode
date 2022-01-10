/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LRUCache } from 'vs/base/common/map';
import { IRange } from 'vs/base/common/range';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IActiveCodeEditor, ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { CssProperties, DynamicCssRules } from 'vs/editor/browser/editorDom';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorOption, EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import * as languages from 'vs/editor/common/languages';
import { LanguageFeatureRequestDelays } from 'vs/editor/common/languages/languageFeatureRegistry';
import { IModelDeltaDecoration, InjectedTextOptions, ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationInjectedTextOptions } from 'vs/editor/common/model/textModel';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ClickLinkGesture } from 'vs/editor/contrib/gotoSymbol/link/clickLinkGesture';
import { InlayHintAnchor, InlayHintItem, InlayHintsFragments } from 'vs/editor/contrib/inlayHints/inlayHints';
import { goToDefinitionWithLocation, showGoToContextMenu } from 'vs/editor/contrib/inlayHints/inlayHintsLocations';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
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
	constructor(readonly item: InlayHintItem, readonly index: number) { }

	get part() {
		const label = this.item.hint.label;
		if (typeof label === 'string') {
			return { label };
		} else {
			return label[this.index];
		}
	}
}

export class InlayHintsController implements IEditorContribution {

	static readonly ID: string = 'editor.contrib.InlayHints';

	static get(editor: ICodeEditor) {
		return editor.getContribution(InlayHintsController.ID) ?? undefined;
	}

	private readonly _disposables = new DisposableStore();
	private readonly _sessionDisposables = new DisposableStore();
	private readonly _getInlayHintsDelays = new LanguageFeatureRequestDelays(languages.InlayHintsProviderRegistry, 25, 500);
	private readonly _cache = new InlayHintsCache();
	private readonly _decorationsMetadata = new Map<string, { item: InlayHintItem, classNameRef: IDisposable; }>();
	private readonly _ruleFactory = new DynamicCssRules(this._editor);

	private _activeInlayHintPart?: InlayHintLabelPart;

	constructor(
		private readonly _editor: ICodeEditor,
		@ICommandService private readonly _commandService: ICommandService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) {
		this._disposables.add(languages.InlayHintsProviderRegistry.onDidChange(() => this._update()));
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
		if (!model || !languages.InlayHintsProviderRegistry.has(model)) {
			return;
		}

		// iff possible, quickly update from cache
		const cached = this._cache.get(model);
		if (cached) {
			this._updateHintsDecorators([model.getFullModelRange()], cached);
		}

		let cts: CancellationTokenSource | undefined;

		const scheduler = new RunOnceScheduler(async () => {
			const t1 = Date.now();

			cts?.dispose(true);
			cts = new CancellationTokenSource();

			const ranges = this._getHintsRanges();
			const inlayHints = await InlayHintsFragments.create(model, ranges, cts.token);
			scheduler.delay = this._getInlayHintsDelays.update(model, Date.now() - t1);
			if (cts.token.isCancellationRequested) {
				inlayHints.dispose();
				return;
			}
			this._sessionDisposables.add(inlayHints);
			this._sessionDisposables.add(inlayHints.onDidReceiveProviderSignal(() => scheduler.schedule()));

			this._updateHintsDecorators(ranges, inlayHints.items);
			this._cacheHintsForFastRestore(model);

		}, this._getInlayHintsDelays.get(model));

		this._sessionDisposables.add(scheduler);
		this._sessionDisposables.add(toDisposable(() => cts?.dispose(true)));

		// update inline hints when content or scroll position changes
		this._sessionDisposables.add(this._editor.onDidChangeModelContent(() => scheduler.schedule()));
		this._sessionDisposables.add(this._editor.onDidScrollChange(() => scheduler.schedule()));
		scheduler.schedule();

		// mouse gestures
		this._sessionDisposables.add(this._installLinkGesture());
		this._sessionDisposables.add(this._installContextMenu());
	}

	private _installLinkGesture(): IDisposable {

		let removeHighlight = () => { };
		const gesture = new ClickLinkGesture(this._editor);

		gesture.onMouseMoveOrRelevantKeyDown(e => {
			const [mouseEvent] = e;
			if (mouseEvent.target.type !== MouseTargetType.CONTENT_TEXT || !mouseEvent.hasTriggerModifier) {
				removeHighlight();
				return;
			}
			const model = this._editor.getModel()!;
			const options = mouseEvent.target.detail.injectedText?.options;

			if (!(options instanceof ModelDecorationInjectedTextOptions && options.attachedData instanceof InlayHintLabelPart)) {
				removeHighlight();
				return;
			}

			// render link => when the modifier is pressed and when there is an action
			if (mouseEvent.hasTriggerModifier && options.attachedData.part.action) {

				// resolve the item
				const cts = new CancellationTokenSource();
				options.attachedData.item.resolve(cts.token);

				this._activeInlayHintPart = options.attachedData;

				const lineNumber = this._activeInlayHintPart.item.hint.position.lineNumber;
				const range = new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber));
				const lineHints = new Set<InlayHintItem>();
				for (let data of this._decorationsMetadata.values()) {
					if (range.containsRange(data.item.anchor.range)) {
						lineHints.add(data.item);
					}
				}
				this._updateHintsDecorators([range], Array.from(lineHints));
				removeHighlight = () => {
					cts.dispose(true);
					this._activeInlayHintPart = undefined;
					this._updateHintsDecorators([range], Array.from(lineHints));
				};
			}
		});
		gesture.onCancel(removeHighlight);
		gesture.onExecute(e => {
			if (e.target.type !== MouseTargetType.CONTENT_TEXT) {
				return;
			}
			const options = e.target.detail?.injectedText?.options;
			if (options instanceof ModelDecorationInjectedTextOptions && options.attachedData instanceof InlayHintLabelPart && options.attachedData.part.action) {
				const part = options.attachedData.part;
				if (languages.Command.is(part.action)) {
					// command -> execute it
					this._commandService.executeCommand(part.action.id, ...(part.action.arguments ?? [])).catch(err => this._notificationService.error(err));

				} else if (part.action) {
					// location -> execute go to def
					this._instaService.invokeFunction(goToDefinitionWithLocation, e, this._editor as IActiveCodeEditor, part.action);
				}
			}
		});
		return gesture;
	}

	private _installContextMenu(): IDisposable {
		return this._editor.onContextMenu(async e => {
			if (!(e.event.target instanceof HTMLElement)) {
				return;
			}
			const part = this._getInlayHintLabelPart(e);
			if (part) {
				await this._instaService.invokeFunction(showGoToContextMenu, this._editor, e.event.target, part);
			}
		});
	}

	private _getInlayHintLabelPart(e: IEditorMouseEvent) {
		if (e.target.type !== MouseTargetType.CONTENT_TEXT) {
			return undefined;
		}
		const options = e.target.detail.injectedText?.options;
		if (options instanceof ModelDecorationInjectedTextOptions && options?.attachedData instanceof InlayHintLabelPart) {
			return options.attachedData;
		}
		return undefined;
	}

	private _cacheHintsForFastRestore(model: ITextModel): void {
		const items = new Map<InlayHintItem, InlayHintItem>();
		for (const [id, obj] of this._decorationsMetadata) {
			if (items.has(obj.item)) {
				// an inlay item can be rendered as multiple decorations
				// but they will all uses the same range
				continue;
			}
			let value = obj.item;
			const range = model.getDecorationRange(id);
			if (range) {
				// update range with whatever the editor has tweaked it to
				const anchor = new InlayHintAnchor(range, obj.item.anchor.direction, obj.item.anchor.usesWordRange);
				value = obj.item.with({ anchor });
			}
			items.set(obj.item, value);
		}
		this._cache.set(model, Array.from(items.values()));
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
		const newDecorationsData: { item: InlayHintItem, decoration: IModelDeltaDecoration, classNameRef: IDisposable; }[] = [];

		const fontFamilyVar = '--code-editorInlayHintsFontFamily';
		this._editor.getContainerDomNode().style.setProperty(fontFamilyVar, fontFamily);

		for (const item of items) {

			const parts: languages.InlayHintLabelPart[] = typeof item.hint.label === 'string'
				? [{ label: item.hint.label }]
				: item.hint.label;

			// text w/ links

			const marginBefore = item.hint.whitespaceBefore ? (fontSize / 3) | 0 : 0;
			const marginAfter = item.hint.whitespaceAfter ? (fontSize / 3) | 0 : 0;

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];

				const isFirst = i === 0;
				const isLast = i === parts.length - 1;

				const cssProperties: CssProperties = {
					fontSize: `${fontSize}px`,
					fontFamily: `var(${fontFamilyVar}), ${EDITOR_FONT_DEFAULTS.fontFamily}`,
					verticalAlign: 'middle',
				};

				this._fillInColors(cssProperties, item.hint);

				if (part.action && this._activeInlayHintPart?.item === item && this._activeInlayHintPart.index === i) {
					// active link!
					cssProperties.textDecoration = 'underline';
					cssProperties.cursor = 'pointer';
					cssProperties.color = themeColorFromId(colors.editorActiveLinkForeground);
				}

				if (isFirst && isLast) {
					// only element
					cssProperties.margin = `0 ${marginAfter}px 0 ${marginBefore}px`;
					cssProperties.padding = `1px ${Math.max(1, fontSize / 4) | 0}px`;
					cssProperties.borderRadius = `${(fontSize / 4) | 0}px`;
				} else if (isFirst) {
					// first element
					cssProperties.margin = `0 0 0 ${marginBefore}px`;
					cssProperties.padding = `1px 0 1px ${Math.max(1, fontSize / 4) | 0}px`;
					cssProperties.borderRadius = `${(fontSize / 4) | 0}px 0 0 ${(fontSize / 4) | 0}px`;
				} else if (isLast) {
					// last element
					cssProperties.margin = `0 ${marginAfter}px 0 0`;
					cssProperties.padding = `1px ${Math.max(1, fontSize / 4) | 0}px 1px 0`;
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
								content: fixSpace(part.label),
								inlineClassNameAffectsLetterSpacing: true,
								inlineClassName: classNameRef.className,
								attachedData: new InlayHintLabelPart(item, i)
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

	private _fillInColors(props: CssProperties, hint: languages.InlayHint): void {
		if (hint.kind === languages.InlayHintKind.Parameter) {
			props.backgroundColor = themeColorFromId(colors.editorInlayHintParameterBackground);
			props.color = themeColorFromId(colors.editorInlayHintParameterForeground);
		} else if (hint.kind === languages.InlayHintKind.Type) {
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

CommandsRegistry.registerCommand('_executeInlayHintProvider', async (accessor, ...args: [URI, IRange]): Promise<languages.InlayHint[]> => {

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
