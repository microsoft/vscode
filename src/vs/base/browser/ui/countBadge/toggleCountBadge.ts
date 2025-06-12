/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CountBadge, ICountBadgeOptions, ICountBadgeStyles } from './countBadge.js';
import { Emitter, Event } from '../../../common/event.js';
import * as dom from '../../dom.js';

/**
 * A CountBadge that acts as a toggle button.
 */
export class ToggleCountBadge extends CountBadge {

	private toggled: boolean = false;
	private readonly _onDidToggle = new Emitter<boolean>();
	readonly onDidToggle: Event<boolean> = this._onDidToggle.event;
	readonly _element: HTMLElement;

	constructor(container: HTMLElement, options: ICountBadgeOptions, styles: ICountBadgeStyles) {
		super(container, options, styles);

		this._element = this.getElement();
		this._element.tabIndex = 0;
		this._element.setAttribute('role', 'button');
		this._element.setAttribute('aria-pressed', 'false');
		this._element.classList.add('monaco-toggle-count-badge');

		this._register(this._onDidToggle);
		this._register(dom.addDisposableListener(this._element, 'click', () => this.toggle()));

	}
	public override dispose(): void {
		super.dispose();

	}
	toggle(): void {
		this.toggled = !this.toggled;
		this._element.setAttribute('aria-pressed', String(this.toggled));
		this._element.classList.toggle('toggled', this.toggled);
		this._onDidToggle.fire(this.toggled);
	}

	// Sets the toggled state of the badge, useful for tests
	setToggled(toggled: boolean): void {
		if (this.toggled !== toggled) {
			this.toggle();
		}
	}

	isToggled(): boolean {
		return this.toggled;
	}
}
