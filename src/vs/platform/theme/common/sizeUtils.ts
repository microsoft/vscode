/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { IJSONSchema } from '../../../base/common/jsonSchema.js';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from '../../jsonschemas/common/jsonContributionRegistry.js';
import * as platform from '../../registry/common/platform.js';
import { IColorTheme } from './themeService.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../base/common/async.js';

//  ------ API types

export type SizeIdentifier = string;

/**
 * Size value unit types supported by the registry
 */
export type SizeUnit = 'px' | 'rem' | 'em' | '%';

/**
 * A size value with a numeric amount and unit
 */
export interface SizeValue {
	readonly value: number;
	readonly unit: SizeUnit;
}

export interface SizeContribution {
	readonly id: SizeIdentifier;
	readonly description: string;
	readonly defaults: SizeDefaults | SizeValue | null;
	readonly deprecationMessage: string | undefined;
}

/**
 * Returns the css variable name for the given size identifier. Dots (`.`) are replaced with hyphens (`-`) and
 * everything is prefixed with `--vscode-`.
 *
 * @sample `editor.fontSize` is `--vscode-editor-fontSize`.
 */
export function asCssVariableName(sizeIdent: SizeIdentifier): string {
	return `--vscode-${sizeIdent.replace(/\./g, '-')}`;
}

export function asCssVariable(size: SizeIdentifier): string {
	return `var(${asCssVariableName(size)})`;
}

export function asCssVariableWithDefault(size: SizeIdentifier, defaultCssValue: string): string {
	return `var(${asCssVariableName(size)}, ${defaultCssValue})`;
}

export interface SizeDefaults {
	light: SizeValue | null;
	dark: SizeValue | null;
	hcDark: SizeValue | null;
	hcLight: SizeValue | null;
}

export function isSizeDefaults(value: unknown): value is SizeDefaults {
	return value !== null && typeof value === 'object' && 'light' in value && 'dark' in value;
}

/**
 * Helper function to create a size value
 */
export function size(value: number, unit: SizeUnit = 'px'): SizeValue {
	return { value, unit };
}

/**
 * Helper function to create size defaults that use the same value for all themes
 */
export function sizeForAllThemes(value: number, unit: SizeUnit = 'px'): SizeDefaults {
	const sizeValue = size(value, unit);
	return {
		light: sizeValue,
		dark: sizeValue,
		hcDark: sizeValue,
		hcLight: sizeValue
	};
}

/**
 * Convert a size value to a CSS string
 */
export function sizeValueToCss(sizeValue: SizeValue): string {
	return `${sizeValue.value}${sizeValue.unit}`;
}

// size registry
export const Extensions = {
	SizeContribution: 'base.contributions.sizes'
};

export const DEFAULT_SIZE_CONFIG_VALUE = 'default';

export interface ISizeRegistry {

	readonly onDidChangeSchema: Event<void>;

	/**
	 * Register a size to the registry.
	 * @param id The size id as used in theme description files
	 * @param defaults The default values
	 * @param description the description
	 */
	registerSize(id: string, defaults: SizeDefaults | SizeValue | null, description: string): SizeIdentifier;

	/**
	 * Deregister a size from the registry.
	 */
	deregisterSize(id: string): void;

	/**
	 * Get all size contributions
	 */
	getSizes(): SizeContribution[];

	/**
	 * Gets the default size of the given id
	 */
	resolveDefaultSize(id: SizeIdentifier, theme: IColorTheme): SizeValue | undefined;

	/**
	 * JSON schema for an object to assign size values to one of the size contributions.
	 */
	getSizeSchema(): IJSONSchema;

	/**
	 * JSON schema for a reference to a size contribution.
	 */
	getSizeReferenceSchema(): IJSONSchema;

	/**
	 * Notify when the color theme or settings change.
	 */
	notifyThemeUpdate(theme: IColorTheme): void;

}

type IJSONSchemaForSizes = IJSONSchema & { properties: { [name: string]: IJSONSchema } };

class SizeRegistry extends Disposable implements ISizeRegistry {

	private readonly _onDidChangeSchema = this._register(new Emitter<void>());
	readonly onDidChangeSchema: Event<void> = this._onDidChangeSchema.event;

	private sizesById: { [key: string]: SizeContribution };
	private sizeSchema: IJSONSchemaForSizes = { type: 'object', properties: {} };
	private sizeReferenceSchema: IJSONSchema & { enum: string[]; enumDescriptions: string[] } = { type: 'string', enum: [], enumDescriptions: [] };

	constructor() {
		super();
		this.sizesById = {};
	}

	public notifyThemeUpdate(theme: IColorTheme) {
		for (const key of Object.keys(this.sizesById)) {
			const sizeVal = this.resolveDefaultSize(key, theme);
			if (sizeVal) {
				this.sizeSchema.properties[key].default = sizeValueToCss(sizeVal);
			}
		}
		this._onDidChangeSchema.fire();
	}

	public registerSize(id: string, defaults: SizeDefaults | SizeValue | null, description: string, deprecationMessage?: string): SizeIdentifier {
		const sizeContribution: SizeContribution = { id, description, defaults, deprecationMessage };
		this.sizesById[id] = sizeContribution;

		const propertySchema: IJSONSchema = {
			type: 'string',
			pattern: '^(\\d+(\\.\\d+)?(px|rem|em|%))|default$',
			patternErrorMessage: 'Size must be a number followed by px, rem, em, or % (e.g., "12px", "1.5rem") or "default"'
		};

		if (deprecationMessage) {
			propertySchema.deprecationMessage = deprecationMessage;
		}

		this.sizeSchema.properties[id] = {
			description,
			...propertySchema
		};

		this.sizeReferenceSchema.enum.push(id);
		this.sizeReferenceSchema.enumDescriptions.push(description);

		this._onDidChangeSchema.fire();
		return id;
	}

	public deregisterSize(id: string): void {
		delete this.sizesById[id];
		delete this.sizeSchema.properties[id];
		const index = this.sizeReferenceSchema.enum.indexOf(id);
		if (index !== -1) {
			this.sizeReferenceSchema.enum.splice(index, 1);
			this.sizeReferenceSchema.enumDescriptions.splice(index, 1);
		}
		this._onDidChangeSchema.fire();
	}

	public getSizes(): SizeContribution[] {
		return Object.keys(this.sizesById).map(id => this.sizesById[id]);
	}

	public resolveDefaultSize(id: SizeIdentifier, theme: IColorTheme): SizeValue | undefined {
		const sizeDesc = this.sizesById[id];
		if (sizeDesc?.defaults) {
			const sizeValue = isSizeDefaults(sizeDesc.defaults) ? sizeDesc.defaults[theme.type] : sizeDesc.defaults;
			return sizeValue ?? undefined;
		}
		return undefined;
	}

	public getSizeSchema(): IJSONSchema {
		return this.sizeSchema;
	}

	public getSizeReferenceSchema(): IJSONSchema {
		return this.sizeReferenceSchema;
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

		return Object.keys(this.sizesById).sort(sorter).map(k => `- \`${k}\`: ${this.sizesById[k].description}`).join('\n');
	}

}

const sizeRegistry = new SizeRegistry();
platform.Registry.add(Extensions.SizeContribution, sizeRegistry);

export function registerSize(id: string, defaults: SizeDefaults | SizeValue | null, description: string, deprecationMessage?: string): SizeIdentifier {
	return sizeRegistry.registerSize(id, defaults, description, deprecationMessage);
}

export function getSizeRegistry(): ISizeRegistry {
	return sizeRegistry;
}

export const workbenchSizesSchemaId = 'vscode://schemas/workbench-sizes';

const schemaRegistry = platform.Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
schemaRegistry.registerSchema(workbenchSizesSchemaId, sizeRegistry.getSizeSchema());

const delayer = new RunOnceScheduler(() => schemaRegistry.notifySchemaChanged(workbenchSizesSchemaId), 200);

sizeRegistry.onDidChangeSchema(() => {
	if (!delayer.isScheduled()) {
		delayer.schedule();
	}
});
