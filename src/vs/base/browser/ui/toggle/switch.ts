/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../dom.js';
import { Emitter, Event } from '../../../common/event.js';
import { Disposable } from '../../../common/lifecycle.js';
import { HoverStyle } from '../hover/hover.js';
import { getBaseLayerHoverDelegate } from '../hover/hoverDelegate2.js';
import './switch.css';

export interface ISwitchOptions {
	readonly checked?: boolean;
	/** Accessible name. Also used as the hover title unless {@link title} is given. */
	readonly ariaLabel: string;
	/** Hover title. Defaults to {@link ariaLabel}. */
	readonly title?: string;
	readonly disabled?: boolean;
}

/**
 * A pill switch for a setting that takes effect as soon as it is flipped, e.g. enabling
 * a plugin or letting a model be chosen automatically.
 *
 * Use this rather than a `Checkbox` when the control commits immediately; a checkbox
 * reads as part of a form that is submitted later.
 */
export class Switch extends Disposable {

	private readonly _onChange = this._register(new Emitter<boolean>());
	/** Fires with the new state when the user flips the switch, not when it is set in code. */
	readonly onChange: Event<boolean> = this._onChange.event;

	readonly domNode: HTMLButtonElement;

	private _checked: boolean;
	private _title: string;

	constructor(options: ISwitchOptions) {
		super();
		this._checked = !!options.checked;
		this._title = options.title ?? options.ariaLabel;

		this.domNode = dom.$('button.monaco-switch');
		this.domNode.type = 'button';
		this.domNode.setAttribute('role', 'switch');
		dom.append(this.domNode, dom.$('.monaco-switch-thumb'));

		this._register(getBaseLayerHoverDelegate().setupDelayedHover(this.domNode, () => ({
			content: this._title,
			style: HoverStyle.Pointer,
		})));

		this.setAriaLabel(options.ariaLabel, options.title);
		this.disabled = !!options.disabled;
		this._applyState();

		this._register(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, e => {
			dom.EventHelper.stop(e, true);
			if (this.domNode.disabled) {
				return;
			}
			this._checked = !this._checked;
			this._applyState();
			this._onChange.fire(this._checked);
		}));
	}

	get checked(): boolean {
		return this._checked;
	}

	/** Sets the state without firing {@link onChange}. */
	set checked(checked: boolean) {
		if (this._checked !== checked) {
			this._checked = checked;
			this._applyState();
		}
	}

	get disabled(): boolean {
		return this.domNode.disabled;
	}

	set disabled(disabled: boolean) {
		this.domNode.disabled = disabled;
	}

	setAriaLabel(ariaLabel: string, title = ariaLabel): void {
		this.domNode.setAttribute('aria-label', ariaLabel);
		this._title = title;
	}

	private _applyState(): void {
		this.domNode.setAttribute('aria-checked', String(this._checked));
		this.domNode.classList.toggle('checked', this._checked);
	}
}
