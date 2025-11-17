/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../base/common/assert.js';
import { RunOnceScheduler } from '../../../base/common/async.js';
import { Color } from '../../../base/common/color.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IJSONSchema, IJSONSchemaSnippet } from '../../../base/common/jsonSchema.js';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from '../../jsonschemas/common/jsonContributionRegistry.js';
import * as platform from '../../registry/common/platform.js';
import { IColorTheme } from './themeService.js';
import * as nls from '../../../nls.js';
import { Disposable } from '../../../base/common/lifecycle.js';

//  ------ API types

export type ColorIdentifier = string;

export interface ColorContribution {
	readonly id: ColorIdentifier;
	readonly description: string;
	readonly defaults: ColorDefaults | ColorValue | null;
	readonly needsTransparency: boolean;
	readonly deprecationMessage: string | undefined;
}

/**
 * Returns the css variable name for the given color identifier. Dots (`.`) are replaced with hyphens (`-`) and
 * everything is prefixed with `--vscode-`.
 *
 * @sample `editorSuggestWidget.background` is `--vscode-editorSuggestWidget-background`.
 */
export function asCssVariableName(colorIdent: ColorIdentifier): string {
	return `--vscode-${colorIdent.replace(/\./g, '-')}`;
}

export function asCssVariable(color: ColorIdentifier): string {
	return `var(${asCssVariableName(color)})`;
}

export function asCssVariableWithDefault(color: ColorIdentifier, defaultCssValue: string): string {
	return `var(${asCssVariableName(color)}, ${defaultCssValue})`;
}

export const enum ColorTransformType {
	Darken,
	Lighten,
	Transparent,
	Opaque,
	OneOf,
	LessProminent,
	IfDefinedThenElse,
	Mix,
}

export type ColorTransform =
	| { op: ColorTransformType.Darken; value: ColorValue; factor: number }
	| { op: ColorTransformType.Lighten; value: ColorValue; factor: number }
	| { op: ColorTransformType.Transparent; value: ColorValue; factor: number }
	| { op: ColorTransformType.Opaque; value: ColorValue; background: ColorValue }
	| { op: ColorTransformType.OneOf; values: readonly ColorValue[] }
	| { op: ColorTransformType.LessProminent; value: ColorValue; background: ColorValue; factor: number; transparency: number }
	| { op: ColorTransformType.IfDefinedThenElse; if: ColorIdentifier; then: ColorValue; else: ColorValue }
	| { op: ColorTransformType.Mix; color: ColorValue; with: ColorValue; ratio?: number };

export interface ColorDefaults {
	light: ColorValue | null;
	dark: ColorValue | null;
	hcDark: ColorValue | null;
	hcLight: ColorValue | null;
}

export function isColorDefaults(value: unknown): value is ColorDefaults {
	return value !== null && typeof value === 'object' && 'light' in value && 'dark' in value;
}

/**
 * A Color Value is either a color literal, a reference to an other color or a derived color
 */
export type ColorValue = Color | string | ColorIdentifier | ColorTransform;

// color registry
export const Extensions = {
	ColorContribution: 'base.contributions.colors'
};

export const DEFAULT_COLOR_CONFIG_VALUE = 'default';

export interface IColorRegistry {

	readonly onDidChangeSchema: Event<void>;

	/**
	 * Register a color to the registry.
	 * @param id The color id as used in theme description files
	 * @param defaults The default values
	 * @param needsTransparency Whether the color requires transparency
	 * @description the description
	 */
	registerColor(id: string, defaults: ColorDefaults, description: string, needsTransparency?: boolean): ColorIdentifier;

	/**
	 * Register a color to the registry.
	 */
	deregisterColor(id: string): void;

	/**
	 * Get all color contributions
	 */
	getColors(): ColorContribution[];

	/**
	 * Gets the default color of the given id
	 */
	resolveDefaultColor(id: ColorIdentifier, theme: IColorTheme): Color | undefined;

	/**
	 * JSON schema for an object to assign color values to one of the color contributions.
	 */
	getColorSchema(): IJSONSchema;

	/**
	 * JSON schema to for a reference to a color contribution.
	 */
	getColorReferenceSchema(): IJSONSchema;

	/**
	 * Notify when the color theme or settings change.
	 */
	notifyThemeUpdate(theme: IColorTheme): void;

}

type IJSONSchemaForColors = IJSONSchema & { properties: { [name: string]: { oneOf: [IJSONSchemaWithSnippets, IJSONSchema] } } };
type IJSONSchemaWithSnippets = IJSONSchema & { defaultSnippets: IJSONSchemaSnippet[] };

class ColorRegistry extends Disposable implements IColorRegistry {

	private readonly _onDidChangeSchema = this._register(new Emitter<void>());
	readonly onDidChangeSchema: Event<void> = this._onDidChangeSchema.event;

	private colorsById: { [key: string]: ColorContribution };
	private colorSchema: IJSONSchemaForColors = { type: 'object', properties: {} };
	private colorReferenceSchema: IJSONSchema & { enum: string[]; enumDescriptions: string[] } = { type: 'string', enum: [], enumDescriptions: [] };

	constructor() {
		super();
		this.colorsById = {};
	}

	public notifyThemeUpdate(colorThemeData: IColorTheme) {
		for (const key of Object.keys(this.colorsById)) {
			const color = colorThemeData.getColor(key);
			if (color) {
				this.colorSchema.properties[key].oneOf[0].defaultSnippets[0].body = `\${1:${Color.Format.CSS.formatHexA(color, true)}}`;
			}
		}
		this._onDidChangeSchema.fire();
	}

	public registerColor(id: string, defaults: ColorDefaults | ColorValue | null, description: string, needsTransparency = false, deprecationMessage?: string): ColorIdentifier {
		const colorContribution: ColorContribution = { id, description, defaults, needsTransparency, deprecationMessage };
		this.colorsById[id] = colorContribution;
		const propertySchema: IJSONSchemaWithSnippets = { type: 'string', format: 'color-hex', defaultSnippets: [{ body: '${1:#ff0000}' }] };
		if (deprecationMessage) {
			propertySchema.deprecationMessage = deprecationMessage;
		}
		if (needsTransparency) {
			propertySchema.pattern = '^#(?:(?<rgba>[0-9a-fA-f]{3}[0-9a-eA-E])|(?:[0-9a-fA-F]{6}(?:(?![fF]{2})(?:[0-9a-fA-F]{2}))))?$';
			propertySchema.patternErrorMessage = nls.localize('transparecyRequired', 'This color must be transparent or it will obscure content');
		}
		this.colorSchema.properties[id] = {
			description,
			oneOf: [
				propertySchema,
				{ type: 'string', const: DEFAULT_COLOR_CONFIG_VALUE, description: nls.localize('useDefault', 'Use the default color.') }
			]
		};
		this.colorReferenceSchema.enum.push(id);
		this.colorReferenceSchema.enumDescriptions.push(description);

		this._onDidChangeSchema.fire();
		return id;
	}


	public deregisterColor(id: string): void {
		delete this.colorsById[id];
		delete this.colorSchema.properties[id];
		const index = this.colorReferenceSchema.enum.indexOf(id);
		if (index !== -1) {
			this.colorReferenceSchema.enum.splice(index, 1);
			this.colorReferenceSchema.enumDescriptions.splice(index, 1);
		}
		this._onDidChangeSchema.fire();
	}

	public getColors(): ColorContribution[] {
		return Object.keys(this.colorsById).map(id => this.colorsById[id]);
	}

	public resolveDefaultColor(id: ColorIdentifier, theme: IColorTheme): Color | undefined {
		const colorDesc = this.colorsById[id];
		if (colorDesc?.defaults) {
			const colorValue = isColorDefaults(colorDesc.defaults) ? colorDesc.defaults[theme.type] : colorDesc.defaults;
			return resolveColorValue(colorValue, theme);
		}
		return undefined;
	}

	public getColorSchema(): IJSONSchema {
		return this.colorSchema;
	}

	public getColorReferenceSchema(): IJSONSchema {
		return this.colorReferenceSchema;
	}

	public override toString() {
		const sorter = (a: string, b: string) => {
			const cat1 = a.indexOf('.') === -1 ? 0 : 1;
			const cat2 = b.indexOf('.') === -1 ? 0 : 1;
			if (cat1 !== cat2) {
				return cat1 - cat2;
			}
			return a.localeCompare(b);
		};

		return Object.keys(this.colorsById).sort(sorter).map(k => `- \`${k}\`: ${this.colorsById[k].description}`).join('\n');
	}

}

const colorRegistry = new ColorRegistry();
platform.Registry.add(Extensions.ColorContribution, colorRegistry);


export function registerColor(id: string, defaults: ColorDefaults | ColorValue | null, description: string, needsTransparency?: boolean, deprecationMessage?: string): ColorIdentifier {
	return colorRegistry.registerColor(id, defaults, description, needsTransparency, deprecationMessage);
}

export function getColorRegistry(): IColorRegistry {
	return colorRegistry;
}

// ----- color functions

export function executeTransform(transform: ColorTransform, theme: IColorTheme): Color | undefined {
	switch (transform.op) {
		case ColorTransformType.Darken:
			return resolveColorValue(transform.value, theme)?.darken(transform.factor);

		case ColorTransformType.Lighten:
			return resolveColorValue(transform.value, theme)?.lighten(transform.factor);

		case ColorTransformType.Transparent:
			return resolveColorValue(transform.value, theme)?.transparent(transform.factor);

		case ColorTransformType.Mix: {
			const primaryColor = resolveColorValue(transform.color, theme) || Color.transparent;
			const otherColor = resolveColorValue(transform.with, theme) || Color.transparent;
			return primaryColor.mix(otherColor, transform.ratio);
		}

		case ColorTransformType.Opaque: {
			const backgroundColor = resolveColorValue(transform.background, theme);
			if (!backgroundColor) {
				return resolveColorValue(transform.value, theme);
			}
			return resolveColorValue(transform.value, theme)?.makeOpaque(backgroundColor);
		}

		case ColorTransformType.OneOf:
			for (const candidate of transform.values) {
				const color = resolveColorValue(candidate, theme);
				if (color) {
					return color;
				}
			}
			return undefined;

		case ColorTransformType.IfDefinedThenElse:
			return resolveColorValue(theme.defines(transform.if) ? transform.then : transform.else, theme);

		case ColorTransformType.LessProminent: {
			const from = resolveColorValue(transform.value, theme);
			if (!from) {
				return undefined;
			}

			const backgroundColor = resolveColorValue(transform.background, theme);
			if (!backgroundColor) {
				return from.transparent(transform.factor * transform.transparency);
			}

			return from.isDarkerThan(backgroundColor)
				? Color.getLighterColor(from, backgroundColor, transform.factor).transparent(transform.transparency)
				: Color.getDarkerColor(from, backgroundColor, transform.factor).transparent(transform.transparency);
		}
		default:
			throw assertNever(transform);
	}
}

export function darken(colorValue: ColorValue, factor: number): ColorTransform {
	return { op: ColorTransformType.Darken, value: colorValue, factor };
}

export function lighten(colorValue: ColorValue, factor: number): ColorTransform {
	return { op: ColorTransformType.Lighten, value: colorValue, factor };
}

export function transparent(colorValue: ColorValue, factor: number): ColorTransform {
	return { op: ColorTransformType.Transparent, value: colorValue, factor };
}

export function opaque(colorValue: ColorValue, background: ColorValue): ColorTransform {
	return { op: ColorTransformType.Opaque, value: colorValue, background };
}

export function oneOf(...colorValues: ColorValue[]): ColorTransform {
	return { op: ColorTransformType.OneOf, values: colorValues };
}

export function ifDefinedThenElse(ifArg: ColorIdentifier, thenArg: ColorValue, elseArg: ColorValue): ColorTransform {
	return { op: ColorTransformType.IfDefinedThenElse, if: ifArg, then: thenArg, else: elseArg };
}

export function lessProminent(colorValue: ColorValue, backgroundColorValue: ColorValue, factor: number, transparency: number): ColorTransform {
	return { op: ColorTransformType.LessProminent, value: colorValue, background: backgroundColorValue, factor, transparency };
}

// ----- implementation

/**
 * @param colorValue Resolve a color value in the context of a theme
 */
export function resolveColorValue(colorValue: ColorValue | null, theme: IColorTheme): Color | undefined {
	if (colorValue === null) {
		return undefined;
	} else if (typeof colorValue === 'string') {
		if (colorValue[0] === '#') {
			return Color.fromHex(colorValue);
		}
		return theme.getColor(colorValue);
	} else if (colorValue instanceof Color) {
		return colorValue;
	} else if (typeof colorValue === 'object') {
		return executeTransform(colorValue, theme);
	}
	return undefined;
}

export const workbenchColorsSchemaId = 'vscode://schemas/workbench-colors';

const schemaRegistry = platform.Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
schemaRegistry.registerSchema(workbenchColorsSchemaId, colorRegistry.getColorSchema());

const delayer = new RunOnceScheduler(() => schemaRegistry.notifySchemaChanged(workbenchColorsSchemaId), 200);

colorRegistry.onDidChangeSchema(() => {
	if (!delayer.isScheduled()) {
		delayer.schedule();
	}
});

// setTimeout(_ => console.log(colorRegistry.toString()), 5000);
