/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var InlayHintsController_1;
import { isHTMLElement, ModifierKeyEmitter } from '../../../../base/browser/dom.js';
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { disposableTimeout, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { DynamicCssRules } from '../../../browser/editorDom.js';
import { StableEditorScrollState } from '../../../browser/stableEditorScroll.js';
import { EDITOR_FONT_DEFAULTS } from '../../../common/config/fontInfo.js';
import { EditOperation } from '../../../common/core/editOperation.js';
import { Range } from '../../../common/core/range.js';
import * as languages from '../../../common/languages.js';
import { InjectedTextCursorStops } from '../../../common/model.js';
import { ModelDecorationInjectedTextOptions } from '../../../common/model/textModel.js';
import { ILanguageFeatureDebounceService } from '../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { ITextModelService } from '../../../common/services/resolverService.js';
import { ClickLinkGesture } from '../../gotoSymbol/browser/link/clickLinkGesture.js';
import { InlayHintAnchor, InlayHintsFragments } from './inlayHints.js';
import { goToDefinitionWithLocation, showGoToContextMenu } from './inlayHintsLocations.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import * as colors from '../../../../platform/theme/common/colorRegistry.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
// --- hint caching service (per session)
class InlayHintsCache {
    constructor() {
        this._entries = new LRUCache(50);
    }
    get(model) {
        const key = InlayHintsCache._key(model);
        return this._entries.get(key);
    }
    set(model, value) {
        const key = InlayHintsCache._key(model);
        this._entries.set(key, value);
    }
    static _key(model) {
        return `${model.uri.toString()}/${model.getVersionId()}`;
    }
}
const IInlayHintsCache = createDecorator('IInlayHintsCache');
registerSingleton(IInlayHintsCache, InlayHintsCache, 1 /* InstantiationType.Delayed */);
// --- rendered label
export class RenderedInlayHintLabelPart {
    constructor(item, index) {
        this.item = item;
        this.index = index;
    }
    get part() {
        const label = this.item.hint.label;
        if (typeof label === 'string') {
            return { label };
        }
        else {
            return label[this.index];
        }
    }
}
class ActiveInlayHintInfo {
    constructor(part, hasTriggerModifier) {
        this.part = part;
        this.hasTriggerModifier = hasTriggerModifier;
    }
}
var RenderMode;
(function (RenderMode) {
    RenderMode[RenderMode["Normal"] = 0] = "Normal";
    RenderMode[RenderMode["Invisible"] = 1] = "Invisible";
})(RenderMode || (RenderMode = {}));
/**
 *  Mix of CancellationTokenSource, DisposableStore and MutableDisposable
 */
class CancellationStore {
    constructor() {
        this._store = new MutableDisposable();
        this._tokenSource = new CancellationTokenSource();
    }
    dispose() {
        this._store.dispose();
        this._tokenSource.dispose(true);
    }
    reset() {
        this._tokenSource.dispose(true);
        this._tokenSource = new CancellationTokenSource();
        this._store.value = new DisposableStore();
        return {
            store: this._store.value,
            token: this._tokenSource.token
        };
    }
}
// --- controller
let InlayHintsController = class InlayHintsController {
    static { InlayHintsController_1 = this; }
    static { this.ID = 'editor.contrib.InlayHints'; }
    static { this._MAX_DECORATORS = 1500; }
    static { this._whitespaceData = {}; }
    static get(editor) {
        return editor.getContribution(InlayHintsController_1.ID) ?? undefined;
    }
    constructor(_editor, _languageFeaturesService, _featureDebounce, _inlayHintsCache, _commandService, _notificationService, _instaService) {
        this._editor = _editor;
        this._languageFeaturesService = _languageFeaturesService;
        this._inlayHintsCache = _inlayHintsCache;
        this._commandService = _commandService;
        this._notificationService = _notificationService;
        this._instaService = _instaService;
        this._disposables = new DisposableStore();
        this._sessionDisposables = new DisposableStore();
        this._decorationsMetadata = new Map();
        this._activeRenderMode = 0 /* RenderMode.Normal */;
        this._ruleFactory = this._disposables.add(new DynamicCssRules(this._editor));
        this._debounceInfo = _featureDebounce.for(_languageFeaturesService.inlayHintsProvider, 'InlayHint', { min: 25 });
        this._disposables.add(_languageFeaturesService.inlayHintsProvider.onDidChange(() => this._update()));
        this._disposables.add(_editor.onDidChangeModel(() => this._update()));
        this._disposables.add(_editor.onDidChangeModelLanguage(() => this._update()));
        this._disposables.add(_editor.onDidChangeConfiguration(e => {
            if (e.hasChanged(159 /* EditorOption.inlayHints */)) {
                this._update();
            }
        }));
        this._update();
    }
    dispose() {
        this._sessionDisposables.dispose();
        this._removeAllDecorations();
        this._disposables.dispose();
    }
    _update() {
        this._sessionDisposables.clear();
        this._removeAllDecorations();
        const options = this._editor.getOption(159 /* EditorOption.inlayHints */);
        if (options.enabled === 'off') {
            return;
        }
        const model = this._editor.getModel();
        if (!model || !this._languageFeaturesService.inlayHintsProvider.has(model)) {
            return;
        }
        if (options.enabled === 'on') {
            // different "on" modes: always
            this._activeRenderMode = 0 /* RenderMode.Normal */;
        }
        else {
            // different "on" modes: offUnlessPressed, or onUnlessPressed
            let defaultMode;
            let altMode;
            if (options.enabled === 'onUnlessPressed') {
                defaultMode = 0 /* RenderMode.Normal */;
                altMode = 1 /* RenderMode.Invisible */;
            }
            else {
                defaultMode = 1 /* RenderMode.Invisible */;
                altMode = 0 /* RenderMode.Normal */;
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
        let cts;
        const watchedProviders = new Set();
        this._sessionDisposables.add(model.onWillDispose(() => cts?.cancel()));
        const cancellationStore = this._sessionDisposables.add(new CancellationStore());
        const scheduler = new RunOnceScheduler(async () => {
            const t1 = Date.now();
            const { store, token } = cancellationStore.reset();
            try {
                const inlayHints = await InlayHintsFragments.create(this._languageFeaturesService.inlayHintsProvider, model, this._getHintsRanges(), token);
                scheduler.delay = this._debounceInfo.update(model, Date.now() - t1);
                if (token.isCancellationRequested) {
                    inlayHints.dispose();
                    return;
                }
                // listen to provider changes
                for (const provider of inlayHints.provider) {
                    if (typeof provider.onDidChangeInlayHints === 'function' && !watchedProviders.has(provider)) {
                        watchedProviders.add(provider);
                        store.add(provider.onDidChangeInlayHints(() => {
                            if (!scheduler.isScheduled()) { // ignore event when request is already scheduled
                                scheduler.schedule();
                            }
                        }));
                    }
                }
                store.add(inlayHints);
                store.add(toDisposable(() => watchedProviders.clear()));
                this._updateHintsDecorators(inlayHints.ranges, inlayHints.items);
                this._cacheHintsForFastRestore(model);
            }
            catch (err) {
                onUnexpectedError(err);
            }
        }, this._debounceInfo.get(model));
        this._sessionDisposables.add(scheduler);
        scheduler.schedule(0);
        this._sessionDisposables.add(this._editor.onDidScrollChange((e) => {
            // update when scroll position changes
            // uses scrollTopChanged has weak heuristic to differenatiate between scrolling due to
            // typing or due to "actual" scrolling
            if (e.scrollTopChanged || !scheduler.isScheduled()) {
                scheduler.schedule();
            }
        }));
        const cursor = this._sessionDisposables.add(new MutableDisposable());
        this._sessionDisposables.add(this._editor.onDidChangeModelContent((e) => {
            cts?.cancel();
            // mark current cursor position and time after which the whole can be updated/redrawn
            const delay = Math.max(scheduler.delay, 800);
            this._cursorInfo = { position: this._editor.getPosition(), notEarlierThan: Date.now() + delay };
            cursor.value = disposableTimeout(() => scheduler.schedule(0), delay);
            scheduler.schedule();
        }));
        this._sessionDisposables.add(this._editor.onDidChangeConfiguration(e => {
            if (e.hasChanged(159 /* EditorOption.inlayHints */)) {
                scheduler.schedule();
            }
        }));
        // mouse gestures
        this._sessionDisposables.add(this._installDblClickGesture(() => scheduler.schedule(0)));
        this._sessionDisposables.add(this._installLinkGesture());
        this._sessionDisposables.add(this._installContextMenu());
    }
    _installLinkGesture() {
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
        store.add(gesture.onExecute(async (e) => {
            const label = this._getInlayHintLabelPart(e);
            if (label) {
                const part = label.part;
                if (part.location) {
                    // location -> execute go to def
                    this._instaService.invokeFunction(goToDefinitionWithLocation, e, this._editor, part.location);
                }
                else if (languages.Command.is(part.command)) {
                    // command -> execute it
                    await this._invokeCommand(part.command, label.item);
                }
            }
        }));
        return store;
    }
    _getInlineHintsForRange(range) {
        const lineHints = new Set();
        for (const data of this._decorationsMetadata.values()) {
            if (range.containsRange(data.item.anchor.range)) {
                lineHints.add(data.item);
            }
        }
        return Array.from(lineHints);
    }
    _installDblClickGesture(updateInlayHints) {
        return this._editor.onMouseUp(async (e) => {
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
    _installContextMenu() {
        return this._editor.onContextMenu(async (e) => {
            if (!(isHTMLElement(e.event.target))) {
                return;
            }
            const part = this._getInlayHintLabelPart(e);
            if (part) {
                await this._instaService.invokeFunction(showGoToContextMenu, this._editor, e.event.target, part);
            }
        });
    }
    _getInlayHintLabelPart(e) {
        if (e.target.type !== 6 /* MouseTargetType.CONTENT_TEXT */) {
            return undefined;
        }
        const options = e.target.detail.injectedText?.options;
        if (options instanceof ModelDecorationInjectedTextOptions && options?.attachedData instanceof RenderedInlayHintLabelPart) {
            return options.attachedData;
        }
        return undefined;
    }
    async _invokeCommand(command, item) {
        try {
            await this._commandService.executeCommand(command.id, ...(command.arguments ?? []));
        }
        catch (err) {
            this._notificationService.notify({
                severity: Severity.Error,
                source: item.provider.displayName,
                message: err
            });
        }
    }
    _cacheHintsForFastRestore(model) {
        const hints = this._copyInlayHintsWithCurrentAnchor(model);
        this._inlayHintsCache.set(model, hints);
    }
    // return inlay hints but with an anchor that reflects "updates"
    // that happened after receiving them, e.g adding new lines before a hint
    _copyInlayHintsWithCurrentAnchor(model) {
        const items = new Map();
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
    _getHintsRanges() {
        const extra = 30;
        const model = this._editor.getModel();
        const visibleRanges = this._editor.getVisibleRangesPlusViewportAboveBelow();
        const result = [];
        for (const range of visibleRanges.sort(Range.compareRangesUsingStarts)) {
            const extendedRange = model.validateRange(new Range(range.startLineNumber - extra, range.startColumn, range.endLineNumber + extra, range.endColumn));
            if (result.length === 0 || !Range.areIntersectingOrTouching(result[result.length - 1], extendedRange)) {
                result.push(extendedRange);
            }
            else {
                result[result.length - 1] = Range.plusRange(result[result.length - 1], extendedRange);
            }
        }
        return result;
    }
    _updateHintsDecorators(ranges, items) {
        const itemFixedLengths = new Map();
        if (this._cursorInfo
            && this._cursorInfo.notEarlierThan > Date.now()
            && ranges.some(range => range.containsPosition(this._cursorInfo.position))) {
            // collect inlay hints that are on the same line and before the cursor. Those "old" hints
            // define fixed lengths so that the cursor does not jump back and worth while typing.
            const { position } = this._cursorInfo;
            this._cursorInfo = undefined;
            const lengths = new Map();
            for (const deco of this._editor.getLineDecorations(position.lineNumber) ?? []) {
                const data = this._decorationsMetadata.get(deco.id);
                if (deco.range.startColumn > position.column) {
                    continue;
                }
                const opts = data?.decoration.options[data.item.anchor.direction];
                if (opts && opts.attachedData !== InlayHintsController_1._whitespaceData) {
                    const len = lengths.get(data.item) ?? 0;
                    lengths.set(data.item, len + opts.content.length);
                }
            }
            // on the cursor line and before the cursor-column
            const newItemsWithFixedLength = items.filter(item => item.anchor.range.startLineNumber === position.lineNumber && item.anchor.range.endColumn <= position.column);
            const fixedLengths = Array.from(lengths.values());
            // match up fixed lengths with items and distribute the remaining lengths to the last item
            let lastItem;
            while (true) {
                const targetItem = newItemsWithFixedLength.shift();
                const fixedLength = fixedLengths.shift();
                if (!fixedLength && !targetItem) {
                    break; // DONE
                }
                if (targetItem) {
                    itemFixedLengths.set(targetItem, fixedLength ?? 0);
                    lastItem = targetItem;
                }
                else if (lastItem && fixedLength) {
                    // still lengths but no more item. give it all to the last
                    let len = itemFixedLengths.get(lastItem);
                    len += fixedLength;
                    len += fixedLengths.reduce((p, c) => p + c, 0);
                    fixedLengths.length = 0;
                    break; // DONE
                }
            }
        }
        // utils to collect/create injected text decorations
        const newDecorationsData = [];
        const addInjectedText = (item, ref, content, cursorStops, attachedData) => {
            const opts = {
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
                        stickiness: 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */,
                        [item.anchor.direction]: this._activeRenderMode === 0 /* RenderMode.Normal */ ? opts : undefined
                    }
                }
            });
        };
        const addInjectedWhitespace = (item, isLast) => {
            const marginRule = this._ruleFactory.createClassNameRef({
                width: `${(fontSize / 3) | 0}px`,
                display: 'inline-block'
            });
            addInjectedText(item, marginRule, '\u200a', isLast ? InjectedTextCursorStops.Right : InjectedTextCursorStops.None, InlayHintsController_1._whitespaceData);
        };
        //
        const { fontSize, fontFamily, padding, isUniform } = this._getLayoutInfo();
        const maxLength = this._editor.getOption(159 /* EditorOption.inlayHints */).maximumLength;
        const fontFamilyVar = '--code-editorInlayHintsFontFamily';
        this._editor.getContainerDomNode().style.setProperty(fontFamilyVar, fontFamily);
        let currentLineInfo = { line: 0, totalLen: 0 };
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (currentLineInfo.line !== item.anchor.range.startLineNumber) {
                currentLineInfo = { line: item.anchor.range.startLineNumber, totalLen: 0 };
            }
            if (maxLength && currentLineInfo.totalLen > maxLength) {
                continue;
            }
            // whitespace leading the actual label
            if (item.hint.paddingLeft) {
                addInjectedWhitespace(item, false);
            }
            // the label with its parts
            const parts = typeof item.hint.label === 'string'
                ? [{ label: item.hint.label }]
                : item.hint.label;
            const itemFixedLength = itemFixedLengths.get(item);
            let itemActualLength = 0;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isFirst = i === 0;
                const isLast = i === parts.length - 1;
                const cssProperties = {
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
                let textlabel = part.label;
                currentLineInfo.totalLen += textlabel.length;
                let tooLong = false;
                const over = maxLength !== 0 ? (currentLineInfo.totalLen - maxLength) : 0;
                if (over > 0) {
                    textlabel = textlabel.slice(0, -over) + '…';
                    tooLong = true;
                }
                itemActualLength += textlabel.length;
                if (itemFixedLength !== undefined) {
                    const overFixedLength = itemActualLength - itemFixedLength;
                    if (overFixedLength >= 0) {
                        // longer than fixed length, trim
                        itemActualLength -= overFixedLength;
                        textlabel = textlabel.slice(0, -(1 + overFixedLength)) + '…';
                        tooLong = true;
                    }
                }
                if (padding) {
                    if (isFirst && (isLast || tooLong)) {
                        // only element
                        cssProperties.padding = `1px ${Math.max(1, fontSize / 4) | 0}px`;
                        cssProperties.borderRadius = `${(fontSize / 4) | 0}px`;
                    }
                    else if (isFirst) {
                        // first element
                        cssProperties.padding = `1px 0 1px ${Math.max(1, fontSize / 4) | 0}px`;
                        cssProperties.borderRadius = `${(fontSize / 4) | 0}px 0 0 ${(fontSize / 4) | 0}px`;
                    }
                    else if ((isLast || tooLong)) {
                        // last element
                        cssProperties.padding = `1px ${Math.max(1, fontSize / 4) | 0}px 1px 0`;
                        cssProperties.borderRadius = `0 ${(fontSize / 4) | 0}px ${(fontSize / 4) | 0}px 0`;
                    }
                    else {
                        cssProperties.padding = `1px 0 1px 0`;
                    }
                }
                addInjectedText(item, this._ruleFactory.createClassNameRef(cssProperties), fixSpace(textlabel), isLast && !item.hint.paddingRight ? InjectedTextCursorStops.Right : InjectedTextCursorStops.None, new RenderedInlayHintLabelPart(item, i));
                if (tooLong) {
                    break;
                }
            }
            if (itemFixedLength !== undefined && itemActualLength < itemFixedLength) {
                // shorter than fixed length, pad
                const pad = (itemFixedLength - itemActualLength);
                addInjectedText(item, this._ruleFactory.createClassNameRef({}), '\u200a'.repeat(pad), InjectedTextCursorStops.None);
            }
            // whitespace trailing the actual label
            if (item.hint.paddingRight) {
                addInjectedWhitespace(item, true);
            }
            if (newDecorationsData.length > InlayHintsController_1._MAX_DECORATORS) {
                break;
            }
        }
        // collect all decoration ids that are affected by the ranges
        // and only update those decorations
        const decorationIdsToReplace = [];
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
    _fillInColors(props, hint) {
        if (hint.kind === languages.InlayHintKind.Parameter) {
            props.backgroundColor = themeColorFromId(colors.editorInlayHintParameterBackground);
            props.color = themeColorFromId(colors.editorInlayHintParameterForeground);
        }
        else if (hint.kind === languages.InlayHintKind.Type) {
            props.backgroundColor = themeColorFromId(colors.editorInlayHintTypeBackground);
            props.color = themeColorFromId(colors.editorInlayHintTypeForeground);
        }
        else {
            props.backgroundColor = themeColorFromId(colors.editorInlayHintBackground);
            props.color = themeColorFromId(colors.editorInlayHintForeground);
        }
    }
    _getLayoutInfo() {
        const options = this._editor.getOption(159 /* EditorOption.inlayHints */);
        const padding = options.padding;
        const editorFontSize = this._editor.getOption(61 /* EditorOption.fontSize */);
        const editorFontFamily = this._editor.getOption(58 /* EditorOption.fontFamily */);
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
    _removeAllDecorations() {
        this._editor.removeDecorations(Array.from(this._decorationsMetadata.keys()));
        for (const obj of this._decorationsMetadata.values()) {
            obj.classNameRef.dispose();
        }
        this._decorationsMetadata.clear();
    }
    // --- accessibility
    getInlayHintsForLine(line) {
        if (!this._editor.hasModel()) {
            return [];
        }
        const set = new Set();
        const result = [];
        for (const deco of this._editor.getLineDecorations(line)) {
            const data = this._decorationsMetadata.get(deco.id);
            if (data && !set.has(data.item.hint)) {
                set.add(data.item.hint);
                result.push(data.item);
            }
        }
        return result;
    }
};
InlayHintsController = InlayHintsController_1 = __decorate([
    __param(1, ILanguageFeaturesService),
    __param(2, ILanguageFeatureDebounceService),
    __param(3, IInlayHintsCache),
    __param(4, ICommandService),
    __param(5, INotificationService),
    __param(6, IInstantiationService)
], InlayHintsController);
export { InlayHintsController };
// Prevents the view from potentially visible whitespace
function fixSpace(str) {
    const noBreakWhitespace = '\xa0';
    return str.replace(/[ \t]/g, noBreakWhitespace);
}
CommandsRegistry.registerCommand('_executeInlayHintProvider', async (accessor, ...args) => {
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
    }
    finally {
        ref.dispose();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5sYXlIaW50c0NvbnRyb2xsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxheUhpbnRzL2Jyb3dzZXIvaW5sYXlIaW50c0NvbnRyb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxhQUFhLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNwRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDdkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLGVBQWUsRUFBZSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNySCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFMUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVyRCxPQUFPLEVBQXFDLGVBQWUsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ25HLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRWpGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFdEQs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