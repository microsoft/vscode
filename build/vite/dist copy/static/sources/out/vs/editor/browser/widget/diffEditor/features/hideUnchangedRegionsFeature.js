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
var HideUnchangedRegionsFeature_1;
import { $, addDisposableListener, getWindow, h, reset } from '../../../../../base/browser/dom.js';
import { renderIcon, renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, derivedDisposable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isDefined } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { LineRange } from '../../../../common/core/ranges/lineRange.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { SymbolKinds } from '../../../../common/languages.js';
import { observableCodeEditor } from '../../../observableCodeEditor.js';
import { PlaceholderViewZone, ViewZoneOverlayWidget, applyObservableDecorations, applyStyle } from '../utils.js';
/**
 * Make sure to add the view zones to the editor!
 */
let HideUnchangedRegionsFeature = class HideUnchangedRegionsFeature extends Disposable {
    static { HideUnchangedRegionsFeature_1 = this; }
    static { this._breadcrumbsSourceFactory = observableValue(this, () => ({
        dispose() {
        },
        getBreadcrumbItems(startRange, reader) {
            return [];
        },
        getAt: () => [],
    })); }
    static setBreadcrumbsSourceFactory(factory) {
        this._breadcrumbsSourceFactory.set(factory, undefined);
    }
    get isUpdatingHiddenAreas() { return this._isUpdatingHiddenAreas; }
    constructor(_editors, _diffModel, _options, _instantiationService) {
        super();
        this._editors = _editors;
        this._diffModel = _diffModel;
        this._options = _options;
        this._instantiationService = _instantiationService;
        this._modifiedOutlineSource = derivedDisposable(this, (reader) => {
            const m = this._editors.modifiedModel.read(reader);
            const factory = HideUnchangedRegionsFeature_1._breadcrumbsSourceFactory.read(reader);
            return (!m || !factory) ? undefined : factory(m, this._instantiationService);
        });
        this._isUpdatingHiddenAreas = false;
        this._register(this._editors.original.onDidChangeCursorPosition(e => {
            if (e.reason === 1 /* CursorChangeReason.ContentFlush */) {
                return;
            }
            const m = this._diffModel.get();
            transaction(tx => {
                for (const s of this._editors.original.getSelections() || []) {
                    m?.ensureOriginalLineIsVisible(s.getStartPosition().lineNumber, 0 /* RevealPreference.FromCloserSide */, tx);
                    m?.ensureOriginalLineIsVisible(s.getEndPosition().lineNumber, 0 /* RevealPreference.FromCloserSide */, tx);
                }
            });
        }));
        this._register(this._editors.modified.onDidChangeCursorPosition(e => {
            if (e.reason === 1 /* CursorChangeReason.ContentFlush */) {
                return;
            }
            const m = this._diffModel.get();
            transaction(tx => {
                for (const s of this._editors.modified.getSelections() || []) {
                    m?.ensureModifiedLineIsVisible(s.getStartPosition().lineNumber, 0 /* RevealPreference.FromCloserSide */, tx);
                    m?.ensureModifiedLineIsVisible(s.getEndPosition().lineNumber, 0 /* RevealPreference.FromCloserSide */, tx);
                }
            });
        }));
        const unchangedRegions = this._diffModel.map((m, reader) => {
            const regions = m?.unchangedRegions.read(reader) ?? [];
            if (regions.length === 1 && regions[0].modifiedLineNumber === 1 && regions[0].lineCount === this._editors.modifiedModel.read(reader)?.getLineCount()) {
                return [];
            }
            return regions;
        });
        this.viewZones = derived(this, (reader) => {
            /** @description view Zones */
            const modifiedOutlineSource = this._modifiedOutlineSource.read(reader);
            if (!modifiedOutlineSource) {
                return { origViewZones: [], modViewZones: [] };
            }
            const origViewZones = [];
            const modViewZones = [];
            const sideBySide = this._options.renderSideBySide.read(reader);
            const compactMode = this._options.compactMode.read(reader);
            const curUnchangedRegions = unchangedRegions.read(reader);
            for (let i = 0; i < curUnchangedRegions.length; i++) {
                const r = curUnchangedRegions[i];
                if (r.shouldHideControls(reader)) {
                    continue;
                }
                if (compactMode && (i === 0 || i === curUnchangedRegions.length - 1)) {
                    continue;
                }
                if (compactMode) {
                    {
                        const d = derived(this, reader => /** @description hiddenOriginalRangeStart */ r.getHiddenOriginalRange(reader).startLineNumber - 1);
                        const origVz = new PlaceholderViewZone(d, 12);
                        origViewZones.push(origVz);
                        reader.store.add(new CompactCollapsedCodeOverlayWidget(this._editors.original, origVz, r, !sideBySide));
                    }
                    {
                        const d = derived(this, reader => /** @description hiddenModifiedRangeStart */ r.getHiddenModifiedRange(reader).startLineNumber - 1);
                        const modViewZone = new PlaceholderViewZone(d, 12);
                        modViewZones.push(modViewZone);
                        reader.store.add(new CompactCollapsedCodeOverlayWidget(this._editors.modified, modViewZone, r));
                    }
                }
                else {
                    {
                        const d = derived(this, reader => /** @description hiddenOriginalRangeStart */ r.getHiddenOriginalRange(reader).startLineNumber - 1);
                        const origVz = new PlaceholderViewZone(d, 24);
                        origViewZones.push(origVz);
                        reader.store.add(new CollapsedCodeOverlayWidget(this._editors.original, origVz, r, r.originalUnchangedRange, !sideBySide, modifiedOutlineSource, l => this._diffModel.get().ensureModifiedLineIsVisible(l, 2 /* RevealPreference.FromBottom */, undefined), this._options));
                    }
                    {
                        const d = derived(this, reader => /** @description hiddenModifiedRangeStart */ r.getHiddenModifiedRange(reader).startLineNumber - 1);
                        const modViewZone = new PlaceholderViewZone(d, 24);
                        modViewZones.push(modViewZone);
                        reader.store.add(new CollapsedCodeOverlayWidget(this._editors.modified, modViewZone, r, r.modifiedUnchangedRange, false, modifiedOutlineSource, l => this._diffModel.get().ensureModifiedLineIsVisible(l, 2 /* RevealPreference.FromBottom */, undefined), this._options));
                    }
                }
            }
            return { origViewZones, modViewZones, };
        });
        const unchangedLinesDecoration = {
            description: 'unchanged lines',
            className: 'diff-unchanged-lines',
            isWholeLine: true,
        };
        const unchangedLinesDecorationShow = {
            description: 'Fold Unchanged',
            glyphMarginHoverMessage: new MarkdownString(undefined, { isTrusted: true, supportThemeIcons: true })
                .appendMarkdown(localize('foldUnchanged', 'Fold Unchanged Region')),
            glyphMarginClassName: 'fold-unchanged ' + ThemeIcon.asClassName(Codicon.fold),
            zIndex: 10001,
        };
        this._register(applyObservableDecorations(this._editors.original, derived(this, reader => {
            /** @description decorations */
            const curUnchangedRegions = unchangedRegions.read(reader);
            const result = curUnchangedRegions.map(r => ({
                range: r.originalUnchangedRange.toInclusiveRange(),
                options: unchangedLinesDecoration,
            }));
            for (const r of curUnchangedRegions) {
                if (r.shouldHideControls(reader)) {
                    result.push({
                        range: Range.fromPositions(new Position(r.originalLineNumber, 1)),
                        options: unchangedLinesDecorationShow,
                    });
                }
            }
            return result;
        })));
        this._register(applyObservableDecorations(this._editors.modified, derived(this, reader => {
            /** @description decorations */
            const curUnchangedRegions = unchangedRegions.read(reader);
            const result = curUnchangedRegions.map(r => ({
                range: r.modifiedUnchangedRange.toInclusiveRange(),
                options: unchangedLinesDecoration,
            }));
            for (const r of curUnchangedRegions) {
                if (r.shouldHideControls(reader)) {
                    result.push({
                        range: LineRange.ofLength(r.modifiedLineNumber, 1).toInclusiveRange(),
                        options: unchangedLinesDecorationShow,
                    });
                }
            }
            return result;
        })));
        this._register(autorun((reader) => {
            /** @description update folded unchanged regions */
            const curUnchangedRegions = unchangedRegions.read(reader);
            this._isUpdatingHiddenAreas = true;
            try {
                this._editors.original.setHiddenAreas(curUnchangedRegions.map(r => r.getHiddenOriginalRange(reader).toInclusiveRange()).filter(isDefined));
                this._editors.modified.setHiddenAreas(curUnchangedRegions.map(r => r.getHiddenModifiedRange(reader).toInclusiveRange()).filter(isDefined));
            }
            finally {
                this._isUpdatingHiddenAreas = false;
            }
        }));
        this._register(this._editors.modified.onMouseUp(event => {
            if (!event.event.rightButton && event.target.position && event.target.element?.className.includes('fold-unchanged')) {
                const lineNumber = event.target.position.lineNumber;
                const model = this._diffModel.get();
                if (!model) {
                    return;
                }
                const region = model.unchangedRegions.get().find(r => r.modifiedUnchangedRange.contains(lineNumber));
                if (!region) {
                    return;
                }
                region.collapseAll(undefined);
                event.event.stopPropagation();
                event.event.preventDefault();
            }
        }));
        this._register(this._editors.original.onMouseUp(event => {
            if (!event.event.rightButton && event.target.position && event.target.element?.className.includes('fold-unchanged')) {
                const lineNumber = event.target.position.lineNumber;
                const model = this._diffModel.get();
                if (!model) {
                    return;
                }
                const region = model.unchangedRegions.get().find(r => r.originalUnchangedRange.contains(lineNumber));
                if (!region) {
                    return;
                }
                region.collapseAll(undefined);
                event.event.stopPropagation();
                event.event.preventDefault();
            }
        }));
    }
};
HideUnchangedRegionsFeature = HideUnchangedRegionsFeature_1 = __decorate([
    __param(3, IInstantiationService)
], HideUnchangedRegionsFeature);
export { HideUnchangedRegionsFeature };
class CompactCollapsedCodeOverlayWidget extends ViewZoneOverlayWidget {
    constructor(editor, _viewZone, _unchangedRegion, _hide = false) {
        const root = h('div.diff-hidden-lines-widget');
        super(editor, _viewZone, root.root);
        this._unchangedRegion = _unchangedRegion;
        this._hide = _hide;
        this._nodes = h('div.diff-hidden-lines-compact', [
            h('div.line-left', []),
            h('div.text@text', []),
            h('div.line-right', [])
        ]);
        root.root.appendChild(this._nodes.root);
        if (this._hide) {
            this._nodes.root.replaceChildren();
        }
        this._register(autorun(reader => {
            /** @description update labels */
            if (!this._hide) {
                const lineCount = this._unchangedRegion.getHiddenModifiedRange(reader).length;
                const linesHiddenText = localize('hiddenLines', '{0} hidden lines', lineCount);
                this._nodes.text.innerText = linesHiddenText;
            }
        }));
    }
}
class CollapsedCodeOverlayWidget extends ViewZoneOverlayWidget {
    constructor(_editor, _viewZone, _unchangedRegion, _unchangedRegionRange, _hide, _modifiedOutlineSource, _revealModifiedHiddenLine, _options) {
        const root = h('div.diff-hidden-lines-widget');
        super(_editor, _viewZone, root.root);
        this._editor = _editor;
        this._unchangedRegion = _unchangedRegion;
        this._unchangedRegionRange = _unchangedRegionRange;
        this._hide = _hide;
        this._modifiedOutlineSource = _modifiedOutlineSource;
        this._revealModifiedHiddenLine = _revealModifiedHiddenLine;
        this._options = _options;
        this._nodes = h('div.diff-hidden-lines', [
            h('div.top@top', { title: localize('diff.hiddenLines.top', 'Click or drag to show more above') }),
            h('div.center@content', { style: { display: 'flex' } }, [
                h('div@first', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: '0' } }, [$('a', { title: localize('showUnchangedRegion', 'Show Unchanged Region'), role: 'button', onclick: () => { this._unchangedRegion.showAll(undefined); } }, ...renderLabelWithIcons('$(unfold)'))]),
                h('div@others', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center' } }),
            ]),
            h('div.bottom@bottom', { title: localize('diff.bottom', 'Click or drag to show more below'), role: 'button' }),
        ]);
        root.root.appendChild(this._nodes.root);
        if (!this._hide) {
            this._register(applyStyle(this._nodes.first, { width: observableCodeEditor(this._editor).layoutInfoContentLeft }));
        }
        else {
            reset(this._nodes.first);
        }
        this._register(autorun(reader => {
            /** @description Update CollapsedCodeOverlayWidget canMove* css classes */
            const isFullyRevealed = this._unchangedRegion.visibleLineCountTop.read(reader) + this._unchangedRegion.visibleLineCountBottom.read(reader) === this._unchangedRegion.lineCount;
            this._nodes.bottom.classList.toggle('canMoveTop', !isFullyRevealed);
            this._nodes.bottom.classList.toggle('canMoveBottom', this._unchangedRegion.visibleLineCountBottom.read(reader) > 0);
            this._nodes.top.classList.toggle('canMoveTop', this._unchangedRegion.visibleLineCountTop.read(reader) > 0);
            this._nodes.top.classList.toggle('canMoveBottom', !isFullyRevealed);
            const isDragged = this._unchangedRegion.isDragged.read(reader);
            const domNode = this._editor.getDomNode();
            if (domNode) {
                domNode.classList.toggle('draggingUnchangedRegion', !!isDragged);
                if (isDragged === 'top') {
                    domNode.classList.toggle('canMoveTop', this._unchangedRegion.visibleLineCountTop.read(reader) > 0);
                    domNode.classList.toggle('canMoveBottom', !isFullyRevealed);
                }
                else if (isDragged === 'bottom') {
                    domNode.classList.toggle('canMoveTop', !isFullyRevealed);
                    domNode.classList.toggle('canMoveBottom', this._unchangedRegion.visibleLineCountBottom.read(reader) > 0);
                }
                else {
                    domNode.classList.toggle('canMoveTop', false);
                    domNode.classList.toggle('canMoveBottom', false);
                }
            }
        }));
        const editor = this._editor;
        this._register(addDisposableListener(this._nodes.top, 'mousedown', e => {
            if (e.button !== 0) {
                return;
            }
            this._nodes.top.classList.toggle('dragging', true);
            this._nodes.root.classList.toggle('dragging', true);
            e.preventDefault();
            const startTop = e.clientY;
            let didMove = false;
            const cur = this._unchangedRegion.visibleLineCountTop.get();
            this._unchangedRegion.isDragged.set('top', undefined);
            const window = getWindow(this._nodes.top);
            const mouseMoveListener = addDisposableListener(window, 'mousemove', e => {
                const currentTop = e.clientY;
                const delta = currentTop - startTop;
                didMove = didMove || Math.abs(delta) > 2;
                const lineDelta = Math.round(delta / editor.getOption(75 /* EditorOption.lineHeight */));
                const newVal = Math.max(0, Math.min(cur + lineDelta, this._unchangedRegion.getMaxVisibleLineCountTop()));
                this._unchangedRegion.visibleLineCountTop.set(newVal, undefined);
            });
            const mouseUpListener = addDisposableListener(window, 'mouseup', e => {
                if (!didMove) {
                    this._unchangedRegion.showMoreAbove(this._options.hideUnchangedRegionsRevealLineCount.get(), undefined);
                }
                this._nodes.top.classList.toggle('dragging', false);
                this._nodes.root.classList.toggle('dragging', false);
                this._unchangedRegion.isDragged.set(undefined, undefined);
                mouseMoveListener.dispose();
                mouseUpListener.dispose();
            });
        }));
        this._register(addDisposableListener(this._nodes.bottom, 'mousedown', e => {
            if (e.button !== 0) {
                return;
            }
            this._nodes.bottom.classList.toggle('dragging', true);
            this._nodes.root.classList.toggle('dragging', true);
            e.preventDefault();
            const startTop = e.clientY;
            let didMove = false;
            const cur = this._unchangedRegion.visibleLineCountBottom.get();
            this._unchangedRegion.isDragged.set('bottom', undefined);
            const window = getWindow(this._nodes.bottom);
            const mouseMoveListener = addDisposableListener(window, 'mousemove', e => {
                const currentTop = e.clientY;
                const delta = currentTop - startTop;
                didMove = didMove || Math.abs(delta) > 2;
                const lineDelta = Math.round(delta / editor.getOption(75 /* EditorOption.lineHeight */));
                const newVal = Math.max(0, Math.min(cur - lineDelta, this._unchangedRegion.getMaxVisibleLineCountBottom()));
                const top = this._unchangedRegionRange.endLineNumberExclusive > editor.getModel().getLineCount()
                    ? editor.getContentHeight()
                    : editor.getTopForLineNumber(this._unchangedRegionRange.endLineNumberExclusive);
                this._unchangedRegion.visibleLineCountBottom.set(newVal, undefined);
                const top2 = this._unchangedRegionRange.endLineNumberExclusive > editor.getModel().getLineCount()
                    ? editor.getContentHeight()
                    : editor.getTopForLineNumber(this._unchangedRegionRange.endLineNumberExclusive);
                editor.setScrollTop(editor.getScrollTop() + (top2 - top));
            });
            const mouseUpListener = addDisposableListener(window, 'mouseup', e => {
                this._unchangedRegion.isDragged.set(undefined, undefined);
                if (!didMove) {
                    const top = editor.getTopForLineNumber(this._unchangedRegionRange.endLineNumberExclusive);
                    this._unchangedRegion.showMoreBelow(this._options.hideUnchangedRegionsRevealLineCount.get(), undefined);
                    const top2 = editor.getTopForLineNumber(this._unchangedRegionRange.endLineNumberExclusive);
                    editor.setScrollTop(editor.getScrollTop() + (top2 - top));
                }
                this._nodes.bottom.classList.toggle('dragging', false);
                this._nodes.root.classList.toggle('dragging', false);
                mouseMoveListener.dispose();
                mouseUpListener.dispose();
            });
        }));
        this._register(autorun(reader => {
            /** @description update labels */
            const children = [];
            if (!this._hide) {
                const lineCount = _unchangedRegion.getHiddenModifiedRange(reader).length;
                const linesHiddenText = localize('hiddenLines', '{0} hidden lines', lineCount);
                const span = $('span', { title: localize('diff.hiddenLines.expandAll', 'Double click to unfold') }, linesHiddenText);
                span.addEventListener('dblclick', e => {
                    if (e.button !== 0) {
                        return;
                    }
                    e.preventDefault();
                    this._unchangedRegion.showAll(undefined);
                });
                children.push(span);
                const range = this._unchangedRegion.getHiddenModifiedRange(reader);
                const items = this._modifiedOutlineSource.getBreadcrumbItems(range, reader);
                if (items.length > 0) {
                    children.push($('span', undefined, '\u00a0\u00a0|\u00a0\u00a0'));
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        const icon = SymbolKinds.toIcon(item.kind);
                        const divItem = h('div.breadcrumb-item', {
                            style: { display: 'flex', alignItems: 'center' },
                        }, [
                            renderIcon(icon),
                            '\u00a0',
                            item.name,
                            ...(i === items.length - 1
                                ? []
                                : [renderIcon(Codicon.chevronRight)])
                        ]).root;
                        children.push(divItem);
                        divItem.onclick = () => {
                            this._revealModifiedHiddenLine(item.startLineNumber);
                        };
                    }
                }
            }
            reset(this._nodes.others, ...children);
        }));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGlkZVVuY2hhbmdlZFJlZ2lvbnNGZWF0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvZmVhdHVyZXMvaGlkZVVuY2hhbmdlZFJlZ2lvbnNGZWF0dXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbkcsT0FBTyxFQUFFLFVBQVUsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xGLE9BQU8sRUFBd0IsT0FBTyxFQUFFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkosT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFdEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENB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