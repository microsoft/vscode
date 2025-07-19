/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Size } from '../../../base/common/size.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IJSONSchema, IJSONSchemaSnippet } from '../../../base/common/jsonSchema.js';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from '../../jsonschemas/common/jsonContributionRegistry.js';
import * as platform from '../../registry/common/platform.js';
import { ISizeTheme } from './themeService.js';
import * as nls from '../../../nls.js';
import { Disposable } from '../../../base/common/lifecycle.js';

//  ------ API types

export type SizeIdentifier = string;

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
 * @sample `button.horizontal.padding` is `--vscode-button-horizontal-padding`.
 */
export function sizeAsCssVariableName(sizeIdent: SizeIdentifier): string {
	return `--vscode-${sizeIdent.replace(/\./g, '-')}`;
}

export function sizeAsCssVariable(size: SizeIdentifier): string {
	return `var(${sizeAsCssVariableName(size)})`;
}

export function sizeAsCssVariableWithDefault(size: SizeIdentifier, defaultCssValue: string): string {
	return `var(${sizeAsCssVariableName(size)}, ${defaultCssValue})`;
}


export interface SizeDefaults {
	default: SizeValue | null;
}

export function isSizeDefaults(value: unknown): value is SizeDefaults {
	return value !== null && typeof value === 'object' && 'default' in value;
}

/**
 * A Size Value is either a size literal, a reference to an other size or a derived size
 */
export type SizeValue = string | SizeIdentifier;

// color registry
export const SizeExtensions = {
	SizeContribution: 'base.contributions.sizes'
};

export const DEFAULT_SIZE_CONFIG_VALUE = 'default';

export interface ISizeRegistry {

	readonly onDidChangeSchema: Event<void>;

	/**
	 * Register a size to the registry.
	 * @param id The size id as used in theme description files
	 * @param defaults The default values
	 * @description the description
	 */
	registerSize(id: string, defaults: SizeDefaults | SizeValue | null, description: string): SizeIdentifier;

	/**
	 * Register a size to the registry.
	 */
	deregisterSize(id: string): void;

	/**
	 * Get all size contributions
	 */
	getSizes(): SizeContribution[];

	/**
	 * Gets the default size of the given id
	 */
	resolveDefaultSize(id: SizeIdentifier, theme: ISizeTheme): Size | undefined;

	/**
	 * JSON schema for an object to assign size values to one of the size contributions.
	 */
	getSizeSchema(): IJSONSchema;

	/**
	 * JSON schema to for a reference to a size contribution.
	 */
	getSizeReferenceSchema(): IJSONSchema;

	/**
	 * Notify when the size theme or settings change.
	 */
	notifyThemeUpdate(theme: ISizeTheme): void;

}

type IJSONSchemaForSizes = IJSONSchema & { properties: { [name: string]: { oneOf: [IJSONSchemaWithSnippets, IJSONSchema] } } };
type IJSONSchemaWithSnippets = IJSONSchema & { defaultSnippets: IJSONSchemaSnippet[] };

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

	public notifyThemeUpdate(sizeThemeData: ISizeTheme) {
		for (const key of Object.keys(this.sizesById)) {
			const size = sizeThemeData.getSize(key);
			if (size) {
				this.sizeSchema.properties[key].oneOf[0].defaultSnippets[0].body = `\${1:${size}}`;
			}
		}
		this._onDidChangeSchema.fire();
	}

	public registerSize(id: string, defaults: SizeDefaults | SizeValue | null, description: string, deprecationMessage?: string): SizeIdentifier {
		const sizeContribution: SizeContribution = { id, description, defaults, deprecationMessage };
		this.sizesById[id] = sizeContribution;
		const propertySchema: IJSONSchemaWithSnippets = { type: 'string', format: 'size', defaultSnippets: [{ body: '${1:16px}' }] };
		if (deprecationMessage) {
			propertySchema.deprecationMessage = deprecationMessage;
		}


		this.sizeSchema.properties[id] = {
			description,
			oneOf: [
				propertySchema,
				{ type: 'string', const: DEFAULT_SIZE_CONFIG_VALUE, description: nls.localize('useDefault', 'Use the default size.') }
			]
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

	public resolveDefaultSize(id: SizeIdentifier, theme: ISizeTheme): Size | undefined {
		const sizeDesc = this.sizesById[id];
		if (sizeDesc?.defaults) {
			const sizeValue = isSizeDefaults(sizeDesc.defaults) ? sizeDesc.defaults.default : sizeDesc.defaults;
			return resolveSizeValue(sizeValue, theme);
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
platform.Registry.add(SizeExtensions.SizeContribution, sizeRegistry);


export function registerSize(id: string, defaults: SizeDefaults | SizeValue | null, description: string, deprecationMessage?: string): SizeIdentifier {
	return sizeRegistry.registerSize(id, defaults, description, deprecationMessage);
}

export function getSizeRegistry(): ISizeRegistry {
	return sizeRegistry;
}

// ----- implementation

/**
 * @param sizeValue Resolve a size value in the context of a theme
 */
export function resolveSizeValue(sizeValue: SizeValue | null, theme: ISizeTheme): Size | undefined {
	if (sizeValue === null) {
		return undefined;
	} else if (typeof sizeValue === 'string') {
		// If it's a CSS size format (e.g., '16px')
		if (sizeValue.endsWith('px')) {
			const pixelValue = parseInt(sizeValue.replace('px', ''), 10);
			if (!isNaN(pixelValue)) {
				return new Size(pixelValue, pixelValue);
			}
		}
		// Handle width x height format (e.g., '16x24')
		else if (sizeValue.includes('x')) {
			const [widthStr, heightStr] = sizeValue.split('x');
			const width = parseInt(widthStr, 10);
			const height = parseInt(heightStr, 10);
			if (!isNaN(width) && !isNaN(height)) {
				return new Size(width, height);
			}
		}
		// If it's a reference to another size identifier
		const referencedSize = theme.getSize(sizeValue);
		if (referencedSize) {
			return referencedSize;
		}
	}
	return undefined;
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
