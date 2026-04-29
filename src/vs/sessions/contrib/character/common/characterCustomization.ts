/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Customization model for the Agents window character easter egg. All values
 * are simple enums (or short strings) so the customization can be serialized
 * to a single JSON blob in {@link IStorageService} and survive forward/backward
 * compatibility cleanly via {@link parseCustomization}.
 */

export const enum CharacterBodyShape {
	Round = 'round',
	Tall = 'tall',
	Short = 'short',
}

export const enum CharacterHat {
	None = 'none',
	Top = 'top',
	Cap = 'cap',
	Beanie = 'beanie',
	Crown = 'crown',
	Bow = 'bow',
}

export const enum CharacterEyes {
	Round = 'round',
	Sleepy = 'sleepy',
	Star = 'star',
	Heart = 'heart',
	Wink = 'wink',
}

export const enum CharacterAccessory {
	None = 'none',
	Glasses = 'glasses',
	Monocle = 'monocle',
	Scarf = 'scarf',
}

export interface ICharacterCustomization {
	readonly bodyColor: string;
	readonly bodyShape: CharacterBodyShape;
	readonly hat: CharacterHat;
	readonly eyes: CharacterEyes;
	readonly accessory: CharacterAccessory;
	readonly name: string;
}

export const CHARACTER_NAME_MAX_LENGTH = 16;

export const DEFAULT_CHARACTER_CUSTOMIZATION: ICharacterCustomization = {
	bodyColor: '#7BD389',
	bodyShape: CharacterBodyShape.Round,
	hat: CharacterHat.None,
	eyes: CharacterEyes.Round,
	accessory: CharacterAccessory.None,
	name: 'Buddy',
};

/** Predefined body color swatches offered in the customization panel. */
export const CHARACTER_BODY_COLORS: readonly string[] = [
	'#7BD389', // mint
	'#7AA8E0', // sky
	'#E07A8B', // rose
	'#E0C97A', // gold
	'#B07AE0', // lavender
	'#7AE0D6', // teal
	'#E08F4F', // tangerine
	'#E0E0E0', // ash
];

const HAT_VALUES = new Set<string>([CharacterHat.None, CharacterHat.Top, CharacterHat.Cap, CharacterHat.Beanie, CharacterHat.Crown, CharacterHat.Bow]);
const EYES_VALUES = new Set<string>([CharacterEyes.Round, CharacterEyes.Sleepy, CharacterEyes.Star, CharacterEyes.Heart, CharacterEyes.Wink]);
const ACCESSORY_VALUES = new Set<string>([CharacterAccessory.None, CharacterAccessory.Glasses, CharacterAccessory.Monocle, CharacterAccessory.Scarf]);
const SHAPE_VALUES = new Set<string>([CharacterBodyShape.Round, CharacterBodyShape.Tall, CharacterBodyShape.Short]);

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Validate and normalize a value previously persisted via {@link IStorageService}.
 * Tolerant of missing or invalid fields - falls back to defaults so a stored
 * blob from an older or newer build never breaks the easter egg.
 */
export function parseCustomization(raw: unknown): ICharacterCustomization {
	if (!raw || typeof raw !== 'object') {
		return DEFAULT_CHARACTER_CUSTOMIZATION;
	}
	const r = raw as Record<string, unknown>;
	const bodyColor = typeof r.bodyColor === 'string' && HEX_COLOR_RE.test(r.bodyColor) ? r.bodyColor : DEFAULT_CHARACTER_CUSTOMIZATION.bodyColor;
	const bodyShape = typeof r.bodyShape === 'string' && SHAPE_VALUES.has(r.bodyShape) ? r.bodyShape as CharacterBodyShape : DEFAULT_CHARACTER_CUSTOMIZATION.bodyShape;
	const hat = typeof r.hat === 'string' && HAT_VALUES.has(r.hat) ? r.hat as CharacterHat : DEFAULT_CHARACTER_CUSTOMIZATION.hat;
	const eyes = typeof r.eyes === 'string' && EYES_VALUES.has(r.eyes) ? r.eyes as CharacterEyes : DEFAULT_CHARACTER_CUSTOMIZATION.eyes;
	const accessory = typeof r.accessory === 'string' && ACCESSORY_VALUES.has(r.accessory) ? r.accessory as CharacterAccessory : DEFAULT_CHARACTER_CUSTOMIZATION.accessory;
	let name = typeof r.name === 'string' ? r.name.trim() : DEFAULT_CHARACTER_CUSTOMIZATION.name;
	if (name.length === 0) {
		name = DEFAULT_CHARACTER_CUSTOMIZATION.name;
	} else if (name.length > CHARACTER_NAME_MAX_LENGTH) {
		name = name.slice(0, CHARACTER_NAME_MAX_LENGTH);
	}
	return { bodyColor, bodyShape, hat, eyes, accessory, name };
}
