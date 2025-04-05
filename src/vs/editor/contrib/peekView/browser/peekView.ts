/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { ActionBar, ActionsOrientation, IActionBarOptions } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Color } from '../../../../base/common/color.js';
import { Emitter } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import * as objects from '../../../../base/common/objects.js';
import './media/peekViewWidget.css';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { EmbeddedCodeEditorWidget } from '../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { IOptions, IStyles, ZoneWidget } from '../../zoneWidget/browser/zoneWidget.js';
import * as nls from '../../../../nls.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { activeContrastBorder, contrastBorder, editorForeground, editorInfoForeground, registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { observableCodeEditor } from '../../../browser/observableCodeEditor.js';

export const IPeekViewService = createDecorator<IPeekViewService>('IPeekViewService');
export interface IPeekViewService {
	readonly _serviceBrand: undefined;
	addExclusiveWidget(editor: ICodeEditor, widget: PeekViewWidget): void;
}

registerSingleton(IPeekViewService, class implements IPeekViewService {
	declare readonly _serviceBrand: undefined;

	private readonly _widgets = new Map<ICodeEditor, { widget: PeekViewWidget; listener: IDisposable }>();

	addExclusiveWidget(editor: ICodeEditor, widget: PeekViewWidget): void {
		const existing = this._widgets.get(editor);
		if (existing) {
			existing.listener.dispose();
			existing.widget.dispose();
		}
		const remove = () => {
			const data = this._widgets.get(editor);
			if (data && data.widget === widget) {
				data.listener.dispose();
				this._widgets.delete(editor);
			}
		};
		this._widgets.set(editor, { widget, listener: widget.onDidClose(remove) });
	}
}, InstantiationType.Delayed);

export namespace PeekContext {
	export const inPeekEditor = new RawContextKey<boolean>('inReferenceSearchEditor', true, nls.localize('inReferenceSearchEditor', "Whether the current code editor is embedded inside peek"));
	export const notInPeekEditor = inPeekEditor.toNegated();
}

class PeekContextController implements IEditorContribution {

	static readonly ID = 'editor.contrib.referenceController';

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		if (editor instanceof EmbeddedCodeEditorWidget) {
			PeekContext.inPeekEditor.bindTo(contextKeyService);
		}
	}

	dispose(): void { }
}

registerEditorContribution(PeekContextController.ID, PeekContextController, EditorContributionInstantiation.Eager); // eager because it needs to define a context key

export interface IPeekViewStyles extends IStyles {
	headerBackgroundColor?: Color;
	primaryHeadingColor?: Color;
	secondaryHeadingColor?: Color;
}

export type IPeekViewOptions = IOptions & IPeekViewStyles & {
	supportOnTitleClick?: boolean;
};

const defaultOptions: IPeekViewOptions = {
	headerBackgroundColor: Color.white,
	primaryHeadingColor: Color.fromHex('#333333'),
	secondaryHeadingColor: Color.fromHex('#6c6c6cb3')
};

export abstract class PeekViewWidget extends ZoneWidget {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidClose = new Emitter<PeekViewWidget>();
	readonly onDidClose = this._onDidClose.event;
	private disposed?: true;

	protected _headElement?: HTMLDivElement;
	protected _titleElement?: HTMLDivElement;
	protected _primaryHeading?: HTMLElement;
	protected _secondaryHeading?: HTMLElement;
	protected _metaHeading?: HTMLElement;
	protected _actionbarWidget?: ActionBar;
	protected _bodyElement?: HTMLDivElement;

	constructor(
		editor: ICodeEditor,
		options: IPeekViewOptions,
		@IInstantiationService protected readonly instantiationService: IInstantiationService
	) {
		super(editor, options);
		objects.mixin(this.options, defaultOptions, false);

		const e = observableCodeEditor(this.editor);
		e.openedPeekWidgets.set(e.openedPeekWidgets.get() + 1, undefined);
	}

	override dispose(): void {
		if (!this.disposed) {
			this.disposed = true; // prevent consumers who dispose on onDidClose from looping
			super.dispose();
			this._onDidClose.fire(this);

			const e = observableCodeEditor(this.editor);
			e.openedPeekWidgets.set(e.openedPeekWidgets.get() - 1, undefined);
		}
	}

	override style(styles: IPeekViewStyles): void {
		const options = <IPeekViewOptions>this.options;
		if (styles.headerBackgroundColor) {
			options.headerBackgroundColor = styles.headerBackgroundColor;
		}
		if (styles.primaryHeadingColor) {
			options.primaryHeadingColor = styles.primaryHeadingColor;
		}
		if (styles.secondaryHeadingColor) {
			options.secondaryHeadingColor = styles.secondaryHeadingColor;
		}
		super.style(styles);
	}

	protected override _applyStyles(): void {
		super._applyStyles();
		const options = <IPeekViewOptions>this.options;
		if (this._headElement && options.headerBackgroundColor) {
			this._headElement.style.backgroundColor = options.headerBackgroundColor.toString();
		}
		if (this._primaryHeading && options.primaryHeadingColor) {
			this._primaryHeading.style.color = options.primaryHeadingColor.toString();
		}
		if (this._secondaryHeading && options.secondaryHeadingColor) {
			this._secondaryHeading.style.color = options.secondaryHeadingColor.toString();
		}
		if (this._bodyElement && options.frameColor) {
			this._bodyElement.style.borderColor = options.frameColor.toString();
		}
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('peekview-widget');

		this._headElement = dom.$<HTMLDivElement>('.head');
		this._bodyElement = dom.$<HTMLDivElement>('.body');

		this._fillHead(this._headElement);
		this._fillBody(this._bodyElement);

		container.appendChild(this._headElement);
		container.appendChild(this._bodyElement);
	}

	protected _fillHead(container: HTMLElement, noCloseAction?: boolean): void {
		this._titleElement = dom.$('.peekview-title');
		if ((this.options as IPeekViewOptions).supportOnTitleClick) {
			this._titleElement.classList.add('clickable');
			dom.addStandardDisposableListener(this._titleElement, 'click', event => this._onTitleClick(event));
		}
		dom.append(this._headElement!, this._titleElement);

		this._fillTitleIcon(this._titleElement);
		this._primaryHeading = dom.$('span.filename');
		this._secondaryHeading = dom.$('span.dirname');
		this._metaHeading = dom.$('span.meta');
		dom.append(this._titleElement, this._primaryHeading, this._secondaryHeading, this._metaHeading);

		const actionsContainer = dom.$('.peekview-actions');
		dom.append(this._headElement!, actionsContainer);

		const actionBarOptions = this._getActionBarOptions();
		this._actionbarWidget = new ActionBar(actionsContainer, actionBarOptions);
		this._disposables.add(this._actionbarWidget);

		if (!noCloseAction) {
			this._actionbarWidget.push(this._disposables.add(new Action('peekview.close', nls.localize('label.close', "Close"), ThemeIcon.asClassName(Codicon.close), true, () => {
				this.dispose();
				return Promise.resolve();
			})), { label: false, icon: true });
		}
	}

	protected _fillTitleIcon(container: HTMLElement): void {
	}

	protected _getActionBarOptions(): IActionBarOptions {
		return {
			actionViewItemProvider: createActionViewItem.bind(undefined, this.instantiationService),
			orientation: ActionsOrientation.HORIZONTAL
		};
	}

	protected _onTitleClick(event: IMouseEvent): void {
		// implement me if supportOnTitleClick option is set
	}

	setTitle(primaryHeading: string, secondaryHeading?: string): void {
		if (this._primaryHeading && this._secondaryHeading) {
			this._primaryHeading.innerText = primaryHeading;
			this._primaryHeading.setAttribute('title', primaryHeading);
			if (secondaryHeading) {
				this._secondaryHeading.innerText = secondaryHeading;
			} else {
				dom.clearNode(this._secondaryHeading);
			}
		}
	}

	setMetaTitle(value: string): void {
		if (this._metaHeading) {
			if (value) {
				this._metaHeading.innerText = value;
				dom.show(this._metaHeading);
			} else {
				dom.hide(this._metaHeading);
			}
		}
	}

	protected abstract _fillBody(container: HTMLElement): void;

	protected override _doLayout(heightInPixel: number, widthInPixel: number): void {

		if (!this._isShowing && heightInPixel < 0) {
			// Looks like the view zone got folded away!
			this.dispose();
			return;
		}

		const headHeight = Math.ceil(this.editor.getOption(EditorOption.lineHeight) * 1.2);
		const bodyHeight = Math.round(heightInPixel - (headHeight + 2 /* the border-top/bottom width*/));

		this._doLayoutHead(headHeight, widthInPixel);
		this._doLayoutBody(bodyHeight, widthInPixel);
	}

	protected _doLayoutHead(heightInPixel: number, widthInPixel: number): void {
		if (this._headElement) {
			this._headElement.style.height = `${heightInPixel}px`;
			this._headElement.style.lineHeight = this._headElement.style.height;
		}
	}

	protected _doLayoutBody(heightInPixel: number, widthInPixel: number): void {
		if (this._bodyElement) {
			this._bodyElement.style.height = `${heightInPixel}px`;
		}
	}
}


export const peekViewTitleBackground = registerColor('peekViewTitle.background', { dark: '#252526', light: '#F3F3F3', hcDark: Color.black, hcLight: Color.white }, nls.localize('peekViewTitleBackground', 'Background color of the peek view title area.'));
export const peekViewTitleForeground = registerColor('peekViewTitleLabel.foreground', { dark: Color.white, light: Color.black, hcDark: Color.white, hcLight: editorForeground }, nls.localize('peekViewTitleForeground', 'Color of the peek view title.'));
export const peekViewTitleInfoForeground = registerColor('peekViewTitleDescription.foreground', { dark: '#ccccccb3', light: '#616161', hcDark: '#FFFFFF99', hcLight: '#292929' }, nls.localize('peekViewTitleInfoForeground', 'Color of the peek view title info.'));
export const peekViewBorder = registerColor('peekView.border', { dark: editorInfoForeground, light: editorInfoForeground, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize('peekViewBorder', 'Color of the peek view borders and arrow.'));

export const peekViewResultsBackground = registerColor('peekViewResult.background', { dark: '#252526', light: '#F3F3F3', hcDark: Color.black, hcLight: Color.white }, nls.localize('peekViewResultsBackground', 'Background color of the peek view result list.'));
export const peekViewResultsMatchForeground = registerColor('peekViewResult.lineForeground', { dark: '#bbbbbb', light: '#646465', hcDark: Color.white, hcLight: editorForeground }, nls.localize('peekViewResultsMatchForeground', 'Foreground color for line nodes in the peek view result list.'));
export const peekViewResultsFileForeground = registerColor('peekViewResult.fileForeground', { dark: Color.white, light: '#1E1E1E', hcDark: Color.white, hcLight: editorForeground }, nls.localize('peekViewResultsFileForeground', 'Foreground color for file nodes in the peek view result list.'));
export const peekViewResultsSelectionBackground = registerColor('peekViewResult.selectionBackground', { dark: '#3399ff33', light: '#3399ff33', hcDark: null, hcLight: null }, nls.localize('peekViewResultsSelectionBackground', 'Background color of the selected entry in the peek view result list.'));
export const peekViewResultsSelectionForeground = registerColor('peekViewResult.selectionForeground', { dark: Color.white, light: '#6C6C6C', hcDark: Color.white, hcLight: editorForeground }, nls.localize('peekViewResultsSelectionForeground', 'Foreground color of the selected entry in the peek view result list.'));
export const peekViewEditorBackground = registerColor('peekViewEditor.background', { dark: '#001F33', light: '#F2F8FC', hcDark: Color.black, hcLight: Color.white }, nls.localize('peekViewEditorBackground', 'Background color of the peek view editor.'));
export const peekViewEditorGutterBackground = registerColor('peekViewEditorGutter.background', peekViewEditorBackground, nls.localize('peekViewEditorGutterBackground', 'Background color of the gutter in the peek view editor.'));
export const peekViewEditorStickyScrollBackground = registerColor('peekViewEditorStickyScroll.background', peekViewEditorBackground, nls.localize('peekViewEditorStickScrollBackground', 'Background color of sticky scroll in the peek view editor.'));

export const peekViewResultsMatchHighlight = registerColor('peekViewResult.matchHighlightBackground', { dark: '#ea5c004d', light: '#ea5c004d', hcDark: null, hcLight: null }, nls.localize('peekViewResultsMatchHighlight', 'Match highlight color in the peek view result list.'));
export const peekViewEditorMatchHighlight = registerColor('peekViewEditor.matchHighlightBackground', { dark: '#ff8f0099', light: '#f5d802de', hcDark: null, hcLight: null }, nls.localize('peekViewEditorMatchHighlight', 'Match highlight color in the peek view editor.'));
export const peekViewEditorMatchHighlightBorder = registerColor('peekViewEditor.matchHighlightBorder', { dark: null, light: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder }, nls.localize('peekViewEditorMatchHighlightBorder', 'Match highlight border in the peek view editor.'));
