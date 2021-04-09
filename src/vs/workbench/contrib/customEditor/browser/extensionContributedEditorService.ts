/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import { distinct, firstOrDefault, insert } from 'vs/base/common/arrays';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { posix } from 'vs/base/common/path';
import { basename, isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { EditorActivation, IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { EditorAssociations, editorsAssociationsSettingId } from 'vs/workbench/browser/editor';
import { EditorOptions, IEditorInput } from 'vs/workbench/common/editor';
import { CustomEditorInfo } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, IOpenEditorOverride, IOpenEditorOverrideEntry } from 'vs/workbench/services/editor/common/editorService';
import { Schemas } from 'vs/base/common/network';
import { ContributedEditorPriority } from 'vs/workbench/contrib/customEditor/common/extensionContributedEditorService';

enum ExtensionContributedEditorChoice {
	DEFAULT = 1,
	OPTIONAL = 2,
}

type ExtensionContributedEditorChoiceEntry = {
	editorID: string;
	choice: ExtensionContributedEditorChoice;
};

interface IContributedEditorInput extends IEditorInput {
	viewType?: string;
}

interface ContributionPoint {
	scheme: string | undefined,
	globPattern: string, priority: number,
	editorInfo: ContributedEditorInfo,
	options: ContributionPointOptions,
	createEditorInput: (resource: URI, editorID: string, group: IEditorGroup) => IEditorInput,
}

export type ContributionPointOptions = {
	singlePerGroup?: boolean | (() => boolean);
	singlePerResource?: boolean | (() => boolean);
};

export type ContributedEditorInfo = {
	id: string;
	active: (currentEditor: IEditorInput) => boolean;
	instanceOf: (editorInput: IEditorInput) => boolean;
	label: string;
	detail: string;
	priority: ContributedEditorPriority;
};

export interface IExtensionContributedEditorService {
	readonly _serviceBrand: undefined;
	contributedEditorOverride(handler: IExtensionContributedEditorHandler): IDisposable;
	getAssociationsForResource(resource: URI): EditorAssociations;
	/**
	 * Registers a specific editor contribution.
	 * @param scheme The scheme of this contribution, if defined it takes precedent
	 * @param globPattern The glob pattern for this contribution point
	 * @param editorInfo Information about the contribution point
	 * @param options Specific options which apply to this contribution
	 * @param createEditorInput The factory method for creating inputs
	 */
	registerContributionPoint(
		scheme: string | undefined,
		globPattern: string, priority: number,
		editorInfo: ContributedEditorInfo,
		options: ContributionPointOptions,
		createEditorInput: (resource: URI, editorID: string, group: IEditorGroup) => IEditorInput
	): IDisposable;
	/**
	 * Returns whether a not a contribution point is registered for that glob or scheme
	 */
	hasContributionPoint(schemeOrGlob: string): boolean;
}

export interface IExtensionContributedEditorHandler {
	/**
	 * Given a list of associations for a given resource, returns whihc overrides that contribution point can handle
	 * @param resource The URI of the current resource you want the overrides of
	 * @param currentEditor The current editor
	 */
	getEditorOverrides?(resource: URI, currentEditor: IEditorInput | undefined): IOpenEditorOverrideEntry[];
	open(editor: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup): IOpenEditorOverride | undefined;
}

export class ExtensionContributedEditorService extends Disposable implements IExtensionContributedEditorService {
	readonly _serviceBrand: undefined;

	private _contributionPoints: Map<string, ContributionPoint> = new Map<string, ContributionPoint>();
	private readonly _editorChoiceStorageID = 'extensionContributedEditorService.editorChoice';

	private readonly extensionContributedEditors: IExtensionContributedEditorHandler[] = [];
	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this._register(this.editorService.overrideOpenEditor({
			getEditorOverrides: (resource: URI, options: IEditorOptions | undefined, group: IEditorGroup | undefined) => {
				const currentEditor = group && firstOrDefault(this.editorService.findEditors(resource, group));
				// Get the matching contribtuions and call resolve whether they're active for the picker
				return this.findMatchingContributions(resource).map(contribPoint => {
					return {
						id: contribPoint.editorInfo.id,
						active: currentEditor ? contribPoint.editorInfo.active(currentEditor) : false,
						label: contribPoint.editorInfo.label,
						detail: contribPoint.editorInfo.detail,
					};
				});
			},
			open: (editor: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup) => {
				if (!editor.resource) {
					return;
				}

				let override = typeof options?.override === 'string' ? options.override : undefined;

				// If the editor passed in already has a type and the user didn't explicitly override the editor choice, use the editor type.
				override = override ?? (editor as IContributedEditorInput).viewType;

				const selectedContribution = this.getContributionPoint(editor.resource, override);
				if (!selectedContribution) {
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
		scheme: string | undefined,
		globPattern: string,
		priority: number,
		editorInfo: ContributedEditorInfo,
		options: ContributionPointOptions,
		createEditorInput: (resource: URI, editorID: string, group: IEditorGroup) => IEditorInput
	): IDisposable {
		this._contributionPoints.set(scheme ?? globPattern, {
			scheme,
			globPattern,
			priority,
			editorInfo,
			options,
			createEditorInput,
		});
		return toDisposable(() => this._contributionPoints.delete(scheme ?? globPattern));
	}

	contributedEditorOverride(handler: IExtensionContributedEditorHandler): IDisposable {
		const remove = insert(this.extensionContributedEditors, handler);
		return toDisposable(() => remove());
	}

	hasContributionPoint(schemeOrGlob: string): boolean {
		return this._contributionPoints.has(schemeOrGlob);
	}

	getAssociationsForResource(resource: URI): EditorAssociations {
		const rawAssociations = this.configurationService.getValue<EditorAssociations>(editorsAssociationsSettingId) || [];
		return rawAssociations.filter(association => CustomEditorInfo.selectorMatches(association, resource));
	}

	private findMatchingContributions(resource: URI): ContributionPoint[] {
		let contributions: ContributionPoint[] = [];
		// First we match scheme
		contributions = contributions.concat(this._contributionPoints.get(resource.scheme) ?? []);
		// Then all glob patterns
		for (const key of this._contributionPoints.keys()) {
			const contributionPoint = this._contributionPoints.get(key)!;
			const matchOnPath = contributionPoint?.globPattern.indexOf(posix.sep) >= 0;
			const target = matchOnPath ? resource.path : basename(resource);
			if (glob.match(contributionPoint.globPattern, target)) {
				contributions.push(contributionPoint);
			}
		}
		// Return the contributions sorted by their priority
		return contributions.sort((a, b) => a.priority - b.priority);
	}

	private getContributionPoint(resource: URI, override: string | undefined) {
		const contributionPoints = this.findMatchingContributions(resource);
		if (override) {
			return contributionPoints.find(contribPoint => contribPoint.editorInfo.id === override);
		}
		const userAssociation = this.getAssociationsForResource(resource)[0] || [];
		return contributionPoints.find(contribPoint => contribPoint.editorInfo.id === userAssociation.viewType);
	}

	private async doHandleEditorOpening(editor: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup, selectedContribution: ContributionPoint) {

		// We only call this function from one place and there we do the check to ensure editor.resource is not undefined
		const resource = editor.resource!;

		const input = selectedContribution.createEditorInput(resource, selectedContribution.editorInfo.id, group);

		// If no activation option is provided, populate it.
		if (options && typeof options.activation === 'undefined') {
			options = { ...options, activation: options.preserveFocus ? EditorActivation.RESTORE : undefined };
		}

		// If the editor states it can only be opened once per resource we must close all existing ones first
		const singleEditorPerResource = typeof selectedContribution.options.singlePerResource === 'function' ? selectedContribution.options.singlePerResource() : selectedContribution.options.singlePerResource;
		if (singleEditorPerResource) {
			this.closeExistingEditorsForResource(resource, selectedContribution.editorInfo.id, group);
		}


		// Check to see if there already an editor for the resource in the group.
		// If there is, we want to open that instead of creating a new editor.
		// This ensures that we preserve whatever type of editor was previously being used
		// when the user switches back to it.
		// const strictMatchEditorInput = group.editors.find(e => e === editor && !this._fileEditorInputFactory.isFileEditorInput(e));
		// if (strictMatchEditorInput) {
		// 	return;
		// }

		// If an existing editor for a resource exists within the group and we're reopening it, replace it.
		const existing = firstOrDefault(this.editorService.findEditors(resource, group));
		if (existing) {
			if (!input.matches(existing)) {
				await this.editorService.replaceEditors([{
					editor: existing,
					replacement: input,
					forceReplaceDirty: existing.resource?.scheme === Schemas.untitled,
					options: options ? EditorOptions.create(options) : undefined,
				}], group);

				if (selectedContribution.editorInfo.instanceOf(existing)) {
					existing.dispose();
				}
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

	// @ts-ignore
	private storeUserChoice(override: string) {
		const currentChoices: ExtensionContributedEditorChoiceEntry[] = JSON.parse(this.storageService.get(this._editorChoiceStorageID, StorageScope.GLOBAL, '[]'));
		const currentChoice = currentChoices.find(entry => entry.editorID === override);
		if (!currentChoice) {
			currentChoices.push({ editorID: override, choice: ExtensionContributedEditorChoice.OPTIONAL });
			this.storageService.store(this._editorChoiceStorageID, JSON.stringify(currentChoices), StorageScope.GLOBAL, StorageTarget.USER);
		}
	}
}

export const IExtensionContributedEditorService = createDecorator<IExtensionContributedEditorService>('extensionContributedEditorService');
registerSingleton(IExtensionContributedEditorService, ExtensionContributedEditorService);
