/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { posix } from 'vs/base/common/path';
import { basename } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEditorInput, IEditorInputWithOptions, IEditorInputWithOptionsAndGroup } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';

export const IEditorOverrideService = createDecorator<IEditorOverrideService>('editorOverrideService');

//#region Editor Associations

// Static values for editor contributions

export type EditorAssociation = {
	readonly viewType: string;
	readonly filenamePattern?: string;
};

export type EditorAssociations = readonly EditorAssociation[];

export const editorsAssociationsSettingId = 'workbench.editorAssociations';

export const DEFAULT_EDITOR_ASSOCIATION: IEditorType = {
	id: 'default',
	displayName: localize('promptOpenWith.defaultEditor.displayName', "Text Editor"),
	providerDisplayName: localize('builtinProviderDisplayName', "Built-in")
};

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

const editorAssociationsConfigurationNode: IConfigurationNode = {
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.editorAssociations': {
			type: 'object',
			markdownDescription: localize('editor.editorAssociations', "Configure glob patterns to editors (e.g. `\"*.hex\": \"hexEditor.hexEdit\"`). These have precedence over the default behavior."),
			additionalProperties: {
				type: 'string'
			}
		}
	}
};

export interface IEditorType {
	readonly id: string;
	readonly displayName: string;
	readonly providerDisplayName: string;
}

configurationRegistry.registerConfiguration(editorAssociationsConfigurationNode);
//#endregion

//#region EditorOverrideService types
export enum ContributedEditorPriority {
	builtin = 'builtin',
	option = 'option',
	exclusive = 'exclusive',
	default = 'default'
}

export type ContributionPointOptions = {
	/**
	 * If your editor cannot be opened in multiple groups for the same resource
	 */
	singlePerResource?: boolean | (() => boolean);
	/**
	 * If your editor supports diffs
	 */
	canHandleDiff?: boolean | (() => boolean);

	/**
	 * Whether or not you can support opening the given resource.
	 * If omitted we assume you can open everything
	 */
	canSupportResource?: (resource: URI) => boolean;
};

export type ContributedEditorInfo = {
	id: string;
	describes: (currentEditor: IEditorInput) => boolean;
	label: string;
	detail?: string;
	priority: ContributedEditorPriority;
};

export type EditorInputFactoryFunction = (resource: URI, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup) => IEditorInputWithOptions;

export type DiffEditorInputFactoryFunction = (diffEditorInput: DiffEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup) => IEditorInputWithOptions;

export interface IEditorOverrideService {
	readonly _serviceBrand: undefined;
	/**
	 * Given a resource finds the editor associations that match it from the user's settings
	 * @param resource The resource to match
	 * @return The matching associations
	 */
	getAssociationsForResource(resource: URI): EditorAssociations;

	/**
	 * Updates the user's association to include a specific editor ID as a default for the given glob pattern
	 * @param globPattern The glob pattern (must be a string as settings don't support relative glob)
	 * @param editorID The ID of the editor to make a user default
	 */
	updateUserAssociations(globPattern: string, editorID: string): void;

	/**
	 * Registers a specific editor contribution.
	 * @param globPattern The glob pattern for this contribution point
	 * @param editorInfo Information about the contribution point
	 * @param options Specific options which apply to this contribution
	 * @param createEditorInput The factory method for creating inputs
	 */
	registerContributionPoint(
		globPattern: string | glob.IRelativePattern,
		editorInfo: ContributedEditorInfo,
		options: ContributionPointOptions,
		createEditorInput: EditorInputFactoryFunction,
		createDiffEditorInput?: DiffEditorInputFactoryFunction
	): IDisposable;

	/**
	 * Given an editor determines if there's a suitable override for it, if so returns an IEditorInputWithOptions for opening
	 * @param editor The editor to override
	 * @param options The current options for the editor
	 * @param group The current group
	 * @returns An IEditorInputWithOptionsAndGroup if there is an available override or undefined if there is not
	 */
	resolveEditorOverride(editor: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup): Promise<IEditorInputWithOptionsAndGroup | undefined>;
}

//#endregion

//#region Util functions
export function priorityToRank(priority: ContributedEditorPriority): number {
	switch (priority) {
		case ContributedEditorPriority.exclusive:
			return 5;
		case ContributedEditorPriority.default:
			return 4;
		case ContributedEditorPriority.builtin:
			return 3;
		// Text editor is priority 2
		case ContributedEditorPriority.option:
		default:
			return 1;
	}
}

export function globMatchesResource(globPattern: string | glob.IRelativePattern, resource: URI): boolean {
	const excludedSchemes = new Set([
		Schemas.extension,
		Schemas.webviewPanel,
	]);
	// We want to say that the above schemes match no glob patterns
	if (excludedSchemes.has(resource.scheme)) {
		return false;
	}
	const matchOnPath = typeof globPattern === 'string' && globPattern.indexOf(posix.sep) >= 0;
	const target = matchOnPath ? `${resource.scheme}:${resource.path}` : basename(resource);
	return glob.match(globPattern, target.toLowerCase());
}
//#endregion
