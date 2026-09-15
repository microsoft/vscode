/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from '../../../../base/common/glob.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { posix } from '../../../../base/common/path.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IResourceEditorInput, ITextResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorInputWithOptions, EditorInputWithOptionsAndGroup, IResourceDiffEditorInput, IResourceMultiDiffEditorInput, IResourceMergeEditorInput, IUntitledTextResourceEditorInput, IUntypedEditorInput } from '../../../common/editor.js';
import { IEditorGroup } from './editorGroupsService.js';
import { PreferredGroup } from './editorService.js';
import { AtLeastOne } from '../../../../base/common/types.js';

export const IEditorResolverService = createDecorator<IEditorResolverService>('editorResolverService');

//#region Editor Associations

// Static values for registered editors

export type EditorAssociation = {
	readonly viewType: string;
	readonly filenamePattern?: string;
};

export type EditorAssociations = readonly EditorAssociation[];

export const editorsAssociationsSettingId = 'workbench.editorAssociations';
export const diffEditorsAssociationsSettingId = 'workbench.diffEditorAssociations';
export const hiddenEditorTypesSettingId = 'workbench.editor.hiddenEditorTypes';

/**
 * Setting that controls whether the Markdown editor is the default editor for
 * `*.md` files in the Agents window. Gated behind an experiment so it can be
 * rolled out gradually. Defaults to on.
 */
export const markdownDefaultEditorAgentsWindowSettingId = 'workbench.editor.markdownDefaultEditorInAgentsWindow';

/**
 * Builds the default value for `workbench.editorAssociations` in the Agents window.
 * Shared so that dynamic re-registrations of the setting preserve the override.
 *
 * Each editor association can be toggled independently. Passing `undefined`
 * leaves the association at its enabled default, so the static registration
 * ends up with all defaults registered. Pass `false` to fall back to the
 * markdown preview editor for `*.md` files.
 */
export function editorsAssociationsAgentsWindowDefault(options?: { markdownDefaultEditor?: boolean }): Record<string, string> {
	return {
		'*.md': options?.markdownDefaultEditor === true ? 'vscode.markdown.editor' : 'vscode.markdown.preview.editor'
	};
}

export function diffEditorsAssociationsAgentsWindowDefault(options?: { markdownDefaultEditor?: boolean }): Record<string, string> {
	return editorsAssociationsAgentsWindowDefault(options);
}

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

const editorAssociationsConfigurationNode: IConfigurationNode = {
	...workbenchConfigurationNodeBase,
	properties: {
		[markdownDefaultEditorAgentsWindowSettingId]: {
			type: 'boolean',
			default: true,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			markdownDescription: localize('editor.markdownDefaultEditorInAgentsWindow', "Controls whether the Markdown editor is used as the default editor for Markdown files in the Agents window."),
		},
		[editorsAssociationsSettingId]: {
			type: 'object',
			markdownDescription: localize('editor.editorAssociations', "Configure [glob patterns](https://aka.ms/vscode-glob-patterns) to editors (for example `\"*.hex\": \"hexEditor.hexedit\"`). These have precedence over the default behavior."),
			additionalProperties: {
				type: 'string'
			},
			agentsWindow: {
				default: editorsAssociationsAgentsWindowDefault()
			}
		},
		[diffEditorsAssociationsSettingId]: {
			type: 'object',
			markdownDescription: localize('editor.diffEditorAssociations', "Configure [glob patterns](https://aka.ms/vscode-glob-patterns) to editors for diff views (for example `\"*.md\": \"vscode.markdown.preview.editor\"`). These override `workbench.editorAssociations` for diffs."),
			additionalProperties: {
				type: 'string'
			},
			agentsWindow: {
				default: diffEditorsAssociationsAgentsWindowDefault()
			}
		},
		[hiddenEditorTypesSettingId]: {
			type: 'array',
			default: [],
			items: {
				type: 'string'
			},
			markdownDescription: localize('editor.hiddenEditorTypes', "Configure editor types that are hidden from the editor type picker. The active editor type remains visible."),
			agentsWindow: {
				default: ['vscode.markdown.preview.editor']
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

//#region EditorResolverService types
export enum RegisteredEditorPriority {
	builtin = 'builtin',
	option = 'option',
	exclusive = 'exclusive',
	default = 'default',
	/**
	 * The editor is not automatically used for this kind of input or opted into by an association
	 * from another input kind. It requires an association for this input kind or an explicit open.
	 */
	explicit = 'explicit'
}

/**
 * If we didn't resolve an editor dictates what to do with the opening state
 * ABORT = Do not continue with opening the editor
 * NONE = Continue as if the resolution has been disabled as the service could not resolve one
 */
export const enum ResolvedStatus {
	ABORT = 1,
	NONE = 2,
}

export type ResolvedEditor = EditorInputWithOptionsAndGroup | ResolvedStatus;

export type RegisteredEditorOptions = {
	/**
	 * If your editor cannot be opened in multiple groups for the same resource
	 */
	singlePerResource?: boolean | (() => boolean);

	/**
	 * Whether or not you can support opening the given resource.
	 * If omitted we assume you can open everything
	 */
	canSupportResource?: (resource: URI) => boolean;
};

export interface IEditorResolverServiceGetEditorsOptions {
	/**
	 * Excludes optional editors registered for `*`, unless they are configured or currently active.
	 */
	readonly excludeUnconfiguredUniversalOptionalEditors?: boolean;
	readonly currentEditorId?: string;
	readonly isDiffEditor?: boolean;
}

export interface IEditorResolverServiceGetEditorMatchesOptions {
	readonly isDiffEditor?: boolean;
}

export interface IEditorResolverServiceGetAllEditorsOptions {
	/**
	 * Excludes registrations whose editor priority is exclusive.
	 */
	readonly excludeExclusiveEditors?: boolean;
}

export const enum EditorMatchRuleSource {
	UserAssociation,
	EditorRegistration,
	Fallback
}

/**
 * The effective rule that makes one editor choice available for a resource.
 */
export type EditorMatchRule = {
	readonly editor: RegisteredEditorInfo;
	readonly priority: RegisteredEditorPriority;
	readonly associationPattern: string;
} & (
		| { readonly source: EditorMatchRuleSource.UserAssociation; readonly association: EditorAssociation }
		| { readonly source: EditorMatchRuleSource.EditorRegistration; readonly globPattern: string | glob.IRelativePattern }
		| { readonly source: EditorMatchRuleSource.Fallback }
	);

export function isUnconfiguredUniversalOptionalEditorMatch(rule: EditorMatchRule): boolean {
	return rule.source === EditorMatchRuleSource.EditorRegistration
		&& rule.globPattern === '*'
		&& rule.priority === RegisteredEditorPriority.option;
}

function freezeEditorMatchRule(rule: EditorMatchRule): EditorMatchRule {
	const editor = Object.freeze({
		...rule.editor,
		priority: Object.freeze({ ...rule.editor.priority })
	});
	switch (rule.source) {
		case EditorMatchRuleSource.UserAssociation:
			return Object.freeze({ ...rule, editor, association: Object.freeze({ ...rule.association }) });
		case EditorMatchRuleSource.EditorRegistration:
			return Object.freeze({
				...rule,
				editor,
				globPattern: typeof rule.globPattern === 'string' ? rule.globPattern : Object.freeze({ ...rule.globPattern })
			});
		case EditorMatchRuleSource.Fallback:
			return Object.freeze({ ...rule, editor });
	}
}

/**
 * An immutable snapshot containing one effective rule per matching editor and the rule selecting its default.
 */
export class EditorMatches {
	readonly matches: readonly EditorMatchRule[];
	readonly defaultRuleIndex: number;
	readonly defaultRule: EditorMatchRule;
	readonly naturalDefaultRuleIndex: number;
	readonly naturalDefaultRule: EditorMatchRule;
	readonly conflictingDefault: boolean;
	readonly hasExclusiveMatch: boolean;

	constructor(matches: readonly EditorMatchRule[], defaultRuleIndex: number, naturalDefaultRuleIndex: number, conflictingDefault: boolean) {
		if (defaultRuleIndex < 0 || defaultRuleIndex >= matches.length) {
			throw new RangeError('The default editor rule must be an item in the matches array.');
		}
		if (naturalDefaultRuleIndex < 0 || naturalDefaultRuleIndex >= matches.length) {
			throw new RangeError('The natural default editor rule must be an item in the matches array.');
		}
		if (new Set(matches.map(match => match.editor.id)).size !== matches.length) {
			throw new RangeError('Each editor must have exactly one effective match rule.');
		}
		if (conflictingDefault && matches[defaultRuleIndex].source !== EditorMatchRuleSource.EditorRegistration) {
			throw new RangeError('Only a registered editor default can conflict with another default.');
		}
		if (matches.some((match, index) => match.source === EditorMatchRuleSource.Fallback && index !== defaultRuleIndex && index !== naturalDefaultRuleIndex)) {
			throw new RangeError('A fallback rule must select the effective or natural default editor.');
		}

		this.matches = Object.freeze(matches.map(freezeEditorMatchRule));
		this.defaultRuleIndex = defaultRuleIndex;
		this.defaultRule = this.matches[defaultRuleIndex];
		this.naturalDefaultRuleIndex = naturalDefaultRuleIndex;
		this.naturalDefaultRule = this.matches[naturalDefaultRuleIndex];
		this.conflictingDefault = conflictingDefault;
		this.hasExclusiveMatch = this.matches.some(match => match.priority === RegisteredEditorPriority.exclusive);
		Object.freeze(this);
	}
}

export type RegisteredEditorPriorityInfo = {
	readonly editor: RegisteredEditorPriority;
	readonly diff: RegisteredEditorPriority;
	readonly merge: RegisteredEditorPriority;
};

export type RegisteredEditorPriorityConfiguration = Omit<RegisteredEditorPriorityInfo, 'merge'> & {
	readonly merge?: RegisteredEditorPriority;
};

export type RegisteredEditorInfo = {
	readonly id: string;
	readonly label: string;
	readonly detail?: string;
	readonly priority: RegisteredEditorPriorityInfo;
};

export type RegisteredEditorRegistrationInfo = Omit<RegisteredEditorInfo, 'priority'> & {
	readonly priority: RegisteredEditorPriority | RegisteredEditorPriorityConfiguration;
};

export function toRegisteredEditorPriorityInfo(priority: RegisteredEditorPriority | RegisteredEditorPriorityConfiguration): RegisteredEditorPriorityInfo {
	if (typeof priority !== 'string') {
		return {
			editor: priority.editor,
			diff: priority.diff,
			merge: priority.merge ?? priority.editor,
		};
	}
	return {
		editor: priority,
		diff: priority,
		merge: priority,
	};
}

type EditorInputFactoryResult = EditorInputWithOptions | Promise<EditorInputWithOptions>;

export type EditorInputFactoryFunction = (editorInput: IResourceEditorInput | ITextResourceEditorInput, group: IEditorGroup) => EditorInputFactoryResult;

export type UntitledEditorInputFactoryFunction = (untitledEditorInput: IUntitledTextResourceEditorInput, group: IEditorGroup) => EditorInputFactoryResult;

export type DiffEditorInputFactoryFunction = (diffEditorInput: IResourceDiffEditorInput, group: IEditorGroup) => EditorInputFactoryResult;

export type MultiDiffEditorInputFactoryFunction = (multiDiffEditorInput: IResourceMultiDiffEditorInput, group: IEditorGroup) => EditorInputFactoryResult;

export type MergeEditorInputFactoryFunction = (mergeEditorInput: IResourceMergeEditorInput, group: IEditorGroup) => EditorInputFactoryResult;

type EditorInputFactories = {
	createEditorInput?: EditorInputFactoryFunction;
	createUntitledEditorInput?: UntitledEditorInputFactoryFunction;
	createDiffEditorInput?: DiffEditorInputFactoryFunction;
	createMultiDiffEditorInput?: MultiDiffEditorInputFactoryFunction;
	createMergeEditorInput?: MergeEditorInputFactoryFunction;
};

export type EditorInputFactoryObject = AtLeastOne<EditorInputFactories>;

export interface IEditorResolverService {
	readonly _serviceBrand: undefined;
	/**
	 * Given a resource finds the editor associations that match it from the user's settings
	 * @param resource The resource to match
	 * @return The matching associations
	 */
	getAssociationsForResource(resource: URI): EditorAssociations;

	/**
	 * Returns an immutable snapshot of the editors matching a resource and the rule selecting its default.
	 */
	getEditorMatches(resource: URI, options?: IEditorResolverServiceGetEditorMatchesOptions): EditorMatches;

	/**
	 * Sets an editor as the default for a resource, removing a redundant association when restoring
	 * the natural default supplied by editor registrations or the Text Editor fallback.
	 * @param resource The resource whose editor default is changing.
	 * @param editorID The ID of the editor to make the default.
	 * @param forDiffEditor When `true`, the diff editor association (`workbench.diffEditorAssociations`)
	 * is updated instead of the general editor association (`workbench.editorAssociations`).
	 */
	setDefaultEditor(resource: URI, editorID: string, forDiffEditor?: boolean): void;

	/**
	 * Emitted when an editor is registered or unregistered.
	 */
	readonly onDidChangeEditorRegistrations: Event<void>;

	/**
	 * Given a callback, run the callback pausing the registration emitter
	 */
	bufferChangeEvents(callback: Function): void;

	/**
	 * Registers a specific editor. Editors with the same glob pattern and ID will be grouped together by the resolver.
	 * This allows for registration of the factories in different locations
	 * @param globPattern The glob pattern for this registration
	 * @param editorInfo Information about the registration
	 * @param options Specific options which apply to this registration
	 * @param editorFactoryObject The editor input factory functions
	 */
	registerEditor(
		globPattern: string | glob.IRelativePattern,
		editorInfo: RegisteredEditorRegistrationInfo,
		options: RegisteredEditorOptions,
		editorFactoryObject: EditorInputFactoryObject
	): IDisposable;

	/**
	 * Given an editor resolves it to the suitable ResolvedEditor based on user extensions, settings, and built-in editors
	 * @param editor The editor to resolve
	 * @param preferredGroup The group you want to open the editor in
	 * @returns An EditorInputWithOptionsAndGroup if there is an available editor or a status of how to proceed
	 */
	resolveEditor(editor: IUntypedEditorInput, preferredGroup: PreferredGroup | undefined): Promise<ResolvedEditor>;

	/**
	 * Given a resource returns all the editor ids that match that resource. If there is exclusive editor we return an empty array
	 * @param resource The resource
	 * @returns A list of editor ids
	 */
	getEditors(resource: URI, options?: IEditorResolverServiceGetEditorsOptions): RegisteredEditorInfo[];

	/**
	 * A set of all the editors that are registered to the editor resolver.
	 */
	getEditors(options?: IEditorResolverServiceGetAllEditorsOptions): RegisteredEditorInfo[];

	/**
	 * Returns the id of the best editor that can render a *diff* for the resource, excluding the
	 * built-in default text editor. This intentionally includes editors that opted out of diffs via a
	 * `explicit` priority: such editors opt out for text files, but when the default text diff editor
	 * cannot render the content (e.g. it is binary) a custom diff editor is preferable to the generic
	 * "cannot display" fallback. Returns `undefined` when no such (diff-capable) editor exists.
	 * @param resource The resource being diffed
	 */
	getBinaryDiffFallbackEditor(resource: URI): string | undefined;

	/**
	 * Get a complete list of editor associations.
	 */
	getAllUserAssociations(): EditorAssociations;
}

//#endregion

//#region Util functions
export function priorityToRank(priority: RegisteredEditorPriority): number {
	switch (priority) {
		case RegisteredEditorPriority.exclusive:
			return 5;
		case RegisteredEditorPriority.default:
			return 4;
		case RegisteredEditorPriority.builtin:
			return 3;
		// Text editor is priority 2
		case RegisteredEditorPriority.option:
			return 1;
		case RegisteredEditorPriority.explicit:
			return 0;
		default:
			return 1;
	}
}

export function globMatchesResource(globPattern: string | glob.IRelativePattern, resource: URI): boolean {
	const excludedSchemes = new Set([
		Schemas.extension,
		Schemas.webviewPanel,
		Schemas.vscodeWorkspaceTrust,
		Schemas.vscodeSettings
	]);
	// We want to say that the above schemes match no glob patterns
	if (excludedSchemes.has(resource.scheme)) {
		return false;
	}
	const matchOnPath = typeof globPattern === 'string' && globPattern.indexOf(posix.sep) >= 0;
	const target = matchOnPath ? `${resource.scheme}:${resource.path}` : basename(resource);
	return glob.match(globPattern, target, { ignoreCase: true });
}
//#endregion
