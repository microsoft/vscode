/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType, addDisposableListener, addStandardDisposableListener, h } from 'vs/base/browser/dom';
import { createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { ScrollbarState } from 'vs/base/browser/ui/scrollbar/scrollbarState';
import { Color } from 'vs/base/common/color';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, autorun, autorunWithStore, derived, observableFromEvent, observableSignalFromEvent } from 'vs/base/common/observable';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { DiffEditorEditors } from 'vs/editor/browser/widget/diffEditor/diffEditorEditors';
import { DiffEditorViewModel } from 'vs/editor/browser/widget/diffEditor/diffEditorViewModel';
import { appendRemoveOnDispose } from 'vs/editor/browser/widget/diffEditor/utils';
import { EditorLayoutInfo, EditorOption } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Position } from 'vs/editor/common/core/position';
import { OverviewRulerZone } from 'vs/editor/common/viewModel/overviewZoneManager';
import { defaultInsertColor, defaultRemoveColor, diffInserted, diffOverviewRulerInserted, diffOverviewRulerRemoved, diffRemoved } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { DiffEditorOptions } from './diffEditorOptions';

export class OverviewRulerPart extends Disposable {
	public static readonly ONE_OVERVIEW_WIDTH = 15;
	public static readonly ENTIRE_DIFF_OVERVIEW_WIDTH = OverviewRulerPart.ONE_OVERVIEW_WIDTH * 2;

	constructor(
		private readonly _editors: DiffEditorEditors,
		private readonly _rootElement: HTMLElement,
		private readonly _diffModel: IObservable<DiffEditorViewModel | undefined>,
		private readonly _rootWidth: IObservable<number>,
		private readonly _rootHeight: IObservable<number>,
		private readonly _modifiedEditorLayoutInfo: IObservable<EditorLayoutInfo | null>,
		public readonly _options: DiffEditorOptions,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();

		const currentColorTheme = observableFromEvent(this._themeService.onDidColorThemeChange, () => this._themeService.getColorTheme());

		const currentColors = derived(reader => {
			/** @description colors */
			const theme = currentColorTheme.read(reader);
			const insertColor = theme.getColor(diffOverviewRulerInserted) || (theme.getColor(diffInserted) || defaultInsertColor).transparent(2);
			const removeColor = theme.getColor(diffOverviewRulerRemoved) || (theme.getColor(diffRemoved) || defaultRemoveColor).transparent(2);
			return { insertColor, removeColor };
		});

		const scrollTopObservable = observableFromEvent(this._editors.modified.onDidScrollChange, () => this._editors.modified.getScrollTop());
		const scrollHeightObservable = observableFromEvent(this._editors.modified.onDidScrollChange, () => this._editors.modified.getScrollHeight());

		this._register(autorunWithStore((reader, store) => {
			/** @description create diff editor overview ruler if enabled */
			if (!this._options.renderOverviewRuler.read(reader)) {
				return;
			}

			const viewportDomElement = createFastDomNode(document.createElement('div'));
			viewportDomElement.setClassName('diffViewport');
			viewportDomElement.setPosition('absolute');

			const diffOverviewRoot = h('div.diffOverview', {
				style: { position: 'absolute', top: '0px', width: OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH + 'px' }
			}).root;
			store.add(appendRemoveOnDispose(diffOverviewRoot, viewportDomElement.domNode));
			store.add(addStandardDisposableListener(diffOverviewRoot, EventType.POINTER_DOWN, (e) => {
				this._editors.modified.delegateVerticalScrollbarPointerDown(e);
			}));
			store.add(addDisposableListener(diffOverviewRoot, EventType.MOUSE_WHEEL, (e: IMouseWheelEvent) => {
				this._editors.modified.delegateScrollFromMouseWheelEvent(e);
			}, { passive: false }));
			store.add(appendRemoveOnDispose(this._rootElement, diffOverviewRoot));

			store.add(autorunWithStore((reader, store) => {
				/** @description recreate overview rules when model changes */
				const m = this._diffModel.read(reader);

				const originalOverviewRuler = this._editors.original.createOverviewRuler('original diffOverviewRuler');
				if (originalOverviewRuler) {
					store.add(originalOverviewRuler);
					store.add(appendRemoveOnDispose(diffOverviewRoot, originalOverviewRuler.getDomNode()));
				}

				const modifiedOverviewRuler = this._editors.modified.createOverviewRuler('modified diffOverviewRuler');
				if (modifiedOverviewRuler) {
					store.add(modifiedOverviewRuler);
					store.add(appendRemoveOnDispose(diffOverviewRoot, modifiedOverviewRuler.getDomNode()));
				}

				if (!originalOverviewRuler || !modifiedOverviewRuler) {
					// probably no model
					return;
				}

				const origViewZonesChanged = observableSignalFromEvent('viewZoneChanged', this._editors.original.onDidChangeViewZones);
				const modViewZonesChanged = observableSignalFromEvent('viewZoneChanged', this._editors.modified.onDidChangeViewZones);
				const origHiddenRangesChanged = observableSignalFromEvent('hiddenRangesChanged', this._editors.original.onDidChangeHiddenAreas);
				const modHiddenRangesChanged = observableSignalFromEvent('hiddenRangesChanged', this._editors.modified.onDidChangeHiddenAreas);

				store.add(autorun(reader => {
					/** @description set overview ruler zones */
					origViewZonesChanged.read(reader);
					modViewZonesChanged.read(reader);
					origHiddenRangesChanged.read(reader);
					modHiddenRangesChanged.read(reader);

					const colors = currentColors.read(reader);
					const diff = m?.diff.read(reader)?.mappings;

					function createZones(ranges: LineRange[], color: Color, editor: CodeEditorWidget) {
						const vm = editor._getViewModel();
						if (!vm) {
							return [];
						}
						return ranges
							.filter(d => d.length > 0)
							.map(r => {
								const start = vm.coordinatesConverter.convertModelPositionToViewPosition(new Position(r.startLineNumber, 1));
								const end = vm.coordinatesConverter.convertModelPositionToViewPosition(new Position(r.endLineNumberExclusive, 1));
								// By computing the lineCount, we won't ask the view model later for the bottom vertical position.
								// (The view model will take into account the alignment viewzones, which will give
								// modifications and deletetions always the same height.)
								const lineCount = end.lineNumber - start.lineNumber;
								return new OverviewRulerZone(start.lineNumber, end.lineNumber, lineCount, color.toString());
							});
					}

					const originalZones = createZones((diff || []).map(d => d.lineRangeMapping.original), colors.removeColor, this._editors.original);
					const modifiedZones = createZones((diff || []).map(d => d.lineRangeMapping.modified), colors.insertColor, this._editors.modified);
					originalOverviewRuler?.setZones(originalZones);
					modifiedOverviewRuler?.setZones(modifiedZones);
				}));

				store.add(autorun(reader => {
					/** @description layout overview ruler */
					const height = this._rootHeight.read(reader);
					const width = this._rootWidth.read(reader);
					const layoutInfo = this._modifiedEditorLayoutInfo.read(reader);
					if (layoutInfo) {
						const freeSpace = OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH - 2 * OverviewRulerPart.ONE_OVERVIEW_WIDTH;
						originalOverviewRuler.setLayout({
							top: 0,
							height: height,
							right: freeSpace + OverviewRulerPart.ONE_OVERVIEW_WIDTH,
							width: OverviewRulerPart.ONE_OVERVIEW_WIDTH,
						});
						modifiedOverviewRuler.setLayout({
							top: 0,
							height: height,
							right: 0,
							width: OverviewRulerPart.ONE_OVERVIEW_WIDTH,
						});
						const scrollTop = scrollTopObservable.read(reader);
						const scrollHeight = scrollHeightObservable.read(reader);

						const scrollBarOptions = this._editors.modified.getOption(EditorOption.scrollbar);
						const state = new ScrollbarState(
							scrollBarOptions.verticalHasArrows ? scrollBarOptions.arrowSize : 0,
							scrollBarOptions.verticalScrollbarSize,
							0,
							layoutInfo.height,
							scrollHeight,
							scrollTop
						);

						viewportDomElement.setTop(state.getSliderPosition());
						viewportDomElement.setHeight(state.getSliderSize());
					} else {
						viewportDomElement.setTop(0);
						viewportDomElement.setHeight(0);
					}

					diffOverviewRoot.style.height = height + 'px';
					diffOverviewRoot.style.left = (width - OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH) + 'px';
					viewportDomElement.setWidth(OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH);
				}));
			}));
		}));
	}
}
