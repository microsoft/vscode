/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from 'vs/platform/registry/common/platform';
import { IJSONSchema, IJSONSchemaMap } from 'vs/base/common/jsonSchema';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { Event, Emitter } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { RunOnceScheduler } from 'vs/base/common/async';
import * as Codicons from 'vs/base/common/codicons';
import { URI } from 'vs/base/common/uri';

//  ------ API types

// icon registry
export const Extensions = {
	IconContribution: 'base.contributions.icons'
};

export type IconDefaults = ThemeIcon | IconDefinition;

export interface IconDefinition {
	fontId?: string;
	fontCharacter: string;
}

export interface IconContribution {
	id: string;
	description: string | undefined;
	deprecationMessage?: string;
	defaults: IconDefaults;
}

export interface IconFontContribution {
	id: string;
	definition: IconFontDefinition;
}

export interface IconFontDefinition {
	src: { location: URI, format: string; }[]
}

export interface IIconRegistry {

	readonly onDidChange: Event<void>;

	/**
	 * Register a icon to the registry.
	 * @param id The icon id
	 * @param defaults The default values
	 * @param description The description
	 */
	registerIcon(id: string, defaults: IconDefaults, description?: string): ThemeIcon;

	/**
	 * Deregister a icon from the registry.
	 */
	deregisterIcon(id: string): void;

	/**
	 * Get all icon contributions
	 */
	getIcons(): IconContribution[];

	/**
	 * Get the icon for the given id
	 */
	getIcon(id: string): IconContribution | undefined;

	/**
	 * JSON schema for an object to assign icon values to one of the icon contributions.
	 */
	getIconSchema(): IJSONSchema;

	/**
	 * JSON schema to for a reference to a icon contribution.
	 */
	getIconReferenceSchema(): IJSONSchema;

	/**
	 * Register a icon font to the registry.
	 * @param id The icon font id
	 * @param definition The iocn font definition
	 */
	registerIconFont(id: string, definition: IconFontDefinition): IconFontContribution;

	/**
	 * Deregister an icon font to the registry.
	 */
	deregisterIconFont(id: string): void;

	/**
	 * Get all icon font contributions
	 */
	getIconFonts(): IconFontContribution[];

	/**
	 * Get the icon font for the given id
	 */
	getIconFont(id: string): IconFontContribution | undefined;
}

class IconRegistry implements IIconRegistry {

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private iconsById: { [key: string]: IconContribution };
	private iconSchema: IJSONSchema & { properties: IJSONSchemaMap } = {
		definitions: {
			icons: {
				type: 'object',
				properties: {
					fontId: { type: 'string', description: localize('iconDefintion.fontId', 'The id of the font to use. If not set, the font that is defined first is used.') },
					fontCharacter: { type: 'string', description: localize('iconDefintion.fontCharacter', 'The font character associated with the icon definition.') }
				},
				additionalProperties: false,
				defaultSnippets: [{ body: { fontCharacter: '\\\\e030' } }]
			}
		},
		type: 'object',
		properties: {}
	};
	private iconReferenceSchema: IJSONSchema & { enum: string[], enumDescriptions: string[] } = { type: 'string', pattern: `^${Codicons.CSSIcon.iconNameExpression}$`, enum: [], enumDescriptions: [] };

	private iconFontsById: { [key: string]: IconFontContribution };

	constructor() {
		this.iconsById = {};
		this.iconFontsById = {};
	}

	public registerIcon(id: string, defaults: IconDefaults, description?: string, deprecationMessage?: string): ThemeIcon {
		const existing = this.iconsById[id];
		if (existing) {
			if (description && !existing.description) {
				existing.description = description;
				this.iconSchema.properties[id].markdownDescription = `${description} $(${id})`;
				const enumIndex = this.iconReferenceSchema.enum.indexOf(id);
				if (enumIndex !== -1) {
					this.iconReferenceSchema.enumDescriptions[enumIndex] = description;
				}
				this._onDidChange.fire();
			}
			return existing;
		}
		let iconContribution: IconContribution = { id, description, defaults, deprecationMessage };
		this.iconsById[id] = iconContribution;
		let propertySchema: IJSONSchema = { $ref: '#/definitions/icons' };
		if (deprecationMessage) {
			propertySchema.deprecationMessage = deprecationMessage;
		}
		if (description) {
			propertySchema.markdownDescription = `${description}: $(${id})`;
		}
		this.iconSchema.properties[id] = propertySchema;
		this.iconReferenceSchema.enum.push(id);
		this.iconReferenceSchema.enumDescriptions.push(description || '');

		this._onDidChange.fire();
		return { id };
	}


	public deregisterIcon(id: string): void {
		delete this.iconsById[id];
		delete this.iconSchema.properties[id];
		const index = this.iconReferenceSchema.enum.indexOf(id);
		if (index !== -1) {
			this.iconReferenceSchema.enum.splice(index, 1);
			this.iconReferenceSchema.enumDescriptions.splice(index, 1);
		}
		this._onDidChange.fire();
	}

	public getIcons(): IconContribution[] {
		return Object.keys(this.iconsById).map(id => this.iconsById[id]);
	}

	public getIcon(id: string): IconContribution | undefined {
		return this.iconsById[id];
	}

	public getIconSchema(): IJSONSchema {
		return this.iconSchema;
	}

	public getIconReferenceSchema(): IJSONSchema {
		return this.iconReferenceSchema;
	}

	public registerIconFont(id: string, definition: IconFontDefinition): IconFontContribution {
		const existing = this.iconFontsById[id];
		if (existing) {
			return existing;
		}
		let iconFontContribution: IconFontContribution = { id, definition };
		this.iconFontsById[id] = iconFontContribution;
		this._onDidChange.fire();
		return iconFontContribution;
	}

	public deregisterIconFont(id: string): void {
		delete this.iconFontsById[id];
	}

	public getIconFonts(): IconFontContribution[] {
		return Object.keys(this.iconFontsById).map(id => this.iconFontsById[id]);
	}

	public getIconFont(id: string): IconFontContribution | undefined {
		return this.iconFontsById[id];
	}

	public toString() {
		const sorter = (i1: IconContribution, i2: IconContribution) => {
			return i1.id.localeCompare(i2.id);
		};
		const classNames = (i: IconContribution) => {
			while (ThemeIcon.isThemeIcon(i.defaults)) {
				i = this.iconsById[i.defaults.id];
			}
			return `codicon codicon-${i ? i.id : ''}`;
		};

		let reference = [];

		reference.push(`| preview     | identifier                        | default codicon ID                | description`);
		reference.push(`| ----------- | --------------------------------- | --------------------------------- | --------------------------------- |`);
		const contributions = Object.keys(this.iconsById).map(key => this.iconsById[key]);

		for (const i of contributions.filter(i => !!i.description).sort(sorter)) {
			reference.push(`|<i class="${classNames(i)}"></i>|${i.id}|${ThemeIcon.isThemeIcon(i.defaults) ? i.defaults.id : i.id}|${i.description || ''}|`);
		}

		reference.push(`| preview     | identifier                        `);
		reference.push(`| ----------- | --------------------------------- |`);

		for (const i of contributions.filter(i => !ThemeIcon.isThemeIcon(i.defaults)).sort(sorter)) {
			reference.push(`|<i class="${classNames(i)}"></i>|${i.id}|`);

		}

		return reference.join('\n');
	}

}

const iconRegistry = new IconRegistry();
platform.Registry.add(Extensions.IconContribution, iconRegistry);

export function registerIcon(id: string, defaults: IconDefaults, description: string, deprecationMessage?: string): ThemeIcon {
	return iconRegistry.registerIcon(id, defaults, description, deprecationMessage);
}

export function getIconRegistry(): IIconRegistry {
	return iconRegistry;
}

function initialize() {
	for (const icon of Codicons.iconRegistry.all) {
		iconRegistry.registerIcon(icon.id, icon.definition, icon.description);
	}
	Codicons.iconRegistry.onDidRegister(icon => iconRegistry.registerIcon(icon.id, icon.definition, icon.description));
}
initialize();

export const iconsSchemaId = 'vscode://schemas/icons';

let schemaRegistry = platform.Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
schemaRegistry.registerSchema(iconsSchemaId, iconRegistry.getIconSchema());

const delayer = new RunOnceScheduler(() => schemaRegistry.notifySchemaChanged(iconsSchemaId), 200);
iconRegistry.onDidChange(() => {
	if (!delayer.isScheduled()) {
		delayer.schedule();
	}
});


//setTimeout(_ => console.log(iconRegistry.toString()), 5000);


// common icons

export const widgetClose = registerIcon('widget-close', Codicons.Codicon.close, localize('widgetClose', 'Icon for the close action in widgets.'));

export const gotoPreviousLocation = registerIcon('goto-previous-location', Codicons.Codicon.arrowUp, localize('previousChangeIcon', 'Icon for goto previous editor location.'));
export const gotoNextLocation = registerIcon('goto-next-location', Codicons.Codicon.arrowDown, localize('nextChangeIcon', 'Icon for goto next editor location.'));

export const syncing = ThemeIcon.modify(Codicons.Codicon.sync, 'spin');
