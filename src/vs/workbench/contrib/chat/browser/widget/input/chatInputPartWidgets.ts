/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ContextKeyExpression, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { BrandedService, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';

/**
 * A widget that can be rendered on top of the chat input part.
 */
export interface IChatInputPartWidget extends IDisposable {
	/**
	 * The DOM node of the widget.
	 */
	readonly domNode: HTMLElement;

	/**
	 * Fired when the height of the widget changes.
	 */
	readonly onDidChangeHeight: Event<void>;

	/**
	 * The current height of the widget in pixels.
	 */
	readonly height: number;
}

export interface IChatInputPartWidgetDescriptor<Services extends BrandedService[] = BrandedService[]> {
	readonly id: string;
	readonly when?: ContextKeyExpression;
	readonly ctor: new (...services: Services) => IChatInputPartWidget;
}

/**
 * Registry for chat input part widgets.
 * Widgets register themselves and are instantiated by the controller based on context key conditions.
 */
export const ChatInputPartWidgetsRegistry = new class {
	readonly widgets: IChatInputPartWidgetDescriptor[] = [];

	register<Services extends BrandedService[]>(id: string, ctor: new (...services: Services) => IChatInputPartWidget, when?: ContextKeyExpression): void {
		this.widgets.push({ id, ctor: ctor as IChatInputPartWidgetDescriptor['ctor'], when });
	}

	getWidgets(): readonly IChatInputPartWidgetDescriptor[] {
		return this.widgets;
	}
}();

interface IRenderedWidget {
	readonly descriptor: IChatInputPartWidgetDescriptor;
	readonly widget: IChatInputPartWidget;
	readonly disposables: DisposableStore;
}

/**
 * Controller that manages the rendering of widgets in the chat input part.
 * Widgets are shown/hidden based on context key conditions.
 */
export class ChatInputPartWidgetController extends Disposable {

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private readonly renderedWidgets = new Map<string, IRenderedWidget>();

	constructor(
		private readonly container: HTMLElement,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.update();

		this._register(this.contextKeyService.onDidChangeContext(e => {
			const relevantKeys = new Set<string>();
			for (const descriptor of ChatInputPartWidgetsRegistry.getWidgets()) {
				if (descriptor.when) {
					for (const key of descriptor.when.keys()) {
						relevantKeys.add(key);
					}
				}
			}
			if (e.affectsSome(relevantKeys)) {
				this.update();
			}
		}));
	}

	private update(): void {
		const visibleIds = new Set<string>();
		for (const descriptor of ChatInputPartWidgetsRegistry.getWidgets()) {
			if (this.contextKeyService.contextMatchesRules(descriptor.when)) {
				visibleIds.add(descriptor.id);
			}
		}

		for (const [id, rendered] of this.renderedWidgets) {
			if (!visibleIds.has(id)) {
				rendered.widget.domNode.remove();
				rendered.disposables.dispose();
				this.renderedWidgets.delete(id);
			}
		}

		for (const descriptor of ChatInputPartWidgetsRegistry.getWidgets()) {
			if (!visibleIds.has(descriptor.id)) {
				continue;
			}

			if (!this.renderedWidgets.has(descriptor.id)) {
				const disposables = new DisposableStore();
				const widget = this.instantiationService.createInstance(descriptor.ctor);
				disposables.add(widget);
				disposables.add(widget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

				this.renderedWidgets.set(descriptor.id, { descriptor, widget, disposables });
				this.container.appendChild(widget.domNode);
			}
		}

		this._onDidChangeHeight.fire();
	}

	get height(): number {
		let total = 0;
		for (const rendered of this.renderedWidgets.values()) {
			total += rendered.widget.height;
		}
		return total;
	}

	override dispose(): void {
		for (const rendered of this.renderedWidgets.values()) {
			rendered.widget.domNode.remove();
			rendered.disposables.dispose();
		}
		this.renderedWidgets.clear();
		super.dispose();
	}
}
