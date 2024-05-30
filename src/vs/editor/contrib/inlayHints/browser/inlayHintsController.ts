/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHTMLElement, ModifierKeyEmitter } from 'vs/base/browser/dom';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { onUnexpectedError } from 'vs/base/common/errors';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LRUCache } from 'vs/base/common/map';
import { IRange } from 'vs/base/common/range';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IActiveCodeEditor, ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { ClassNameReference, CssProperties, DynamicCssRules } from 'vs/editor/browser/editorDom';
import { StableEditorScrollState } from 'vs/editor/browser/stableEditorScroll';
import { EditorOption, EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import * as languages from 'vs/editor/common/languages';
import { IModelDeltaDecoration, InjectedTextCursorStops, InjectedTextOptions, ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationInjectedTextOptions } from 'vs/editor/common/model/textModel';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ClickLinkGesture, ClickLinkMouseEvent } from 'vs/editor/contrib/gotoSymbol/browser/link/clickLinkGesture';
import { InlayHintAnchor, InlayHintItem, InlayHintsFragments } from 'vs/editor/contrib/inlayHints/browser/inlayHints';
import { goToDefinitionWithLocation, showGoToContextMenu } from 'vs/editor/contrib/inlayHints/browser/inlayHintsLocations';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import * as colors from 'vs/platform/theme/common/colorRegistry';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';

// --- hint caching service (per session)

class InlayHintsCache {

	declare readonly _serviceBrand: undefined;

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

interface IInlayHintsCache extends InlayHintsCache { }
const IInlayHintsCache = createDecorator<IInlayHintsCache>('IInlayHintsCache');
registerSingleton(IInlayHintsCache, InlayHintsCache, InstantiationType.Delayed);

// --- rendered label

export class RenderedInlayHintLabelPart {
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

class ActiveInlayHintInfo {
	constructor(readonly part: RenderedInlayHintLabelPart, readonly hasTriggerModifier: boolean) { }
}

type InlayHintDecorationRenderInfo = {
	item: InlayHintItem;
	decoration: IModelDeltaDecoration;
	classNameRef: ClassNameReference;
};

const enum RenderMode {
	Normal,
	Invisible
}

// --- controller

export class InlayHintsController implements IEditorContribution {

	static readonly ID: string = 'editor.contrib.InlayHints';

	private static readonly _MAX_DECORATORS = 1500;
	private static readonly _MAX_LABEL_LEN = 43;

	static get(editor: ICodeEditor): InlayHintsController | undefined {
		return editor.getContribution<InlayHintsController>(InlayHintsController.ID) ?? undefined;
	}

	private readonly _disposables = new DisposableStore();
	private readonly _sessionDisposables = new DisposableStore();
	private readonly _debounceInfo: IFeatureDebounceInformation;
	private readonly _decorationsMetadata = new Map<string, InlayHintDecorationRenderInfo>();
	private readonly _ruleFactory = new DynamicCssRules(this._editor);

	private _activeRenderMode = RenderMode.Normal;
	private _activeInlayHintPart?: ActiveInlayHintInfo;

	constructor(
		private readonly _editor: ICodeEditor,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageFeatureDebounceService _featureDebounce: ILanguageFeatureDebounceService,
		@IInlayHintsCache private readonly _inlayHintsCache: IInlayHintsCache,
		@ICommandService private readonly _commandService: ICommandService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) {
		this._debounceInfo = _featureDebounce.for(_languageFeaturesService.inlayHintsProvider, 'InlayHint', { min: 25 });
		this._disposables.add(_languageFeaturesService.inlayHintsProvider.onDidChange(() => this._update()));
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

		const options = this._editor.getOption(EditorOption.inlayHints);
		if (options.enabled === 'off') {
			return;
		}

		const model = this._editor.getModel();
		if (!model || !this._languageFeaturesService.inlayHintsProvider.has(model)) {
			return;
		}

		if (options.enabled === 'on') {
			// different "on" modes: always
			this._activeRenderMode = RenderMode.Normal;
		} else {
			// different "on" modes: offUnlessPressed, or onUnlessPressed
			let defaultMode: RenderMode;
			let altMode: RenderMode;
			if (options.enabled === 'onUnlessPressed') {
				defaultMode = RenderMode.Normal;
				altMode = RenderMode.Invisible;
			} else {
				defaultMode = RenderMode.Invisible;
				altMode = RenderMode.Normal;
			}
			this._activeRenderMode = defaultMode;

			this._sessionDisposables.add(ModifierKeyEmitter.getInstance().event(e => {
				if (!this._editor.hasModel()) {
					return;
				}
				const newRenderMode = e.altKey && e.ctrlKey && !(e.shiftKey || e.metaKey) ? altMode : defaultMode;
				if (newRenderMode !== this._activeRenderMode) {
					this._activeRenderMode = newRenderMode;
					const model = this._editor.getModel();
					const copies = this._copyInlayHintsWithCurrentAnchor(model);
					this._updateHintsDecorators([model.getFullModelRange()], copies);
					scheduler.schedule(0);
				}
			}));
		}

		// iff possible, quickly update from cache
		const cached = this._inlayHintsCache.get(model);
		if (cached) {
			this._updateHintsDecorators([model.getFullModelRange()], cached);
		}
		this._sessionDisposables.add(toDisposable(() => {
			// cache items when switching files etc
			if (!model.isDisposed()) {
				this._cacheHintsForFastRestore(model);
			}
		}));

		let cts: CancellationTokenSource | undefined;
		const watchedProviders = new Set<languages.InlayHintsProvider>();

		const scheduler = new RunOnceScheduler(async () => {
			const t1 = Date.now();

			cts?.dispose(true);
			cts = new CancellationTokenSource();
			const listener = model.onWillDispose(() => cts?.cancel());

			try {
				const myToken = cts.token;
				const inlayHints = await InlayHintsFragments.create(this._languageFeaturesService.inlayHintsProvider, model, this._getHintsRanges(), myToken);
				scheduler.delay = this._debounceInfo.update(model, Date.now() - t1);
				if (myToken.isCancellationRequested) {
					inlayHints.dispose();
					return;
				}

				// listen to provider changes
				for (const provider of inlayHints.provider) {
					if (typeof provider.onDidChangeInlayHints === 'function' && !watchedProviders.has(provider)) {
						watchedProviders.add(provider);
						this._sessionDisposables.add(provider.onDidChangeInlayHints(() => {
							if (!scheduler.isScheduled()) { // ignore event when request is already scheduled
								scheduler.schedule();
							}
						}));
					}
				}

				this._sessionDisposables.add(inlayHints);
				this._updateHintsDecorators(inlayHints.ranges, inlayHints.items);
				this._cacheHintsForFastRestore(model);

			} catch (err) {
				onUnexpectedError(err);

			} finally {
				cts.dispose();
				listener.dispose();
			}

		}, this._debounceInfo.get(model));

		this._sessionDisposables.add(scheduler);
		this._sessionDisposables.add(toDisposable(() => cts?.dispose(true)));
		scheduler.schedule(0);

		this._sessionDisposables.add(this._editor.onDidScrollChange((e) => {
			// update when scroll position changes
			// uses scrollTopChanged has weak heuristic to differenatiate between scrolling due to
			// typing or due to "actual" scrolling
			if (e.scrollTopChanged || !scheduler.isScheduled()) {
				scheduler.schedule();
			}
		}));
		this._sessionDisposables.add(this._editor.onDidChangeModelContent((e) => {
			cts?.cancel();

			// update less aggressive when typing
			const delay = Math.max(scheduler.delay, 1250);
			scheduler.schedule(delay);
		}));

		// mouse gestures
		this._sessionDisposables.add(this._installDblClickGesture(() => scheduler.schedule(0)));
		this._sessionDisposables.add(this._installLinkGesture());
		this._sessionDisposables.add(this._installContextMenu());
	}

	private _installLinkGesture(): IDisposable {

		const store = new DisposableStore();
		const gesture = store.add(new ClickLinkGesture(this._editor));

		// let removeHighlight = () => { };

		const sessionStore = new DisposableStore();
		store.add(sessionStore);

		store.add(gesture.onMouseMoveOrRelevantKeyDown(e => {
			const [mouseEvent] = e;
			const labelPart = this._getInlayHintLabelPart(mouseEvent);
			const model = this._editor.getModel();

			if (!labelPart || !model) {
				sessionStore.clear();
				return;
			}

			// resolve the item
			const cts = new CancellationTokenSource();
			sessionStore.add(toDisposable(() => cts.dispose(true)));
			labelPart.item.resolve(cts.token);

			// render link => when the modifier is pressed and when there is a command or location
			this._activeInlayHintPart = labelPart.part.command || labelPart.part.location
				? new ActiveInlayHintInfo(labelPart, mouseEvent.hasTriggerModifier)
				: undefined;

			const lineNumber = model.validatePosition(labelPart.item.hint.position).lineNumber;
			const range = new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber));
			const lineHints = this._getInlineHintsForRange(range);
			this._updateHintsDecorators([range], lineHints);
			sessionStore.add(toDisposable(() => {
				this._activeInlayHintPart = undefined;
				this._updateHintsDecorators([range], lineHints);
			}));
		}));
		store.add(gesture.onCancel(() => sessionStore.clear()));
		store.add(gesture.onExecute(async e => {
			const label = this._getInlayHintLabelPart(e);
			if (label) {
				const part = label.part;
				if (part.location) {
					// location -> execute go to def
					this._instaService.invokeFunction(goToDefinitionWithLocation, e, this._editor as IActiveCodeEditor, part.location);
				} else if (languages.Command.is(part.command)) {
					// command -> execute it
					await this._invokeCommand(part.command, label.item);
				}
			}
		}));
		return store;
	}

	private _getInlineHintsForRange(range: Range) {
		const lineHints = new Set<InlayHintItem>();
		for (const data of this._decorationsMetadata.values()) {
			if (range.containsRange(data.item.anchor.range)) {
				lineHints.add(data.item);
			}
		}
		return Array.from(lineHints);
	}

	private _installDblClickGesture(updateInlayHints: Function): IDisposable {
		return this._editor.onMouseUp(async e => {
			if (e.event.detail !== 2) {
				return;
			}
			const part = this._getInlayHintLabelPart(e);
			if (!part) {
				return;
			}
			e.event.preventDefault();
			await part.item.resolve(CancellationToken.None);
			if (isNonEmptyArray(part.item.hint.textEdits)) {
				const edits = part.item.hint.textEdits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text));
				this._editor.executeEdits('inlayHint.default', edits);
				updateInlayHints();
			}
		});
	}

	private _installContextMenu(): IDisposable {
		return this._editor.onContextMenu(async e => {
			if (!(isHTMLElement(e.event.target))) {
				return;
			}
			const part = this._getInlayHintLabelPart(e);
			if (part) {
				await this._instaService.invokeFunction(showGoToContextMenu, this._editor, e.event.target, part);
			}
		});
	}

	private _getInlayHintLabelPart(e: IEditorMouseEvent | ClickLinkMouseEvent): RenderedInlayHintLabelPart | undefined {
		if (e.target.type !== MouseTargetType.CONTENT_TEXT) {
			return undefined;
		}
		const options = e.target.detail.injectedText?.options;
		if (options instanceof ModelDecorationInjectedTextOptions && options?.attachedData instanceof RenderedInlayHintLabelPart) {
			return options.attachedData;
		}
		return undefined;
	}

	private async _invokeCommand(command: languages.Command, item: InlayHintItem) {
		try {
			await this._commandService.executeCommand(command.id, ...(command.arguments ?? []));
		} catch (err) {
			this._notificationService.notify({
				severity: Severity.Error,
				source: item.provider.displayName,
				message: err
			});
		}
	}

	private _cacheHintsForFastRestore(model: ITextModel): void {
		const hints = this._copyInlayHintsWithCurrentAnchor(model);
		this._inlayHintsCache.set(model, hints);
	}

	// return inlay hints but with an anchor that reflects "updates"
	// that happened after receiving them, e.g adding new lines before a hint
	private _copyInlayHintsWithCurrentAnchor(model: ITextModel): InlayHintItem[] {
		const items = new Map<InlayHintItem, InlayHintItem>();
		for (const [id, obj] of this._decorationsMetadata) {
			if (items.has(obj.item)) {
				// an inlay item can be rendered as multiple decorations
				// but they will all uses the same range
				continue;
			}
			const range = model.getDecorationRange(id);
			if (range) {
				// update range with whatever the editor has tweaked it to
				const anchor = new InlayHintAnchor(range, obj.item.anchor.direction);
				const copy = obj.item.with({ anchor });
				items.set(obj.item, copy);
			}
		}
		return Array.from(items.values());
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

	private _updateHintsDecorators(ranges: readonly Range[], items: readonly InlayHintItem[]): void {

		// utils to collect/create injected text decorations
		const newDecorationsData: InlayHintDecorationRenderInfo[] = [];
		const addInjectedText = (item: InlayHintItem, ref: ClassNameReference, content: string, cursorStops: InjectedTextCursorStops, attachedData?: RenderedInlayHintLabelPart): void => {
			const opts: InjectedTextOptions = {
				content,
				inlineClassNameAffectsLetterSpacing: true,
				inlineClassName: ref.className,
				cursorStops,
				attachedData
			};
			newDecorationsData.push({
				item,
				classNameRef: ref,
				decoration: {
					range: item.anchor.range,
					options: {
						// className: "rangeHighlight", // DEBUG highlight to see to what range a hint is attached
						description: 'InlayHint',
						showIfCollapsed: item.anchor.range.isEmpty(), // "original" range is empty
						collapseOnReplaceEdit: !item.anchor.range.isEmpty(),
						stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
						[item.anchor.direction]: this._activeRenderMode === RenderMode.Normal ? opts : undefined
					}
				}
			});
		};

		const addInjectedWhitespace = (item: InlayHintItem, isLast: boolean): void => {
			const marginRule = this._ruleFactory.createClassNameRef({
				width: `${(fontSize / 3) | 0}px`,
				display: 'inline-block'
			});
			addInjectedText(item, marginRule, '\u200a', isLast ? InjectedTextCursorStops.Right : InjectedTextCursorStops.None);
		};


		//
		const { fontSize, fontFamily, padding, isUniform } = this._getLayoutInfo();
		const fontFamilyVar = '--code-editorInlayHintsFontFamily';
		this._editor.getContainerDomNode().style.setProperty(fontFamilyVar, fontFamily);


		type ILineInfo = { line: number; totalLen: number };
		let currentLineInfo: ILineInfo = { line: 0, totalLen: 0 };

		for (const item of items) {

			if (currentLineInfo.line !== item.anchor.range.startLineNumber) {
				currentLineInfo = { line: item.anchor.range.startLineNumber, totalLen: 0 };
			}

			if (currentLineInfo.totalLen > InlayHintsController._MAX_LABEL_LEN) {
				continue;
			}

			// whitespace leading the actual label
			if (item.hint.paddingLeft) {
				addInjectedWhitespace(item, false);
			}

			// the label with its parts
			const parts: languages.InlayHintLabelPart[] = typeof item.hint.label === 'string'
				? [{ label: item.hint.label }]
				: item.hint.label;

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];

				const isFirst = i === 0;
				const isLast = i === parts.length - 1;

				const cssProperties: CssProperties = {
					fontSize: `${fontSize}px`,
					fontFamily: `var(${fontFamilyVar}), ${EDITOR_FONT_DEFAULTS.fontFamily}`,
					verticalAlign: isUniform ? 'baseline' : 'middle',
					unicodeBidi: 'isolate'
				};

				if (isNonEmptyArray(item.hint.textEdits)) {
					cssProperties.cursor = 'default';
				}

				this._fillInColors(cssProperties, item.hint);

				if ((part.command || part.location) && this._activeInlayHintPart?.part.item === item && this._activeInlayHintPart.part.index === i) {
					// active link!
					cssProperties.textDecoration = 'underline';
					if (this._activeInlayHintPart.hasTriggerModifier) {
						cssProperties.color = themeColorFromId(colors.editorActiveLinkForeground);
						cssProperties.cursor = 'pointer';
					}
				}

				if (padding) {
					if (isFirst && isLast) {
						// only element
						cssProperties.padding = `1px ${Math.max(1, fontSize / 4) | 0}px`;
						cssProperties.borderRadius = `${(fontSize / 4) | 0}px`;
					} else if (isFirst) {
						// first element
						cssProperties.padding = `1px 0 1px ${Math.max(1, fontSize / 4) | 0}px`;
						cssProperties.borderRadius = `${(fontSize / 4) | 0}px 0 0 ${(fontSize / 4) | 0}px`;
					} else if (isLast) {
						// last element
						cssProperties.padding = `1px ${Math.max(1, fontSize / 4) | 0}px 1px 0`;
						cssProperties.borderRadius = `0 ${(fontSize / 4) | 0}px ${(fontSize / 4) | 0}px 0`;
					} else {
						cssProperties.padding = `1px 0 1px 0`;
					}
				}

				let textlabel = part.label;
				currentLineInfo.totalLen += textlabel.length;
				let tooLong = false;
				const over = currentLineInfo.totalLen - InlayHintsController._MAX_LABEL_LEN;
				if (over > 0) {
					textlabel = textlabel.slice(0, -over) + '…';
					tooLong = true;
				}

				addInjectedText(
					item,
					this._ruleFactory.createClassNameRef(cssProperties),
					fixSpace(textlabel),
					isLast && !item.hint.paddingRight ? InjectedTextCursorStops.Right : InjectedTextCursorStops.None,
					new RenderedInlayHintLabelPart(item, i)
				);

				if (tooLong) {
					break;
				}
			}

			// whitespace trailing the actual label
			if (item.hint.paddingRight) {
				addInjectedWhitespace(item, true);
			}

			if (newDecorationsData.length > InlayHintsController._MAX_DECORATORS) {
				break;
			}
		}

		// collect all decoration ids that are affected by the ranges
		// and only update those decorations
		const decorationIdsToReplace: string[] = [];
		for (const [id, metadata] of this._decorationsMetadata) {
			const range = this._editor.getModel()?.getDecorationRange(id);
			if (range && ranges.some(r => r.containsRange(range))) {
				decorationIdsToReplace.push(id);
				metadata.classNameRef.dispose();
				this._decorationsMetadata.delete(id);
			}
		}

		const scrollState = StableEditorScrollState.capture(this._editor);

		this._editor.changeDecorations(accessor => {
			const newDecorationIds = accessor.deltaDecorations(decorationIdsToReplace, newDecorationsData.map(d => d.decoration));
			for (let i = 0; i < newDecorationIds.length; i++) {
				const data = newDecorationsData[i];
				this._decorationsMetadata.set(newDecorationIds[i], data);
			}
		});

		scrollState.restore(this._editor);
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
		const padding = options.padding;

		const editorFontSize = this._editor.getOption(EditorOption.fontSize);
		const editorFontFamily = this._editor.getOption(EditorOption.fontFamily);

		let fontSize = options.fontSize;
		if (!fontSize || fontSize < 5 || fontSize > editorFontSize) {
			fontSize = editorFontSize;
		}

		const fontFamily = options.fontFamily || editorFontFamily;

		const isUniform = !padding
			&& fontFamily === editorFontFamily
			&& fontSize === editorFontSize;

		return { fontSize, fontFamily, padding, isUniform };
	}

	private _removeAllDecorations(): void {
		this._editor.removeDecorations(Array.from(this._decorationsMetadata.keys()));
		for (const obj of this._decorationsMetadata.values()) {
			obj.classNameRef.dispose();
		}
		this._decorationsMetadata.clear();
	}


	// --- accessibility

	getInlayHintsForLine(line: number): InlayHintItem[] {
		if (!this._editor.hasModel()) {
			return [];
		}
		const set = new Set<languages.InlayHint>();
		const result: InlayHintItem[] = [];
		for (const deco of this._editor.getLineDecorations(line)) {
			const data = this._decorationsMetadata.get(deco.id);
			if (data && !set.has(data.item.hint)) {
				set.add(data.item.hint);
				result.push(data.item);
			}
		}
		return result;
	}
}


// Prevents the view from potentially visible whitespace
function fixSpace(str: string): string {
	const noBreakWhitespace = '\xa0';
	return str.replace(/[ \t]/g, noBreakWhitespace);
}

CommandsRegistry.registerCommand('_executeInlayHintProvider', async (accessor, ...args: [URI, IRange]): Promise<languages.InlayHint[]> => {

	const [uri, range] = args;
	assertType(URI.isUri(uri));
	assertType(Range.isIRange(range));

	const { inlayHintsProvider } = accessor.get(ILanguageFeaturesService);
	const ref = await accessor.get(ITextModelService).createModelReference(uri);
	try {
		const model = await InlayHintsFragments.create(inlayHintsProvider, ref.object.textEditorModel, [Range.lift(range)], CancellationToken.None);
		const result = model.items.map(i => i.hint);
		setTimeout(() => model.dispose(), 0); // dispose after sending to ext host
		return result;
	} finally {
		ref.dispose();
	}
});
