/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, IReader, constObservable, derived, observableFromEvent } from '../../../../../../base/common/observable.js';
import { buttonBackground, buttonForeground, buttonSecondaryBackground, buttonSecondaryForeground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { registerColor, transparent } from '../../../../../../platform/theme/common/colorUtils.js';
import { ObservableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { Rect } from '../../../../../browser/rect.js';
import { EditorOption } from '../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../common/core/lineRange.js';
import { OffsetRange } from '../../../../../common/core/offsetRange.js';
import { StickyScrollController } from '../../../../stickyScroll/browser/stickyScrollController.js';
import { InlineCompletionsModel } from '../../model/inlineCompletionsModel.js';
import { mapOutFalsy, n } from './utils.js';

export const inlineEditIndicatorPrimaryForeground = registerColor('inlineEdit.gutterIndicator.primaryForeground', buttonForeground, 'Foreground color for the primary inline edit gutter indicator.');
export const inlineEditIndicatorPrimaryBackground = registerColor('inlineEdit.gutterIndicator.primaryBackground', buttonBackground, 'Background color for the primary inline edit gutter indicator.');

export const inlineEditIndicatorSecondaryForeground = registerColor('inlineEdit.gutterIndicator.secondaryForeground', buttonSecondaryForeground, 'Foreground color for the secondary inline edit gutter indicator.');
export const inlineEditIndicatorSecondaryBackground = registerColor('inlineEdit.gutterIndicator.secondaryBackground', buttonSecondaryBackground, 'Background color for the secondary inline edit gutter indicator.');

export const inlineEditIndicatorsuccessfulForeground = registerColor('inlineEdit.gutterIndicator.successfulForeground', buttonForeground, 'Foreground color for the successful inline edit gutter indicator.');
export const inlineEditIndicatorsuccessfulBackground = registerColor('inlineEdit.gutterIndicator.successfulBackground', { light: '#2e825c', dark: '#2e825c', hcLight: '#2e825c', hcDark: '#2e825c' }, 'Background color for the successful inline edit gutter indicator.');

export const inlineEditIndicatorBackground = registerColor(
	'inlineEdit.gutterIndicator.background',
	{
		hcDark: transparent('tab.inactiveBackground', 0.5),
		hcLight: transparent('tab.inactiveBackground', 0.5),
		dark: transparent('tab.inactiveBackground', 0.5),
		light: '#5f5f5f18',
	},
	'Background color for the inline edit gutter indicator.'
);


export class InlineEditsGutterIndicator extends Disposable {
	private readonly _state = derived(reader => {
		const range = mapOutFalsy(this._originalRange).read(reader);
		if (!range) {
			return undefined;
		}

		return {
			range,
			lineOffsetRange: this._editorObs.observeLineOffsetRange(range, this._store),
		};
	});

	private _stickyScrollController = StickyScrollController.get(this._editorObs.editor);
	private readonly _stickyScrollHeight = this._stickyScrollController ? observableFromEvent(this._stickyScrollController.onDidChangeStickyScrollHeight, () => this._stickyScrollController!.stickyScrollWidgetHeight) : constObservable(0);


	private readonly _layout = derived(reader => {
		const s = this._state.read(reader);
		if (!s) { return undefined; }

		const layout = this._editorObs.layoutInfo.read(reader);

		const fullViewPort = Rect.fromLeftTopRightBottom(0, 0, layout.width, layout.height);
		const viewPortWithStickyScroll = fullViewPort.withTop(this._stickyScrollHeight.read(reader));

		const targetVertRange = s.lineOffsetRange.read(reader);

		const space = 1;

		const targetRect = Rect.fromRanges(OffsetRange.fromTo(space, layout.lineNumbersLeft + layout.lineNumbersWidth + 4), targetVertRange);


		const lineHeight = this._editorObs.getOption(EditorOption.lineHeight).read(reader);
		const pillRect = targetRect.withHeight(lineHeight).withWidth(22);
		const pillRectMoved = pillRect.moveToBeContainedIn(viewPortWithStickyScroll);

		const rect = targetRect;

		const iconRect = (targetRect.containsRect(pillRectMoved))
			? pillRectMoved
			: pillRectMoved.moveToBeContainedIn(fullViewPort.intersect(targetRect.union(fullViewPort.withHeight(lineHeight)))!); //viewPortWithStickyScroll.intersect(rect)!;

		return {
			rect,
			iconRect,
			mode: (iconRect.top === targetRect.top ? 'right' as const
				: iconRect.top > targetRect.top ? 'top' as const : 'bottom' as const),
			docked: rect.containsRect(iconRect) && viewPortWithStickyScroll.containsRect(iconRect),
		};
	});

	private readonly _mode = derived(this, reader => {
		const m = this._model.read(reader);
		if (m && m.tabShouldAcceptInlineEdit.read(reader)) { return 'accept' as const; }
		if (m && m.tabShouldJumpToInlineEdit.read(reader)) { return 'jump' as const; }
		return 'inactive' as const;
	});

	private readonly _onClickAction = derived(this, reader => {
		if (this._layout.map(d => d && d.docked).read(reader)) {
			return {
				label: 'Click to accept inline edit',
				action: () => { this._model.get()?.accept(); }
			};
		} else {
			return {
				label: 'Click to jump to inline edit',
				action: () => { this._model.get()?.jump(); }
			};
		}
	});

	private readonly _indicator = n.div({
		class: 'inline-edits-view-gutter-indicator',
		onclick: () => this._onClickAction.get().action(),
		title: this._onClickAction.map(a => a.label),
		style: {
			position: 'absolute',
			overflow: 'visible',
		},
	}, mapOutFalsy(this._layout).map(l => !l ? [] : [
		n.div({
			style: {
				position: 'absolute',
				background: 'var(--vscode-inlineEdit-gutterIndicator-background)',
				borderRadius: '4px',
				...rectToProps(reader => l.read(reader).rect),
			}
		}),
		n.div({
			class: 'icon',
			style: {
				cursor: 'pointer',
				zIndex: '1000',
				position: 'absolute',
				backgroundColor: this._mode.map(v => ({
					inactive: 'var(--vscode-inlineEdit-gutterIndicator-secondaryBackground)',
					jump: 'var(--vscode-inlineEdit-gutterIndicator-primaryBackground)',
					accept: 'var(--vscode-inlineEdit-gutterIndicator-successfulBackground)',
				}[v])),
				'--vscodeIconForeground': this._mode.map(v => ({
					inactive: 'var(--vscode-inlineEdit-gutterIndicator-secondaryForeground)',
					jump: 'var(--vscode-inlineEdit-gutterIndicator-primaryForeground)',
					accept: 'var(--vscode-inlineEdit-gutterIndicator-successfulForeground)',
				}[v])),
				borderRadius: '4px',
				display: 'flex',
				justifyContent: 'center',
				transition: 'background-color 0.2s ease-in-out',
				...rectToProps(reader => l.read(reader).iconRect),
			}
		}, [
			n.div({
				style: {
					rotate: l.map(l => ({ right: '0deg', bottom: '90deg', top: '-90deg' }[l.mode])),
					transition: 'rotate 0.2s ease-in-out',
				}
			}, [
				renderIcon(Codicon.arrowRight),
			])
		]),
	])).keepUpdated(this._store);

	constructor(
		private readonly _editorObs: ObservableCodeEditor,
		private readonly _originalRange: IObservable<LineRange | undefined>,
		private readonly _model: IObservable<InlineCompletionsModel | undefined>,
	) {
		super();

		this._register(this._editorObs.createOverlayWidget({
			domNode: this._indicator.element,
			position: constObservable(null),
			allowEditorOverflow: false,
			minContentWidthInPx: constObservable(0),
		}));
	}
}

function rectToProps(fn: (reader: IReader) => Rect): any {
	return {
		left: derived(reader => fn(reader).left),
		top: derived(reader => fn(reader).top),
		width: derived(reader => fn(reader).right - fn(reader).left),
		height: derived(reader => fn(reader).bottom - fn(reader).top),
	};
}
