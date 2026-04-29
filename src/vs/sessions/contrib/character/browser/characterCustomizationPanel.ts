/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import {
	CHARACTER_BODY_COLORS,
	CHARACTER_NAME_MAX_LENGTH,
	CharacterAccessory,
	CharacterBodyShape,
	CharacterEyes,
	CharacterHat,
	ICharacterCustomization,
	parseCustomization,
} from '../common/characterCustomization.js';
import { CharacterAvatar, CharacterPose } from './characterAvatar.js';

interface IPickerOption<T extends string> {
	readonly value: T;
	readonly label: string;
}

const SHAPE_OPTIONS: readonly IPickerOption<CharacterBodyShape>[] = [
	{ value: CharacterBodyShape.Round, label: localize('character.shape.round', "Round") },
	{ value: CharacterBodyShape.Tall, label: localize('character.shape.tall', "Tall") },
	{ value: CharacterBodyShape.Short, label: localize('character.shape.short', "Short") },
];

const HAT_OPTIONS: readonly IPickerOption<CharacterHat>[] = [
	{ value: CharacterHat.None, label: localize('character.hat.none', "None") },
	{ value: CharacterHat.Top, label: localize('character.hat.top', "Top hat") },
	{ value: CharacterHat.Cap, label: localize('character.hat.cap', "Cap") },
	{ value: CharacterHat.Beanie, label: localize('character.hat.beanie', "Beanie") },
	{ value: CharacterHat.Crown, label: localize('character.hat.crown', "Crown") },
	{ value: CharacterHat.Bow, label: localize('character.hat.bow', "Bow") },
];

const EYES_OPTIONS: readonly IPickerOption<CharacterEyes>[] = [
	{ value: CharacterEyes.Round, label: localize('character.eyes.round', "Round") },
	{ value: CharacterEyes.Sleepy, label: localize('character.eyes.sleepy', "Sleepy") },
	{ value: CharacterEyes.Star, label: localize('character.eyes.star', "Star") },
	{ value: CharacterEyes.Heart, label: localize('character.eyes.heart', "Heart") },
	{ value: CharacterEyes.Wink, label: localize('character.eyes.wink', "Wink") },
];

const ACCESSORY_OPTIONS: readonly IPickerOption<CharacterAccessory>[] = [
	{ value: CharacterAccessory.None, label: localize('character.accessory.none', "None") },
	{ value: CharacterAccessory.Glasses, label: localize('character.accessory.glasses', "Glasses") },
	{ value: CharacterAccessory.Monocle, label: localize('character.accessory.monocle', "Monocle") },
	{ value: CharacterAccessory.Scarf, label: localize('character.accessory.scarf', "Scarf") },
];

/**
 * A small inline panel that takes over the character stage to let the user
 * customize the avatar. The live character on the stage updates immediately as
 * the user edits; persistence is handled by the caller via the
 * `onDidChange` event (which fires with the new customization on every edit).
 *
 * The panel is built with plain DOM (no innerHTML) to satisfy Trusted Types.
 */
export class CharacterCustomizationPanel extends Disposable {

	readonly element: HTMLDivElement;

	private readonly previewAvatar: CharacterAvatar;
	private customization: ICharacterCustomization;

	private readonly _onDidChange = this._register(new Emitter<ICharacterCustomization>());
	readonly onDidChange: Event<ICharacterCustomization> = this._onDidChange.event;

	private readonly _onDidRequestClose = this._register(new Emitter<void>());
	readonly onDidRequestClose: Event<void> = this._onDidRequestClose.event;

	constructor(targetDocument: Document, initial: ICharacterCustomization) {
		super();
		this.customization = parseCustomization(initial);

		this.element = targetDocument.createElement('div');
		this.element.className = 'agents-character-customization';
		this.element.setAttribute('role', 'dialog');
		this.element.setAttribute('aria-label', localize('character.customize.dialog', "Customize character"));

		const previewWrap = targetDocument.createElement('div');
		previewWrap.className = 'agents-character-customization-preview';
		this.element.appendChild(previewWrap);

		this.previewAvatar = this._register(new CharacterAvatar(targetDocument, this.customization, /* showName */ true));
		this.previewAvatar.applyPose(CharacterPose.Idle);
		previewWrap.appendChild(this.previewAvatar.element);

		const form = targetDocument.createElement('div');
		form.className = 'agents-character-customization-form';
		this.element.appendChild(form);

		// --- Name ---
		form.appendChild(this.renderNameRow(targetDocument));

		// --- Color ---
		form.appendChild(this.renderColorRow(targetDocument));

		// --- Shape ---
		form.appendChild(this.renderEnumRow(targetDocument, localize('character.shape.label', "Shape"), SHAPE_OPTIONS, this.customization.bodyShape, value => {
			this.update({ bodyShape: value });
		}));

		// --- Hat ---
		form.appendChild(this.renderEnumRow(targetDocument, localize('character.hat.label', "Hat"), HAT_OPTIONS, this.customization.hat, value => {
			this.update({ hat: value });
		}));

		// --- Eyes ---
		form.appendChild(this.renderEnumRow(targetDocument, localize('character.eyes.label', "Eyes"), EYES_OPTIONS, this.customization.eyes, value => {
			this.update({ eyes: value });
		}));

		// --- Accessory ---
		form.appendChild(this.renderEnumRow(targetDocument, localize('character.accessory.label', "Accessory"), ACCESSORY_OPTIONS, this.customization.accessory, value => {
			this.update({ accessory: value });
		}));

		// --- Done ---
		const doneRow = targetDocument.createElement('div');
		doneRow.className = 'agents-character-customization-actions';
		const doneButton = targetDocument.createElement('button');
		doneButton.type = 'button';
		doneButton.className = 'agents-character-customization-done';
		doneButton.textContent = localize('character.customize.done', "Done");
		this._register(addDisposableListener(doneButton, EventType.CLICK, () => this._onDidRequestClose.fire()));
		doneRow.appendChild(doneButton);
		form.appendChild(doneRow);
	}

	private update(patch: Partial<ICharacterCustomization>): void {
		this.customization = { ...this.customization, ...patch };
		this.previewAvatar.applyCustomization(this.customization);
		this._onDidChange.fire(this.customization);
	}

	private renderNameRow(doc: Document): HTMLElement {
		const row = doc.createElement('div');
		row.className = 'agents-character-customization-row';

		const label = doc.createElement('label');
		label.className = 'agents-character-customization-label';
		label.textContent = localize('character.name.label', "Name");
		row.appendChild(label);

		const input = doc.createElement('input');
		input.type = 'text';
		input.className = 'agents-character-customization-name';
		input.maxLength = CHARACTER_NAME_MAX_LENGTH;
		input.value = this.customization.name;
		input.setAttribute('aria-label', localize('character.name.aria', "Character name"));
		label.appendChild(input);

		this._register(addDisposableListener(input, EventType.INPUT, () => {
			const value = input.value.trim().slice(0, CHARACTER_NAME_MAX_LENGTH);
			this.update({ name: value || 'Buddy' });
		}));

		return row;
	}

	private renderColorRow(doc: Document): HTMLElement {
		const row = doc.createElement('div');
		row.className = 'agents-character-customization-row';

		const label = doc.createElement('div');
		label.className = 'agents-character-customization-label';
		label.textContent = localize('character.color.label', "Color");
		row.appendChild(label);

		const swatches = doc.createElement('div');
		swatches.className = 'agents-character-customization-swatches';
		row.appendChild(swatches);

		const store = this._register(new DisposableStore());
		const buttons: HTMLButtonElement[] = [];
		for (const color of CHARACTER_BODY_COLORS) {
			const btn = doc.createElement('button');
			btn.type = 'button';
			btn.className = 'agents-character-customization-swatch';
			btn.style.background = color;
			btn.setAttribute('aria-label', localize('character.color.swatch', "Color {0}", color));
			btn.setAttribute('aria-pressed', String(color === this.customization.bodyColor));
			if (color === this.customization.bodyColor) {
				btn.classList.add('selected');
			}
			store.add(addDisposableListener(btn, EventType.CLICK, () => {
				for (const b of buttons) {
					b.classList.remove('selected');
					b.setAttribute('aria-pressed', 'false');
				}
				btn.classList.add('selected');
				btn.setAttribute('aria-pressed', 'true');
				this.update({ bodyColor: color });
			}));
			buttons.push(btn);
			swatches.appendChild(btn);
		}

		return row;
	}

	private renderEnumRow<T extends string>(
		doc: Document,
		labelText: string,
		options: readonly IPickerOption<T>[],
		initial: T,
		onChange: (value: T) => void,
	): HTMLElement {
		const row = doc.createElement('div');
		row.className = 'agents-character-customization-row';

		const label = doc.createElement('div');
		label.className = 'agents-character-customization-label';
		label.textContent = labelText;
		row.appendChild(label);

		const group = doc.createElement('div');
		group.className = 'agents-character-customization-options';
		row.appendChild(group);

		const buttons: HTMLButtonElement[] = [];
		const store = this._register(new DisposableStore());
		for (const option of options) {
			const btn = doc.createElement('button');
			btn.type = 'button';
			btn.className = 'agents-character-customization-option';
			btn.textContent = option.label;
			btn.setAttribute('aria-pressed', String(option.value === initial));
			if (option.value === initial) {
				btn.classList.add('selected');
			}
			store.add(addDisposableListener(btn, EventType.CLICK, () => {
				for (const b of buttons) {
					b.classList.remove('selected');
					b.setAttribute('aria-pressed', 'false');
				}
				btn.classList.add('selected');
				btn.setAttribute('aria-pressed', 'true');
				onChange(option.value);
			}));
			buttons.push(btn);
			group.appendChild(btn);
		}
		return row;
	}

	override dispose(): void {
		this.element.remove();
		super.dispose();
	}
}
