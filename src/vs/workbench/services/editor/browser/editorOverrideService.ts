/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import { distinct, firstOrDefault, flatten, insert } from 'vs/base/common/arrays';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { EditorActivation, IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { EditorAssociations, editorsAssociationsSettingId } from 'vs/workbench/browser/editor';
import { EditorOptions, IEditorInput, IEditorInputWithOptions } from 'vs/workbench/common/editor';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Schemas } from 'vs/base/common/network';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { ContributedEditorPriority, globMatchesResource, priorityToRank } from 'vs/workbench/services/editor/common/editorOverrideService';

interface IContributedEditorInput extends IEditorInput {
	viewType?: string;
}

interface ContributionPoint {
	globPattern: string | glob.IRelativePattern,
	priority: number,
	editorInfo: ContributedEditorInfo,
	options: ContributionPointOptions,
	createEditorInput: EditorInputFactoryFunction
	createDiffEditorInput?: DiffEditorInputFactoryFunction
}

type ContributionPoints = Array<ContributionPoint>;

export type ContributionPointOptions = {
	singlePerResource?: boolean | (() => boolean);
	canHandleDiff?: boolean | (() => boolean);
};

export type ContributedEditorInfo = {
	id: string;
	active: (currentEditor: IEditorInput) => boolean;
	instanceOf: (editorInput: IEditorInput) => boolean;
	label: string;
	detail: string;
	priority: ContributedEditorPriority;
};

type EditorInputFactoryFunction = (resource: URI, editorID: string, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup) => IEditorInputWithOptions;

type DiffEditorInputFactoryFunction = (diffEditorInput: DiffEditorInput, editorID: string, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup) => IEditorInputWithOptions;

export interface IEditorOverrideService {
	readonly _serviceBrand: undefined;
	getAssociationsForResource(resource: URI): EditorAssociations;
	/**
	 * Registers a specific editor contribution.
	 * @param globPattern The glob pattern for this contribution point
	 * @param editorInfo Information about the contribution point
	 * @param options Specific options which apply to this contribution
	 * @param createEditorInput The factory method for creating inputs
	 */
	registerContributionPoint(
		globPattern: string | glob.IRelativePattern,
		priority: number,
		editorInfo: ContributedEditorInfo,
		options: ContributionPointOptions,
		createEditorInput: EditorInputFactoryFunction,
		createDiffEditorInput?: DiffEditorInputFactoryFunction
	): IDisposable;
}

export class EditorOverrideService extends Disposable implements IEditorOverrideService {
	readonly _serviceBrand: undefined;

	private _contributionPoints: Map<string | glob.IRelativePattern, ContributionPoints> = new Map<string | glob.IRelativePattern, ContributionPoints>();

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this._register(this.editorService.overrideOpenEditor({
			getEditorOverrides: (resource: URI, options: IEditorOptions | undefined, group: IEditorGroup | undefined) => {
				const currentEditor = group && firstOrDefault(this.editorService.findEditors(resource, group));
				// If untitled, we want all contribution points
				const contributionPoints = resource.scheme === Schemas.untitled ? distinct(flatten(Array.from(this._contributionPoints.values())), (contrib) => contrib.editorInfo.id) : this.findMatchingContributions(resource);
				// Get the matching contribtuions and call resolve whether they're active for the picker
				return contributionPoints.map(contribPoint => {
					return {
						id: contribPoint.editorInfo.id,
						active: currentEditor ? contribPoint.editorInfo.active(currentEditor) : false,
						label: contribPoint.editorInfo.label,
						detail: contribPoint.editorInfo.detail,
					};
				});
			},
			open: (editor: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup) => {

				// Always ensure inputs have populated resource fields
				if (editor instanceof DiffEditorInput) {
					if ((!editor.modifiedInput.resource || !editor.originalInput.resource)) {
						return;
					}
				} else if (!editor.resource) {
					return;
				}

				let override = typeof options?.override === 'string' ? options.override : undefined;

				// If the editor passed in already has a type and the user didn't explicitly override the editor choice, use the editor type.
				override = override ?? (editor as IContributedEditorInput).viewType;

				const selectedContribution = this.getContributionPoint(editor instanceof DiffEditorInput ? editor.modifiedInput.resource! : editor.resource!, override);
				if (!selectedContribution) {
					return;
				}

				const handlesDiff = typeof selectedContribution.options.canHandleDiff === 'function' ? selectedContribution.options.canHandleDiff() : selectedContribution.options.canHandleDiff;
				if (editor instanceof DiffEditorInput && handlesDiff === false) {
					return;
				}

				// If it's the currently active editor we shouldn't do anything
				if (selectedContribution.editorInfo.active(editor)) {
					return;
				}

				return { override: this.doHandleEditorOpening(editor, options, group, selectedContribution) };
			}
		}));
	}

	registerContributionPoint(
		globPattern: string | glob.IRelativePattern,
		priority: number,
		editorInfo: ContributedEditorInfo,
		options: ContributionPointOptions,
		createEditorInput: EditorInputFactoryFunction,
		createDiffEditorInput?: DiffEditorInputFactoryFunction
	): IDisposable {
		if (this._contributionPoints.get(globPattern) === undefined) {
			this._contributionPoints.set(globPattern, []);
		}
		const remove = insert(this._contributionPoints.get(globPattern)!, {
			globPattern,
			priority,
			editorInfo,
			options,
			createEditorInput,
			createDiffEditorInput
		});
		return toDisposable(() => remove());
	}

	hasContributionPoint(schemeOrGlob: string): boolean {
		return this._contributionPoints.has(schemeOrGlob);
	}

	getAssociationsForResource(resource: URI): EditorAssociations {
		const rawAssociations = this.configurationService.getValue<EditorAssociations>(editorsAssociationsSettingId) || [];
		return rawAssociations.filter(association => association.filenamePattern && globMatchesResource(association.filenamePattern, resource));
	}

	private findMatchingContributions(resource: URI): ContributionPoint[] {
		let contributions: ContributionPoint[] = [];
		// Then all glob patterns
		for (const key of this._contributionPoints.keys()) {
			const contributionPoints = this._contributionPoints.get(key)!;
			for (const contributionPoint of contributionPoints) {
				if (globMatchesResource(key, resource)) {
					contributions.push(contributionPoint);
				}
			}
		}
		// Return the contributions sorted by their priority
		return contributions.sort((a, b) => b.priority - a.priority);
	}

	private getContributionPoint(resource: URI, override: string | undefined) {
		if (override) {
			// Specific overried passed in doesn't have to match the reosurce, it can be anything
			const contributionPoints = flatten(Array.from(this._contributionPoints.values()));
			return contributionPoints.find(contribPoint => contribPoint.editorInfo.id === override);
		}

		let contributionPoints = this.findMatchingContributions(resource);

		const associationsFromSetting = this.getAssociationsForResource(resource);
		// We only want built-in+ if no user defined setting is found. Else we will fall back to the text editor
		const contributionPoint = contributionPoints.find(contribPoint => contribPoint.priority >= priorityToRank(ContributedEditorPriority.builtin));
		// If the user has a setting we use that, else choise the highest priority editor that is built-in+
		const selectedViewType = associationsFromSetting[0]?.viewType || contributionPoint?.editorInfo.id;

		if (associationsFromSetting.length === 0 && contributionPoint?.editorInfo.priority === ContributedEditorPriority.default) {
			setTimeout(() => {
				console.log('Conflicting defaults!');
			}, 500);
		}

		return contributionPoints.find(contribPoint => contribPoint.editorInfo.id === selectedViewType);
	}

	private async doHandleEditorOpening(editor: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup, selectedContribution: ContributionPoint) {

		// If no activation option is provided, populate it.
		if (options && typeof options.activation === 'undefined') {
			options = { ...options, activation: options.preserveFocus ? EditorActivation.RESTORE : undefined };
		}

		// If it's a diff editor we trigger the create diff editor input
		if (editor instanceof DiffEditorInput) {
			if (!selectedContribution.createDiffEditorInput) {
				return;
			}
			const inputWithOptions = selectedContribution.createDiffEditorInput(editor, selectedContribution.editorInfo.id, options, group);
			return group.openEditor(inputWithOptions.editor, inputWithOptions.options ?? options);
		}

		// We only call this function from one place and there we do the check to ensure editor.resource is not undefined
		const resource = editor.resource!;

		// Respect options passed back
		const inputWithOptions = selectedContribution.createEditorInput(resource, selectedContribution.editorInfo.id, options, group);
		options = inputWithOptions.options ?? options;
		const input = inputWithOptions.editor;

		// If the editor states it can only be opened once per resource we must close all existing ones first
		const singleEditorPerResource = typeof selectedContribution.options.singlePerResource === 'function' ? selectedContribution.options.singlePerResource() : selectedContribution.options.singlePerResource;
		if (singleEditorPerResource) {
			this.closeExistingEditorsForResource(resource, selectedContribution.editorInfo.id, group);
		}

		// If an existing editor for a resource exists within the group and we're reopening it, replace it.
		const existing = firstOrDefault(this.editorService.findEditors(resource, group));
		if (existing) {
			if (!input.matches(existing)) {
				await group.replaceEditors([{
					editor: existing,
					replacement: input,
					forceReplaceDirty: existing.resource?.scheme === Schemas.untitled,
					options: options ? EditorOptions.create(options) : undefined,
				}]);

				if (selectedContribution.editorInfo.instanceOf(existing)) {
					existing.dispose();
				}
				return;
			}
		}
		return group.openEditor(input, options);
	}

	private closeExistingEditorsForResource(
		resource: URI,
		viewType: string,
		targetGroup: IEditorGroup,
	): void {
		const editorInfoForResource = this.findExistingEditorsForResource(resource, viewType);
		if (!editorInfoForResource.length) {
			return;
		}

		const editorToUse = editorInfoForResource[0];

		// Replace all other editors
		for (const { editor, group } of editorInfoForResource) {
			if (editor !== editorToUse.editor) {
				group.closeEditor(editor);
			}
		}

		if (targetGroup.id !== editorToUse.group.id) {
			editorToUse.group.closeEditor(editorToUse.editor);
		}
		return;
	}

	/**
	 * Given a resource and a viewType, returns all editors open for that resouce and viewType.
	 * @param resource The resource specified
	 * @param viewType The viewtype
	 * @returns A list of editors
	 */
	private findExistingEditorsForResource(
		resource: URI,
		viewType: string,
	): Array<{ editor: IEditorInput, group: IEditorGroup }> {
		const out: Array<{ editor: IEditorInput, group: IEditorGroup }> = [];
		const orderedGroups = distinct([
			...this.editorGroupService.groups,
		]);

		for (const group of orderedGroups) {
			for (const editor of group.editors) {
				if (isEqual(editor.resource, resource) && (editor as IContributedEditorInput).viewType === viewType) {
					out.push({ editor, group });
				}
			}
		}
		return out;
	}
}

export const IEditorOverrideService = createDecorator<IEditorOverrideService>('editorOverrideService');
registerSingleton(IEditorOverrideService, EditorOverrideService);
