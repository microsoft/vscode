/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../../base/common/jsonSchema.js';
import { isObject } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { INamedLayoutDefinition, INamedLayoutEditorDefinition, INamedLayoutEditorGroupDefinition, INamedLayoutPanelDefinition, INamedLayoutPartDefinition, INamedLayoutSecondarySideBarDefinition, INamedLayoutViewContainerDefinition, INamedLayoutViewDefinition } from '../../../services/namedLayouts/common/namedLayouts.js';

/**
 * The setting that `sideBar.position` of a layout contribution maps to.
 */
export const SIDE_BAR_LOCATION_SETTING = 'workbench.sideBar.location';

const VIEW_CONTAINER_LOCATIONS = ['sideBar', 'panel', 'secondarySideBar'] as const;
const PANEL_POSITIONS = ['bottom', 'top', 'left', 'right'] as const;
const PANEL_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;
const SIDE_BAR_POSITIONS = ['left', 'right'] as const;
const EDITOR_ORIENTATIONS = ['horizontal', 'vertical'] as const;

const sizeSchema: IJSONSchema = {
	type: 'number',
	exclusiveMinimum: 0,
	exclusiveMaximum: 1,
	markdownDescription: localize('layouts.size', "The size as a fraction of the size of the window, for example `0.25`. Side bars and a panel on the left or right use the width of the window, a panel at the bottom or top uses its height.")
};

const partProperties: IJSONSchemaMap = {
	visible: { type: 'boolean', description: localize('layouts.visible', "Whether the part is visible.") },
	size: sizeSchema,
	activeViewContainer: { type: 'string', description: localize('layouts.activeViewContainer', "The identifier of the view container to open in the part.") }
};

/**
 * The schema of an editor group. Recursion is limited because the schema is embedded
 * into the schema of the extension manifest, where references cannot be resolved.
 */
function getEditorGroupSchema(depth: number): IJSONSchema {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			size: { type: 'number', exclusiveMinimum: 0, description: localize('layouts.editor.group.size', "The size of the group relative to the other groups of the same level.") },
			groups: {
				type: 'array',
				minItems: 1,
				description: localize('layouts.editor.group.groups', "Splits the group into groups arranged in the other orientation."),
				items: depth > 0 ? getEditorGroupSchema(depth - 1) : { type: 'object' }
			}
		}
	};
}

/**
 * The JSON schema of a layout of the `layouts` contribution point.
 */
export const namedLayoutContributionSchema: IJSONSchema = {
	type: 'object',
	required: ['id', 'label'],
	additionalProperties: false,
	defaultSnippets: [{ body: { id: '${1:id}', label: '${2:label}' } }],
	properties: {
		id: { type: 'string', description: localize('layouts.id', "The identifier of the layout. It must be unique within the layouts of the extension.") },
		label: { type: 'string', description: localize('layouts.label', "The human readable name of the layout.") },
		locked: { type: 'boolean', description: localize('layouts.locked', "Whether the layout is locked. Users can rearrange a locked layout, but the changes are not saved and can be reverted. Switching to the layout always applies its definition. Users cannot unlock it.") },
		settings: {
			type: 'object',
			markdownDescription: localize('layouts.settings', "Values of settings that the layout defines. Only layout related settings such as `#workbench.editor.showTabs#` are supported, other settings are ignored.")
		},
		sideBar: {
			type: 'object',
			additionalProperties: false,
			description: localize('layouts.sideBar', "The primary side bar."),
			properties: {
				...partProperties,
				position: { type: 'string', enum: [...SIDE_BAR_POSITIONS], markdownDescription: localize('layouts.sideBar.position', "The position of the primary side bar. Sets `#workbench.sideBar.location#`.") }
			}
		},
		panel: {
			type: 'object',
			additionalProperties: false,
			description: localize('layouts.panel', "The panel."),
			properties: {
				...partProperties,
				position: { type: 'string', enum: [...PANEL_POSITIONS], description: localize('layouts.panel.position', "The position of the panel.") },
				alignment: { type: 'string', enum: [...PANEL_ALIGNMENTS], description: localize('layouts.panel.alignment', "The alignment of a panel at the bottom or top.") },
				maximized: { type: 'boolean', description: localize('layouts.panel.maximized', "Whether the panel is maximized.") }
			}
		},
		secondarySideBar: {
			type: 'object',
			additionalProperties: false,
			description: localize('layouts.secondarySideBar', "The secondary side bar."),
			properties: {
				...partProperties,
				maximized: { type: 'boolean', description: localize('layouts.secondarySideBar.maximized', "Whether the secondary side bar is maximized.") }
			}
		},
		viewContainers: {
			type: 'object',
			description: localize('layouts.viewContainers', "View containers by identifier. Unknown view containers are ignored."),
			additionalProperties: {
				type: 'object',
				additionalProperties: false,
				properties: {
					location: { type: 'string', enum: [...VIEW_CONTAINER_LOCATIONS], description: localize('layouts.viewContainer.location', "The location of the view container.") },
					visible: { type: 'boolean', description: localize('layouts.viewContainer.visible', "Whether the view container is shown in the bar of its location.") },
					order: { type: 'number', description: localize('layouts.viewContainer.order', "View containers with an order are placed first in the bar of their location, in ascending order.") }
				}
			}
		},
		views: {
			type: 'object',
			description: localize('layouts.views', "Views by identifier. Unknown views are ignored."),
			additionalProperties: {
				type: 'object',
				additionalProperties: false,
				properties: {
					visible: { type: 'boolean', description: localize('layouts.view.visible', "Whether the view is visible in its view container.") },
					order: { type: 'number', description: localize('layouts.view.order', "Views with an order are placed first in their view container, in ascending order.") }
				}
			}
		},
		editor: {
			type: 'object',
			additionalProperties: false,
			description: localize('layouts.editor', "The editor area."),
			properties: {
				orientation: { type: 'string', enum: [...EDITOR_ORIENTATIONS], markdownDescription: localize('layouts.editor.orientation', "Whether the editor groups are arranged side by side (`horizontal`) or on top of each other (`vertical`).") },
				groups: { type: 'array', minItems: 1, description: localize('layouts.editor.groups', "The editor groups. Open editors are kept, if there are fewer groups they are moved into the remaining groups."), items: getEditorGroupSchema(2) },
				centered: { type: 'boolean', description: localize('layouts.editor.centered', "Whether the editor layout is centered.") }
			}
		}
	}
};

/**
 * Validates and converts a layout of the `layouts` contribution point. Invalid values
 * are dropped and reported as problems, so that the rest of the layout applies.
 */
class NamedLayoutDefinitionParser {

	readonly problems: string[] = [];

	constructor(private readonly isLayoutOverridableSetting: (key: string) => boolean) { }

	parse(value: IStringDictionary<unknown>): INamedLayoutDefinition {
		const settings = this.parseSettings(value.settings);
		const sideBar = this.parseObject(value.sideBar, 'sideBar');
		const sideBarPosition = sideBar && this.parseEnum(sideBar.position, 'sideBar.position', SIDE_BAR_POSITIONS);
		if (sideBarPosition) {
			settings[SIDE_BAR_LOCATION_SETTING] = sideBarPosition;
		}

		return withoutUndefined<INamedLayoutDefinition>({
			settings: Object.keys(settings).length ? settings : undefined,
			sideBar: sideBar && this.parsePart(sideBar, 'sideBar'),
			panel: this.parsePanel(value.panel),
			secondarySideBar: this.parseSecondarySideBar(value.secondarySideBar),
			viewContainers: this.parseViewContainers(value.viewContainers),
			views: this.parseViews(value.views),
			editor: this.parseEditor(value.editor)
		});
	}

	private parseSettings(value: unknown): IStringDictionary<unknown> {
		const settings: IStringDictionary<unknown> = {};
		for (const [key, settingValue] of Object.entries(this.parseObject(value, 'settings') ?? {})) {
			if (this.isLayoutOverridableSetting(key)) {
				settings[key] = settingValue;
			} else {
				this.problems.push(localize('layouts.unsupportedSetting', "The setting '{0}' is ignored, a layout can only define layout related settings.", key));
			}
		}
		return settings;
	}

	private parsePart(value: IStringDictionary<unknown>, path: string): INamedLayoutPartDefinition {
		return withoutUndefined<INamedLayoutPartDefinition>({
			visible: this.parseBoolean(value.visible, `${path}.visible`),
			size: this.parseFraction(value.size, `${path}.size`),
			activeViewContainer: this.parseString(value.activeViewContainer, `${path}.activeViewContainer`)
		});
	}

	private parsePanel(value: unknown): INamedLayoutPanelDefinition | undefined {
		const panel = this.parseObject(value, 'panel');
		return panel && withoutUndefined<INamedLayoutPanelDefinition>({
			...this.parsePart(panel, 'panel'),
			position: this.parseEnum(panel.position, 'panel.position', PANEL_POSITIONS),
			alignment: this.parseEnum(panel.alignment, 'panel.alignment', PANEL_ALIGNMENTS),
			maximized: this.parseBoolean(panel.maximized, 'panel.maximized')
		});
	}

	private parseSecondarySideBar(value: unknown): INamedLayoutSecondarySideBarDefinition | undefined {
		const secondarySideBar = this.parseObject(value, 'secondarySideBar');
		return secondarySideBar && withoutUndefined<INamedLayoutSecondarySideBarDefinition>({
			...this.parsePart(secondarySideBar, 'secondarySideBar'),
			maximized: this.parseBoolean(secondarySideBar.maximized, 'secondarySideBar.maximized')
		});
	}

	private parseViewContainers(value: unknown): IStringDictionary<INamedLayoutViewContainerDefinition> | undefined {
		return this.parseDictionary(value, 'viewContainers', (viewContainer, path) => withoutUndefined<INamedLayoutViewContainerDefinition>({
			location: this.parseEnum(viewContainer.location, `${path}.location`, VIEW_CONTAINER_LOCATIONS),
			visible: this.parseBoolean(viewContainer.visible, `${path}.visible`),
			order: this.parseNumber(viewContainer.order, `${path}.order`)
		}));
	}

	private parseViews(value: unknown): IStringDictionary<INamedLayoutViewDefinition> | undefined {
		return this.parseDictionary(value, 'views', (view, path) => withoutUndefined<INamedLayoutViewDefinition>({
			visible: this.parseBoolean(view.visible, `${path}.visible`),
			order: this.parseNumber(view.order, `${path}.order`)
		}));
	}

	private parseEditor(value: unknown): INamedLayoutEditorDefinition | undefined {
		const editor = this.parseObject(value, 'editor');
		return editor && withoutUndefined<INamedLayoutEditorDefinition>({
			orientation: this.parseEnum(editor.orientation, 'editor.orientation', EDITOR_ORIENTATIONS),
			groups: this.parseEditorGroups(editor.groups, 'editor.groups'),
			centered: this.parseBoolean(editor.centered, 'editor.centered')
		});
	}

	private parseEditorGroups(value: unknown, path: string): INamedLayoutEditorGroupDefinition[] | undefined {
		if (value === undefined) {
			return undefined;
		}
		if (!Array.isArray(value) || !value.length) {
			return this.invalidValue(path);
		}

		const groups: INamedLayoutEditorGroupDefinition[] = [];
		for (let index = 0; index < value.length; index++) {
			const groupPath = `${path}[${index}]`;
			const group = this.parseObject(value[index], groupPath);
			if (!group) {
				return undefined; // an incomplete list of groups would change the arrangement
			}

			const size = this.parseNumber(group.size, `${groupPath}.size`);
			groups.push(withoutUndefined<INamedLayoutEditorGroupDefinition>({
				size: size === undefined || size > 0 ? size : this.invalidValue(`${groupPath}.size`),
				groups: this.parseEditorGroups(group.groups, `${groupPath}.groups`)
			}));
		}
		return groups;
	}

	private parseDictionary<T extends object>(value: unknown, path: string, parseEntry: (entry: IStringDictionary<unknown>, path: string) => T): IStringDictionary<T> | undefined {
		const dictionary = this.parseObject(value, path);
		if (!dictionary) {
			return undefined;
		}

		const result: IStringDictionary<T> = {};
		for (const [key, entryValue] of Object.entries(dictionary)) {
			const entry = this.parseObject(entryValue, `${path}.${key}`);
			if (entry) {
				result[key] = parseEntry(entry, `${path}.${key}`);
			}
		}
		return Object.keys(result).length ? result : undefined;
	}

	private parseObject(value: unknown, path: string): IStringDictionary<unknown> | undefined {
		if (value === undefined) {
			return undefined;
		}
		return isObject(value) ? value as IStringDictionary<unknown> : this.invalidValue(path);
	}

	private parseBoolean(value: unknown, path: string): boolean | undefined {
		return value === undefined || typeof value === 'boolean' ? value : this.invalidValue(path);
	}

	private parseString(value: unknown, path: string): string | undefined {
		return value === undefined || typeof value === 'string' ? value : this.invalidValue(path);
	}

	private parseNumber(value: unknown, path: string): number | undefined {
		return value === undefined || (typeof value === 'number' && Number.isFinite(value)) ? value : this.invalidValue(path);
	}

	private parseFraction(value: unknown, path: string): number | undefined {
		return value === undefined || (typeof value === 'number' && value > 0 && value < 1) ? value : this.invalidValue(path);
	}

	private parseEnum<T extends string>(value: unknown, path: string, values: readonly T[]): T | undefined {
		return value === undefined || values.includes(value as T) ? value as T | undefined : this.invalidValue(path);
	}

	private invalidValue(path: string): undefined {
		this.problems.push(localize('layouts.invalidValue', "The value of '{0}' is invalid and ignored.", path));
		return undefined;
	}
}

function withoutUndefined<T extends object>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)) as T;
}

/**
 * Validates and converts a layout of the `layouts` contribution point. Invalid values
 * and settings that layouts cannot define are dropped and returned as problems.
 * `sideBar.position` is converted into the setting {@link SIDE_BAR_LOCATION_SETTING}.
 */
export function parseNamedLayoutDefinition(value: IStringDictionary<unknown>, isLayoutOverridableSetting: (key: string) => boolean): { readonly definition: INamedLayoutDefinition; readonly problems: readonly string[] } {
	const parser = new NamedLayoutDefinitionParser(isLayoutOverridableSetting);
	const definition = parser.parse(value);
	return { definition, problems: parser.problems };
}
