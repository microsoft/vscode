/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType, addDisposableListener, addStandardDisposableListener, h } from 'vs/base/browser/dom';
import { createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { Color } from 'vs/base/common/color';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, autorun, derived, observableFromEvent } from 'vs/base/common/observable';
import { autorunWithStore2 } from 'vs/base/common/observableImpl/autorun';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { DiffModel } from 'vs/editor/browser/widget/diffEditorWidget2/diffModel';
import { appendRemoveOnDispose } from 'vs/editor/browser/widget/diffEditorWidget2/utils';
import { EditorLayoutInfo } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { OverviewRulerZone } from 'vs/editor/common/viewModel/overviewZoneManager';
import { defaultInsertColor, defaultRemoveColor, diffInserted, diffOverviewRulerInserted, diffOverviewRulerRemoved, diffRemoved } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class OverviewRulerPart extends Disposable {
	public static readonly ONE_OVERVIEW_WIDTH = 15;
	public static readonly ENTIRE_DIFF_OVERVIEW_WIDTH = OverviewRulerPart.ONE_OVERVIEW_WIDTH * 2;

	constructor(
		private readonly _originalEditor: CodeEditorWidget,
		private readonly _modifiedEditor: CodeEditorWidget,
		private readonly _rootElement: HTMLElement,
		private readonly _diffModel: IObservable<DiffModel | undefined>,
		private readonly _rootWidth: IObservable<number>,
		private readonly _rootHeight: IObservable<number>,
		private readonly _modifiedEditorLayoutInfo: IObservable<EditorLayoutInfo | null>,
		public readonly renderOverviewRuler: IObservable<boolean>,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();

		const currentColorTheme = observableFromEvent(this._themeService.onDidColorThemeChange, () => this._themeService.getColorTheme());

		const currentColors = derived('colors', reader => {
			const theme = currentColorTheme.read(reader);
			const insertColor = theme.getColor(diffOverviewRulerInserted) || (theme.getColor(diffInserted) || defaultInsertColor).transparent(2);
			const removeColor = theme.getColor(diffOverviewRulerRemoved) || (theme.getColor(diffRemoved) || defaultRemoveColor).transparent(2);
			return { insertColor, removeColor };
		});

		const scrollTopObservable = observableFromEvent(this._modifiedEditor.onDidScrollChange, () => this._modifiedEditor.getScrollTop());
		const scrollHeightObservable = observableFromEvent(this._modifiedEditor.onDidScrollChange, () => this._modifiedEditor.getScrollHeight());

		// overview ruler
		this._register(autorunWithStore2('create diff editor overview ruler if enabled', (reader, store) => {
			if (!this.renderOverviewRuler.read(reader)) {
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
				this._modifiedEditor.delegateVerticalScrollbarPointerDown(e);
			}));
			store.add(addDisposableListener(diffOverviewRoot, EventType.MOUSE_WHEEL, (e: IMouseWheelEvent) => {
				this._modifiedEditor.delegateScrollFromMouseWheelEvent(e);
			}, { passive: false }));
			store.add(appendRemoveOnDispose(this._rootElement, diffOverviewRoot));

			store.add(autorunWithStore2('recreate overview rules when model changes', (reader, store) => {
				const m = this._diffModel.read(reader);

				const originalOverviewRuler = this._originalEditor.createOverviewRuler('original diffOverviewRuler');
				if (originalOverviewRuler) {
					store.add(originalOverviewRuler);
					store.add(appendRemoveOnDispose(diffOverviewRoot, originalOverviewRuler.getDomNode()));
				}

				const modifiedOverviewRuler = this._modifiedEditor.createOverviewRuler('modified diffOverviewRuler');
				if (modifiedOverviewRuler) {
					store.add(modifiedOverviewRuler);
					store.add(appendRemoveOnDispose(diffOverviewRoot, modifiedOverviewRuler.getDomNode()));
				}

				if (!originalOverviewRuler || !modifiedOverviewRuler) {
					// probably no model
					return;
				}

				store.add(autorun('set overview ruler zones', (reader) => {
					const colors = currentColors.read(reader);
					const diff = m?.diff.read(reader)?.mappings;

					function createZones(ranges: LineRange[], color: Color) {
						return ranges
							.filter(d => d.length > 0)
							.map(r => new OverviewRulerZone(r.startLineNumber, r.endLineNumberExclusive, r.length, color.toString()));
					}

					originalOverviewRuler?.setZones(createZones((diff || []).map(d => d.lineRangeMapping.originalRange), colors.removeColor));
					modifiedOverviewRuler?.setZones(createZones((diff || []).map(d => d.lineRangeMapping.modifiedRange), colors.insertColor));
				}));

				store.add(autorun('layout overview ruler', (reader) => {
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

						const computedAvailableSize = Math.max(0, layoutInfo.height);
						const computedRepresentableSize = Math.max(0, computedAvailableSize - 2 * 0);
						const computedRatio = scrollHeight > 0 ? (computedRepresentableSize / scrollHeight) : 0;

						const computedSliderSize = Math.max(0, Math.floor(layoutInfo.height * computedRatio));
						const computedSliderPosition = Math.floor(scrollTop * computedRatio);

						viewportDomElement.setTop(computedSliderPosition);
						viewportDomElement.setHeight(computedSliderSize);
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
