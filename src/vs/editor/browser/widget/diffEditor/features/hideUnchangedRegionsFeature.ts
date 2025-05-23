/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, getWindow, h, reset } from '../../../../../base/browser/dom.js';
import { renderIcon, renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, IReader, autorun, derived, derivedDisposable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isDefined } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../common/core/ranges/lineRange.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { CursorChangeReason } from '../../../../common/cursorEvents.js';
import { SymbolKind, SymbolKinds } from '../../../../common/languages.js';
import { IModelDecorationOptions, IModelDeltaDecoration, ITextModel } from '../../../../common/model.js';
import { ICodeEditor } from '../../../editorBrowser.js';
import { observableCodeEditor } from '../../../observableCodeEditor.js';
import { DiffEditorEditors } from '../components/diffEditorEditors.js';
import { DiffEditorOptions } from '../diffEditorOptions.js';
import { DiffEditorViewModel, RevealPreference, UnchangedRegion } from '../diffEditorViewModel.js';
import { IObservableViewZone, PlaceholderViewZone, ViewZoneOverlayWidget, applyObservableDecorations, applyStyle } from '../utils.js';

/**
 * Make sure to add the view zones to the editor!
 */
export class HideUnchangedRegionsFeature extends Disposable {
	private static readonly _breadcrumbsSourceFactory = observableValue<((textModel: ITextModel, instantiationService: IInstantiationService) => IDiffEditorBreadcrumbsSource)>(
		this, () => ({
			dispose() {
			},
			getBreadcrumbItems(startRange, reader) {
				return [];
			},
		}));
	public static setBreadcrumbsSourceFactory(factory: (textModel: ITextModel, instantiationService: IInstantiationService) => IDiffEditorBreadcrumbsSource) {
		this._breadcrumbsSourceFactory.set(factory, undefined);
	}

	private readonly _modifiedOutlineSource = derivedDisposable(this, (reader) => {
		const m = this._editors.modifiedModel.read(reader);
		const factory = HideUnchangedRegionsFeature._breadcrumbsSourceFactory.read(reader);
		return (!m || !factory) ? undefined : factory(m, this._instantiationService);
	});

	public readonly viewZones: IObservable<{
		origViewZones: IObservableViewZone[];
		modViewZones: IObservableViewZone[];
	}>;

	private _isUpdatingHiddenAreas = false;
	public get isUpdatingHiddenAreas() { return this._isUpdatingHiddenAreas; }

	constructor(
		private readonly _editors: DiffEditorEditors,
		private readonly _diffModel: IObservable<DiffEditorViewModel | undefined>,
		private readonly _options: DiffEditorOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(this._editors.original.onDidChangeCursorPosition(e => {
			if (e.reason === CursorChangeReason.ContentFlush) { return; }
			const m = this._diffModel.get();
			transaction(tx => {
				for (const s of this._editors.original.getSelections() || []) {
					m?.ensureOriginalLineIsVisible(s.getStartPosition().lineNumber, RevealPreference.FromCloserSide, tx);
					m?.ensureOriginalLineIsVisible(s.getEndPosition().lineNumber, RevealPreference.FromCloserSide, tx);
				}
			});
		}));

		this._register(this._editors.modified.onDidChangeCursorPosition(e => {
			if (e.reason === CursorChangeReason.ContentFlush) { return; }
			const m = this._diffModel.get();
			transaction(tx => {
				for (const s of this._editors.modified.getSelections() || []) {
					m?.ensureModifiedLineIsVisible(s.getStartPosition().lineNumber, RevealPreference.FromCloserSide, tx);
					m?.ensureModifiedLineIsVisible(s.getEndPosition().lineNumber, RevealPreference.FromCloserSide, tx);
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
			if (!modifiedOutlineSource) { return { origViewZones: [], modViewZones: [] }; }

			const origViewZones: IObservableViewZone[] = [];
			const modViewZones: IObservableViewZone[] = [];
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
						reader.store.add(new CompactCollapsedCodeOverlayWidget(
							this._editors.original,
							origVz,
							r,
							!sideBySide,
						));
					}
					{
						const d = derived(this, reader => /** @description hiddenModifiedRangeStart */ r.getHiddenModifiedRange(reader).startLineNumber - 1);
						const modViewZone = new PlaceholderViewZone(d, 12);
						modViewZones.push(modViewZone);
						reader.store.add(new CompactCollapsedCodeOverlayWidget(
							this._editors.modified,
							modViewZone,
							r,
						));
					}
				} else {
					{
						const d = derived(this, reader => /** @description hiddenOriginalRangeStart */ r.getHiddenOriginalRange(reader).startLineNumber - 1);
						const origVz = new PlaceholderViewZone(d, 24);
						origViewZones.push(origVz);
						reader.store.add(new CollapsedCodeOverlayWidget(
							this._editors.original,
							origVz,
							r,
							r.originalUnchangedRange,
							!sideBySide,
							modifiedOutlineSource,
							l => this._diffModel.get()!.ensureModifiedLineIsVisible(l, RevealPreference.FromBottom, undefined),
							this._options,
						));
					}
					{
						const d = derived(this, reader => /** @description hiddenModifiedRangeStart */ r.getHiddenModifiedRange(reader).startLineNumber - 1);
						const modViewZone = new PlaceholderViewZone(d, 24);
						modViewZones.push(modViewZone);
						reader.store.add(new CollapsedCodeOverlayWidget(
							this._editors.modified,
							modViewZone,
							r,
							r.modifiedUnchangedRange,
							false,
							modifiedOutlineSource,
							l => this._diffModel.get()!.ensureModifiedLineIsVisible(l, RevealPreference.FromBottom, undefined),
							this._options,
						));
					}
				}
			}

			return { origViewZones, modViewZones, };
		});


		const unchangedLinesDecoration: IModelDecorationOptions = {
			description: 'unchanged lines',
			className: 'diff-unchanged-lines',
			isWholeLine: true,
		};
		const unchangedLinesDecorationShow: IModelDecorationOptions = {
			description: 'Fold Unchanged',
			glyphMarginHoverMessage: new MarkdownString(undefined, { isTrusted: true, supportThemeIcons: true })
				.appendMarkdown(localize('foldUnchanged', 'Fold Unchanged Region')),
			glyphMarginClassName: 'fold-unchanged ' + ThemeIcon.asClassName(Codicon.fold),
			zIndex: 10001,
		};

		this._register(applyObservableDecorations(this._editors.original, derived(this, reader => {
			/** @description decorations */
			const curUnchangedRegions = unchangedRegions.read(reader);
			const result = curUnchangedRegions.map<IModelDeltaDecoration>(r => ({
				range: r.originalUnchangedRange.toInclusiveRange()!,
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
			const result = curUnchangedRegions.map<IModelDeltaDecoration>(r => ({
				range: r.modifiedUnchangedRange.toInclusiveRange()!,
				options: unchangedLinesDecoration,
			}));
			for (const r of curUnchangedRegions) {
				if (r.shouldHideControls(reader)) {
					result.push({
						range: LineRange.ofLength(r.modifiedLineNumber, 1).toInclusiveRange()!,
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
			} finally {
				this._isUpdatingHiddenAreas = false;
			}
		}));

		this._register(this._editors.modified.onMouseUp(event => {
			if (!event.event.rightButton && event.target.position && event.target.element?.className.includes('fold-unchanged')) {
				const lineNumber = event.target.position.lineNumber;
				const model = this._diffModel.get();
				if (!model) { return; }
				const region = model.unchangedRegions.get().find(r => r.modifiedUnchangedRange.contains(lineNumber));
				if (!region) { return; }
				region.collapseAll(undefined);
				event.event.stopPropagation();
				event.event.preventDefault();
			}
		}));

		this._register(this._editors.original.onMouseUp(event => {
			if (!event.event.rightButton && event.target.position && event.target.element?.className.includes('fold-unchanged')) {
				const lineNumber = event.target.position.lineNumber;
				const model = this._diffModel.get();
				if (!model) { return; }
				const region = model.unchangedRegions.get().find(r => r.originalUnchangedRange.contains(lineNumber));
				if (!region) { return; }
				region.collapseAll(undefined);
				event.event.stopPropagation();
				event.event.preventDefault();
			}
		}));
	}
}

class CompactCollapsedCodeOverlayWidget extends ViewZoneOverlayWidget {
	private readonly _nodes = h('div.diff-hidden-lines-compact', [
		h('div.line-left', []),
		h('div.text@text', []),
		h('div.line-right', [])
	]);

	constructor(
		editor: ICodeEditor,
		_viewZone: PlaceholderViewZone,
		private readonly _unchangedRegion: UnchangedRegion,
		private readonly _hide: boolean = false,
	) {
		const root = h('div.diff-hidden-lines-widget');
		super(editor, _viewZone, root.root);
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
	private readonly _nodes = h('div.diff-hidden-lines', [
		h('div.top@top', { title: localize('diff.hiddenLines.top', 'Click or drag to show more above') }),
		h('div.center@content', { style: { display: 'flex' } }, [
			h('div@first', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: '0' } },
				[$('a', { title: localize('showUnchangedRegion', 'Show Unchanged Region'), role: 'button', onclick: () => { this._unchangedRegion.showAll(undefined); } },
					...renderLabelWithIcons('$(unfold)'))]
			),
			h('div@others', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center' } }),
		]),
		h('div.bottom@bottom', { title: localize('diff.bottom', 'Click or drag to show more below'), role: 'button' }),
	]);

	constructor(
		private readonly _editor: ICodeEditor,
		_viewZone: PlaceholderViewZone,
		private readonly _unchangedRegion: UnchangedRegion,
		private readonly _unchangedRegionRange: LineRange,
		private readonly _hide: boolean,
		private readonly _modifiedOutlineSource: IDiffEditorBreadcrumbsSource,
		private readonly _revealModifiedHiddenLine: (lineNumber: number) => void,
		private readonly _options: DiffEditorOptions,
	) {
		const root = h('div.diff-hidden-lines-widget');
		super(_editor, _viewZone, root.root);
		root.root.appendChild(this._nodes.root);

		if (!this._hide) {
			this._register(applyStyle(this._nodes.first, { width: observableCodeEditor(this._editor).layoutInfoContentLeft }));
		} else {
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
				} else if (isDragged === 'bottom') {
					domNode.classList.toggle('canMoveTop', !isFullyRevealed);
					domNode.classList.toggle('canMoveBottom', this._unchangedRegion.visibleLineCountBottom.read(reader) > 0);
				} else {
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
				const lineDelta = Math.round(delta / editor.getOption(EditorOption.lineHeight));
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
				const lineDelta = Math.round(delta / editor.getOption(EditorOption.lineHeight));
				const newVal = Math.max(0, Math.min(cur - lineDelta, this._unchangedRegion.getMaxVisibleLineCountBottom()));
				const top = this._unchangedRegionRange.endLineNumberExclusive > editor.getModel()!.getLineCount()
					? editor.getContentHeight()
					: editor.getTopForLineNumber(this._unchangedRegionRange.endLineNumberExclusive);
				this._unchangedRegion.visibleLineCountBottom.set(newVal, undefined);
				const top2 = this._unchangedRegionRange.endLineNumberExclusive > editor.getModel()!.getLineCount()
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

			const children: HTMLElement[] = [];
			if (!this._hide) {
				const lineCount = _unchangedRegion.getHiddenModifiedRange(reader).length;
				const linesHiddenText = localize('hiddenLines', '{0} hidden lines', lineCount);
				const span = $('span', { title: localize('diff.hiddenLines.expandAll', 'Double click to unfold') }, linesHiddenText);
				span.addEventListener('dblclick', e => {
					if (e.button !== 0) { return; }
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
								: [renderIcon(Codicon.chevronRight)]
							)
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

export interface IDiffEditorBreadcrumbsSource extends IDisposable {
	getBreadcrumbItems(startRange: LineRange, reader: IReader): { name: string; kind: SymbolKind; startLineNumber: number }[];
}
