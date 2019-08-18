/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { ActionBar, IActionBarOptions } from 'vs/base/browser/ui/actionbar/actionbar';
import { Action } from 'vs/base/common/actions';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import * as objects from 'vs/base/common/objects';
import * as strings from 'vs/base/common/strings';
import 'vs/css!./media/peekViewWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IOptions, IStyles, ZoneWidget } from 'vs/editor/contrib/zoneWidget/zoneWidget';
import * as nls from 'vs/nls';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';


export const IPeekViewService = createDecorator<IPeekViewService>('IPeekViewService');
export interface IPeekViewService {
	_serviceBrand: any;
	addExclusiveWidget(editor: ICodeEditor, widget: PeekViewWidget): void;
}

registerSingleton(IPeekViewService, class implements IPeekViewService {
	_serviceBrand: any;

	private _widgets = new Map<ICodeEditor, { widget: PeekViewWidget, listener: IDisposable }>();

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
});

export namespace PeekContext {
	export const inPeekEditor = new RawContextKey<boolean>('inReferenceSearchEditor', true);
	export const notInPeekEditor: ContextKeyExpr = inPeekEditor.toNegated();
}

export function getOuterEditor(accessor: ServicesAccessor): ICodeEditor | null {
	let editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
	if (editor instanceof EmbeddedCodeEditorWidget) {
		return editor.getParentEditor();
	}
	return editor;
}

export interface IPeekViewStyles extends IStyles {
	headerBackgroundColor?: Color;
	primaryHeadingColor?: Color;
	secondaryHeadingColor?: Color;
}

export type IPeekViewOptions = IOptions & IPeekViewStyles;

const defaultOptions: IPeekViewOptions = {
	headerBackgroundColor: Color.white,
	primaryHeadingColor: Color.fromHex('#333333'),
	secondaryHeadingColor: Color.fromHex('#6c6c6cb3')
};

export abstract class PeekViewWidget extends ZoneWidget {

	public _serviceBrand: any;

	private _onDidClose = new Emitter<PeekViewWidget>();

	protected _headElement?: HTMLDivElement;
	protected _primaryHeading?: HTMLElement;
	protected _secondaryHeading?: HTMLElement;
	protected _metaHeading?: HTMLElement;
	protected _actionbarWidget?: ActionBar;
	protected _bodyElement?: HTMLDivElement;

	constructor(editor: ICodeEditor, options: IPeekViewOptions = {}) {
		super(editor, options);
		objects.mixin(this.options, defaultOptions, false);
	}

	public dispose(): void {
		super.dispose();
		this._onDidClose.fire(this);
	}

	public get onDidClose(): Event<PeekViewWidget> {
		return this._onDidClose.event;
	}

	public style(styles: IPeekViewStyles): void {
		let options = <IPeekViewOptions>this.options;
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

	protected _applyStyles(): void {
		super._applyStyles();
		let options = <IPeekViewOptions>this.options;
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

	protected _fillHead(container: HTMLElement): void {
		const titleElement = dom.$('.peekview-title');
		dom.append(this._headElement!, titleElement);
		dom.addStandardDisposableListener(titleElement, 'click', event => this._onTitleClick(event));

		this._fillTitleIcon(titleElement);
		this._primaryHeading = dom.$('span.filename');
		this._secondaryHeading = dom.$('span.dirname');
		this._metaHeading = dom.$('span.meta');
		dom.append(titleElement, this._primaryHeading, this._secondaryHeading, this._metaHeading);

		const actionsContainer = dom.$('.peekview-actions');
		dom.append(this._headElement!, actionsContainer);

		const actionBarOptions = this._getActionBarOptions();
		this._actionbarWidget = new ActionBar(actionsContainer, actionBarOptions);
		this._disposables.add(this._actionbarWidget);

		this._actionbarWidget.push(new Action('peekview.close', nls.localize('label.close', "Close"), 'close-peekview-action', true, () => {
			this.dispose();
			return Promise.resolve();
		}), { label: false, icon: true });
	}

	protected _fillTitleIcon(container: HTMLElement): void {
	}

	protected _getActionBarOptions(): IActionBarOptions {
		return {};
	}

	protected _onTitleClick(event: IMouseEvent): void {
		// implement me
	}

	public setTitle(primaryHeading: string, secondaryHeading?: string): void {
		if (this._primaryHeading && this._secondaryHeading) {
			this._primaryHeading.innerHTML = strings.escape(primaryHeading);
			this._primaryHeading.setAttribute('aria-label', primaryHeading);
			if (secondaryHeading) {
				this._secondaryHeading.innerHTML = strings.escape(secondaryHeading);
			} else {
				dom.clearNode(this._secondaryHeading);
			}
		}
	}

	public setMetaTitle(value: string): void {
		if (this._metaHeading) {
			if (value) {
				this._metaHeading.innerHTML = strings.escape(value);
			} else {
				dom.clearNode(this._metaHeading);
			}
		}
	}

	protected abstract _fillBody(container: HTMLElement): void;

	public _doLayout(heightInPixel: number, widthInPixel: number): void {

		if (!this._isShowing && heightInPixel < 0) {
			// Looks like the view zone got folded away!
			this.dispose();
			return;
		}

		const headHeight = Math.ceil(this.editor.getConfiguration().lineHeight * 1.2);
		const bodyHeight = heightInPixel - (headHeight + 2 /* the border-top/bottom width*/);

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
