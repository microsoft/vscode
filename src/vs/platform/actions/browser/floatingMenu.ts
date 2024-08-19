/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode } from 'vs/base/browser/dom';
import { Widget } from 'vs/base/browser/ui/widget';
import { IAction } from 'vs/base/common/actions';
import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenu, IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { asCssVariable, asCssVariableWithDefault, buttonBackground, buttonForeground, contrastBorder, editorBackground, editorForeground } from 'vs/platform/theme/common/colorRegistry';

export class FloatingClickWidget extends Widget {

	private readonly _onClick = this._register(new Emitter<void>());
	readonly onClick = this._onClick.event;

	private _domNode: HTMLElement;

	constructor(private label: string) {
		super();

		this._domNode = $('.floating-click-widget');
		this._domNode.style.padding = '6px 11px';
		this._domNode.style.borderRadius = '2px';
		this._domNode.style.cursor = 'pointer';
		this._domNode.style.zIndex = '1';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	render() {
		clearNode(this._domNode);
		this._domNode.style.backgroundColor = asCssVariableWithDefault(buttonBackground, asCssVariable(editorBackground));
		this._domNode.style.color = asCssVariableWithDefault(buttonForeground, asCssVariable(editorForeground));
		this._domNode.style.border = `1px solid ${asCssVariable(contrastBorder)}`;

		append(this._domNode, $('')).textContent = this.label;

		this.onclick(this._domNode, () => this._onClick.fire());
	}
}

export abstract class AbstractFloatingClickMenu extends Disposable {
	private readonly renderEmitter = new Emitter<FloatingClickWidget>();
	protected readonly onDidRender = this.renderEmitter.event;
	private readonly menu: IMenu;

	constructor(
		menuId: MenuId,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();
		this.menu = this._register(menuService.createMenu(menuId, contextKeyService));
	}

	/** Should be called in implementation constructors after they initialized */
	protected render() {
		const menuDisposables = this._register(new DisposableStore());
		const renderMenuAsFloatingClickBtn = () => {
			menuDisposables.clear();
			if (!this.isVisible()) {
				return;
			}
			const actions: IAction[] = [];
			createAndFillInActionBarActions(this.menu, { renderShortTitle: true, shouldForwardArgs: true }, actions);
			if (actions.length === 0) {
				return;
			}
			// todo@jrieken find a way to handle N actions, like showing a context menu
			const [first] = actions;
			const widget = this.createWidget(first, menuDisposables);
			menuDisposables.add(widget);
			menuDisposables.add(widget.onClick(() => first.run(this.getActionArg())));
			widget.render();
		};
		this._register(this.menu.onDidChange(renderMenuAsFloatingClickBtn));
		renderMenuAsFloatingClickBtn();
	}

	protected abstract createWidget(action: IAction, disposables: DisposableStore): FloatingClickWidget;

	protected getActionArg(): unknown {
		return undefined;
	}

	protected isVisible() {
		return true;
	}
}

export class FloatingClickMenu extends AbstractFloatingClickMenu {

	constructor(
		private readonly options: {
			/** Element the menu should be rendered into. */
			container: HTMLElement;
			/** Menu to show. If no actions are present, the button is hidden. */
			menuId: MenuId;
			/** Argument provided to the menu action */
			getActionArg: () => void;
		},
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(options.menuId, menuService, contextKeyService);
		this.render();
	}

	protected override createWidget(action: IAction, disposable: DisposableStore): FloatingClickWidget {
		const w = this.instantiationService.createInstance(FloatingClickWidget, action.label);
		const node = w.getDomNode();
		this.options.container.appendChild(node);
		disposable.add(toDisposable(() => node.remove()));
		return w;
	}

	protected override getActionArg(): unknown {
		return this.options.getActionArg();
	}
}
