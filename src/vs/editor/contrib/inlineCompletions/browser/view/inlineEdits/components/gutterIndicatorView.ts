/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { n, trackFocus } from '../../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, autorun, constObservable, derived, observableFromEvent, observableValue } from '../../../../../../../base/common/observable.js';
import { localize } from '../../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { ObservableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Rect } from '../../../../../../browser/rect.js';
import { HoverService } from '../../../../../../browser/services/hoverService/hoverService.js';
import { HoverWidget } from '../../../../../../browser/services/hoverService/hoverWidget.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../../common/core/lineRange.js';
import { OffsetRange } from '../../../../../../common/core/offsetRange.js';
import { StickyScrollController } from '../../../../../stickyScroll/browser/stickyScrollController.js';
import { InlineCompletionsModel } from '../../../model/inlineCompletionsModel.js';
import { inlineEditIndicatorBackground, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorPrimaryForeground, inlineEditIndicatorSecondaryBackground, inlineEditIndicatorSecondaryForeground, inlineEditIndicatorsuccessfulBackground, inlineEditIndicatorsuccessfulForeground } from '../theme.js';
import { InlineEditTabAction, mapOutFalsy, rectToProps } from '../utils/utils.js';
import { GutterIndicatorMenuContent } from './gutterIndicatorMenu.js';

export class InlineEditsGutterIndicator extends Disposable {
	constructor(
		private readonly _editorObs: ObservableCodeEditor,
		private readonly _originalRange: IObservable<LineRange | undefined>,
		private readonly _verticalOffset: IObservable<number>,
		private readonly _model: IObservable<InlineCompletionsModel | undefined>,
		private readonly _tabAction: IObservable<InlineEditTabAction>,
		private readonly _isHoveringOverInlineEdit: IObservable<boolean>,
		private readonly _focusIsInMenu: ISettableObservable<boolean>,
		@IHoverService private readonly _hoverService: HoverService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super();

		this._register(this._editorObs.createOverlayWidget({
			domNode: this._indicator.element,
			position: constObservable(null),
			allowEditorOverflow: false,
			minContentWidthInPx: constObservable(0),
		}));

		this._register(autorun(reader => {
			if (!accessibilityService.isMotionReduced()) {
				this._indicator.element.classList.toggle('wiggle', this._isHoveringOverInlineEdit.read(reader));
			}
		}));
	}

	private readonly _originalRangeObs = mapOutFalsy(this._originalRange);

	private readonly _state = derived(reader => {
		const range = this._originalRangeObs.read(reader);
		if (!range) { return undefined; }
		return {
			range,
			lineOffsetRange: this._editorObs.observeLineOffsetRange(range, this._store),
		};
	});

	private readonly _stickyScrollController = StickyScrollController.get(this._editorObs.editor);
	private readonly _stickyScrollHeight = this._stickyScrollController
		? observableFromEvent(this._stickyScrollController.onDidChangeStickyScrollHeight, () => this._stickyScrollController!.stickyScrollWidgetHeight)
		: constObservable(0);

	private readonly _layout = derived(this, reader => {
		const s = this._state.read(reader);
		if (!s) { return undefined; }

		const layout = this._editorObs.layoutInfo.read(reader);

		const bottomPadding = 1;
		const fullViewPort = Rect.fromLeftTopRightBottom(0, 0, layout.width, layout.height - bottomPadding);
		const viewPortWithStickyScroll = fullViewPort.withTop(this._stickyScrollHeight.read(reader));

		const targetVertRange = s.lineOffsetRange.read(reader);

		const space = 1;

		const targetRect = Rect.fromRanges(OffsetRange.fromTo(space + layout.glyphMarginLeft, layout.lineNumbersLeft + layout.lineNumbersWidth + 4), targetVertRange);


		const lineHeight = this._editorObs.getOption(EditorOption.lineHeight).read(reader);
		const pillOffset = this._verticalOffset.read(reader);
		const pillRect = targetRect.withHeight(lineHeight).withWidth(22).moveDown(pillOffset);
		const pillRectMoved = pillRect.moveToBeContainedIn(viewPortWithStickyScroll);

		const rect = targetRect;

		const iconRect = (targetRect.containsRect(pillRectMoved))
			? pillRectMoved
			: pillRectMoved.moveToBeContainedIn(fullViewPort.intersect(targetRect.union(fullViewPort.withHeight(lineHeight)))!); //viewPortWithStickyScroll.intersect(rect)!;

		return {
			rect,
			iconRect,
			arrowDirection: (targetRect.containsRect(iconRect) ? 'right' as const
				: iconRect.top > targetRect.top ? 'top' as const : 'bottom' as const),
			docked: rect.containsRect(iconRect) && viewPortWithStickyScroll.containsRect(iconRect),
		};
	});

	private readonly _iconRef = n.ref<HTMLDivElement>();
	private _hoverVisible: boolean = false;
	private readonly _isHoveredOverIcon = observableValue(this, false);

	private _showHover(): void {
		if (this._hoverVisible) {
			return;
		}

		const displayName = derived(this, reader => {
			const state = this._model.read(reader)?.inlineEditState;
			const item = state?.read(reader);
			const completionSource = item?.inlineCompletion?.source;
			// TODO: expose the provider (typed) and expose the provider the edit belongs totyping and get correct edit
			const displayName = (completionSource?.inlineCompletions as any).edits[0]?.provider?.displayName ?? localize('inlineEdit', "Inline Edit");
			return displayName;
		});

		const disposableStore = new DisposableStore();
		const content = disposableStore.add(this._instantiationService.createInstance(
			GutterIndicatorMenuContent,
			displayName,
			this._tabAction,
			(focusEditor) => {
				if (focusEditor) {
					this._editorObs.editor.focus();
				}
				h?.dispose();
			},
			this._model.map((m, r) => m?.state.read(r)?.inlineCompletion?.source.inlineCompletions.commands),
		).toDisposableLiveElement());

		const focusTracker = disposableStore.add(trackFocus(content.element));
		disposableStore.add(focusTracker.onDidBlur(() => this._focusIsInMenu.set(false, undefined)));
		disposableStore.add(focusTracker.onDidFocus(() => this._focusIsInMenu.set(true, undefined)));
		disposableStore.add(toDisposable(() => this._focusIsInMenu.set(false, undefined)));

		const h = this._hoverService.showHover({
			target: this._iconRef.element,
			content: content.element,
		}) as HoverWidget | undefined;
		if (h) {
			this._hoverVisible = true;
			h.onDispose(() => { // TODO:@hediet fix leak
				disposableStore.dispose();
				this._hoverVisible = false;
			});
		} else {
			disposableStore.dispose();
		}
	}

	private readonly _indicator = n.div({
		class: 'inline-edits-view-gutter-indicator',
		onclick: () => {
			const model = this._model.get();
			if (!model) { return; }
			const docked = this._layout.map(l => l && l.docked).get();
			this._editorObs.editor.focus();
			if (docked) {
				model.accept();
			} else {
				model.jump();
			}
		},
		tabIndex: 0,
		style: {
			position: 'absolute',
			overflow: 'visible',
		},
	}, mapOutFalsy(this._layout).map(layout => !layout ? [] : [
		n.div({
			style: {
				position: 'absolute',
				background: asCssVariable(inlineEditIndicatorBackground),
				borderRadius: '4px',
				...rectToProps(reader => layout.read(reader).rect),
			}
		}),
		n.div({
			class: 'icon',
			ref: this._iconRef,
			onmouseenter: () => {
				// TODO show hover when hovering ghost text etc.
				this._isHoveredOverIcon.set(true, undefined);
				this._showHover();
			},
			onmouseleave: () => { this._isHoveredOverIcon.set(false, undefined); },
			style: {
				cursor: 'pointer',
				zIndex: '1000',
				position: 'absolute',
				backgroundColor: this._tabAction.map(v => {
					switch (v) {
						case InlineEditTabAction.Inactive: return asCssVariable(inlineEditIndicatorSecondaryBackground);
						case InlineEditTabAction.Jump: return asCssVariable(inlineEditIndicatorPrimaryBackground);
						case InlineEditTabAction.Accept: return asCssVariable(inlineEditIndicatorsuccessfulBackground);
					}
				}),
				['--vscodeIconForeground' as any]: this._tabAction.map(v => {
					switch (v) {
						case InlineEditTabAction.Inactive: return asCssVariable(inlineEditIndicatorSecondaryForeground);
						case InlineEditTabAction.Jump: return asCssVariable(inlineEditIndicatorPrimaryForeground);
						case InlineEditTabAction.Accept: return asCssVariable(inlineEditIndicatorsuccessfulForeground);
					}
				}),
				borderRadius: '4px',
				display: 'flex',
				justifyContent: 'center',
				transition: 'background-color 0.2s ease-in-out',
				...rectToProps(reader => layout.read(reader).iconRect),
			}
		}, [
			n.div({
				style: {
					rotate: layout.map(l => {
						switch (l.arrowDirection) {
							case 'right': return '0deg';
							case 'bottom': return '90deg';
							case 'top': return '-90deg';
						}
					}),
					transition: 'rotate 0.2s ease-in-out',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
				}
			}, [
				this._tabAction.map(v => v === InlineEditTabAction.Accept ? renderIcon(Codicon.keyboardTab) : renderIcon(Codicon.arrowRight))
			])
		]),
	])).keepUpdated(this._store);
}
