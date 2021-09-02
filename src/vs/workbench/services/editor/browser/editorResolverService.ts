/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import { distinct, firstOrDefault, flatten, insert } from 'vs/base/common/arrays';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { basename, extname, isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { EditorActivation, EditorResolution, IEditorOptions } from 'vs/platform/editor/common/editor';
import { DEFAULT_EDITOR_ASSOCIATION, EditorResourceAccessor, IEditorInput, IEditorInputWithOptions, IResourceSideBySideEditorInput, isEditorInputWithOptions, isEditorInputWithOptionsAndGroup, isResourceDiffEditorInput, isResourceSideBySideEditorInput, isUntitledResourceEditorInput, IUntypedEditorInput, SideBySideEditor } from 'vs/workbench/common/editor';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { Schemas } from 'vs/base/common/network';
import { RegisteredEditorInfo, RegisteredEditorPriority, RegisteredEditorOptions, DiffEditorInputFactoryFunction, EditorAssociation, EditorAssociations, EditorInputFactoryFunction, editorsAssociationsSettingId, globMatchesResource, IEditorResolverService, priorityToRank, ResolvedEditor, ResolvedStatus, UntitledEditorInputFactoryFunction } from 'vs/workbench/services/editor/common/editorResolverService';
import { IKeyMods, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { localize } from 'vs/nls';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { findGroup } from 'vs/workbench/services/editor/common/editorGroupFinder';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { PreferredGroup } from 'vs/workbench/services/editor/common/editorService';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';

interface RegisteredEditor {
	globPattern: string | glob.IRelativePattern,
	editorInfo: RegisteredEditorInfo,
	options?: RegisteredEditorOptions,
	createEditorInput: EditorInputFactoryFunction,
	createUntitledEditorInput?: UntitledEditorInputFactoryFunction | undefined,
	createDiffEditorInput?: DiffEditorInputFactoryFunction
}

type RegisteredEditors = Array<RegisteredEditor>;

export class EditorResolverService extends Disposable implements IEditorResolverService {
	readonly _serviceBrand: undefined;

	// Constants
	private static readonly configureDefaultID = 'promptOpenWith.configureDefault';
	private static readonly cacheStorageID = 'editorOverrideService.cache';
	private static readonly conflictingDefaultsStorageID = 'editorOverrideService.conflictingDefaults';

	// Data Stores
	private _editors: Map<string | glob.IRelativePattern, RegisteredEditors> = new Map<string | glob.IRelativePattern, RegisteredEditors>();
	private cache: Set<string> | undefined;

	constructor(
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		// Read in the cache on statup
		this.cache = new Set<string>(JSON.parse(this.storageService.get(EditorResolverService.cacheStorageID, StorageScope.GLOBAL, JSON.stringify([]))));
		this.storageService.remove(EditorResolverService.cacheStorageID, StorageScope.GLOBAL);
		this.convertOldAssociationFormat();

		this._register(this.storageService.onWillSaveState(() => {
			// We want to store the glob patterns we would activate on, this allows us to know if we need to await the ext host on startup for opening a resource
			this.cacheEditors();
		}));

		// When extensions have registered we no longer need the cache
		this.extensionService.onDidRegisterExtensions(() => {
			this.cache = undefined;
		});

		// When the setting changes we want to ensure that it is properly converted
		this._register(this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(editorsAssociationsSettingId)) {
				this.convertOldAssociationFormat();
			}
		}));
	}

	private resolveUntypedInputAndGroup(editor: IEditorInputWithOptions | IUntypedEditorInput, preferredGroup: PreferredGroup | undefined): [IUntypedEditorInput, IEditorGroup, EditorActivation | undefined] | undefined {
		let untypedEditor: IUntypedEditorInput | undefined = undefined;

		// Typed: convert to untyped to be able to resolve the editor as the service only uses untyped
		if (isEditorInputWithOptions(editor)) {
			untypedEditor = editor.editor.toUntyped();

			if (untypedEditor) {
				// Preserve original options: specifically it is
				// possible that a `override` was defined from
				// the outside and we do not want to lose it.
				untypedEditor.options = { ...untypedEditor.options, ...editor.options };
			}
		}

		// Untyped: take as is
		else {
			untypedEditor = editor;
		}

		// Typed editors that cannot convert to untyped will be returned as undefined
		if (!untypedEditor) {
			return undefined;
		}
		// Use the untyped editor to find a group
		const [group, activation] = this.instantiationService.invokeFunction(findGroup, untypedEditor, preferredGroup);

		return [untypedEditor, group, activation];
	}

	async resolveEditor(editor: IEditorInputWithOptions | IUntypedEditorInput, preferredGroup: PreferredGroup | undefined): Promise<ResolvedEditor> {
		// Special case: side by side editors requires us to
		// independently resolve both sides and then build
		// a side by side editor with the result
		if (isResourceSideBySideEditorInput(editor)) {
			return this.doResolveSideBySideEditor(editor, preferredGroup);
		}

		const resolvedUntypedAndGroup = this.resolveUntypedInputAndGroup(editor, preferredGroup);
		if (!resolvedUntypedAndGroup) {
			return ResolvedStatus.NONE;
		}
		// Get the resolved untyped editor, group, and activation
		const [untypedEditor, group, activation] = resolvedUntypedAndGroup;
		if (activation) {
			untypedEditor.options = { ...untypedEditor.options, activation };
		}

		let resource = EditorResourceAccessor.getCanonicalUri(untypedEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
		let options = untypedEditor.options;

		// If it was resolved before we await for the extensions to activate and then proceed with resolution or else the backing extensions won't be registered
		if (this.cache && resource && this.resourceMatchesCache(resource)) {
			await this.extensionService.whenInstalledExtensionsRegistered();
		}

		if (resource === undefined) {
			resource = URI.from({ scheme: Schemas.untitled });
		}

		if (untypedEditor.options?.override === EditorResolution.DISABLED) {
			throw new Error(`Calling resolve editor when resolution is explicitly disabled!`);
		}

		if (untypedEditor.options?.override === EditorResolution.PICK) {
			const picked = await this.doPickEditor(untypedEditor);
			// If the picker was cancelled we will stop resolving the editor
			if (!picked) {
				return ResolvedStatus.ABORT;
			}
			// Populate the options with the new ones
			untypedEditor.options = picked;
		}

		// Resolved the editor ID as much as possible, now find a given editor (cast here is ok because we resolve down to a string above)
		let { editor: selectedEditor, conflictingDefault } = this.getEditor(resource, untypedEditor.options?.override as (string | EditorResolution.EXCLUSIVE_ONLY | undefined));
		if (!selectedEditor) {
			return ResolvedStatus.NONE;
		}

		// In the special case of diff editors we do some more work to determine the correct editor for both sides
		if (isResourceDiffEditorInput(untypedEditor) && untypedEditor.options?.override === undefined) {
			let resource2 = EditorResourceAccessor.getCanonicalUri(untypedEditor, { supportSideBySide: SideBySideEditor.SECONDARY });
			if (!resource2) {
				resource2 = URI.from({ scheme: Schemas.untitled });
			}
			const { editor: selectedEditor2 } = this.getEditor(resource2, undefined);
			if (!selectedEditor2 || selectedEditor.editorInfo.id !== selectedEditor2.editorInfo.id) {
				const { editor: selectedDiff, conflictingDefault: conflictingDefaultDiff } = this.getEditor(resource, DEFAULT_EDITOR_ASSOCIATION.id);
				selectedEditor = selectedDiff;
				conflictingDefault = conflictingDefaultDiff;
			}
			if (!selectedEditor) {
				return ResolvedStatus.NONE;
			}
		}

		// If no override we take the selected editor id so that matches works with the isActive check
		untypedEditor.options = { override: selectedEditor.editorInfo.id, ...untypedEditor.options };

		let handlesDiff = typeof selectedEditor.options?.canHandleDiff === 'function' ? selectedEditor.options.canHandleDiff() : selectedEditor.options?.canHandleDiff;
		// Also check that it has a factory function or else it doesn't matter
		handlesDiff = handlesDiff && selectedEditor.createDiffEditorInput !== undefined;
		if (handlesDiff === false && isResourceDiffEditorInput(untypedEditor)) {
			return ResolvedStatus.NONE;
		}

		// If it's the currently active editor we shouldn't do anything
		const activeEditor = group.activeEditor;
		const isActive = activeEditor ? activeEditor.matches(untypedEditor) : false;
		if (activeEditor && isActive) {
			return { editor: activeEditor, options, group };
		}
		const input = await this.doResolveEditor(untypedEditor, group, selectedEditor);
		if (conflictingDefault && input) {
			// Show the conflicting default dialog
			await this.doHandleConflictingDefaults(resource, selectedEditor.editorInfo.label, untypedEditor, input.editor, group);
		}

		if (input) {
			this.sendEditorResolutionTelemetry(input.editor);
			return { ...input, group };
		}
		return ResolvedStatus.ABORT;
	}

	private async doResolveSideBySideEditor(editor: IResourceSideBySideEditorInput, preferredGroup: PreferredGroup | undefined): Promise<ResolvedEditor> {
		const primaryResolvedEditor = await this.resolveEditor(editor.primary, preferredGroup);
		if (!isEditorInputWithOptionsAndGroup(primaryResolvedEditor)) {
			return ResolvedStatus.NONE;
		}
		const secondaryResolvedEditor = await this.resolveEditor(editor.secondary, primaryResolvedEditor.group ?? preferredGroup);
		if (!isEditorInputWithOptionsAndGroup(secondaryResolvedEditor)) {
			return ResolvedStatus.NONE;
		}
		return {
			group: primaryResolvedEditor.group ?? secondaryResolvedEditor.group,
			editor: new SideBySideEditorInput(editor.label, editor.description, secondaryResolvedEditor.editor as EditorInput, primaryResolvedEditor.editor as EditorInput),
			options: editor.options
		};
	}

	registerEditor(
		globPattern: string | glob.IRelativePattern,
		editorInfo: RegisteredEditorInfo,
		options: RegisteredEditorOptions,
		createEditorInput: EditorInputFactoryFunction,
		createUntitledEditorInput?: UntitledEditorInputFactoryFunction | undefined,
		createDiffEditorInput?: DiffEditorInputFactoryFunction
	): IDisposable {
		let registeredEditor = this._editors.get(globPattern);
		if (registeredEditor === undefined) {
			registeredEditor = [];
			this._editors.set(globPattern, registeredEditor);
		}
		const remove = insert(registeredEditor, {
			globPattern,
			editorInfo,
			options,
			createEditorInput,
			createUntitledEditorInput,
			createDiffEditorInput
		});
		return toDisposable(() => remove());
	}

	getAssociationsForResource(resource: URI): EditorAssociations {
		const associations = this.getAllUserAssociations();
		const matchingAssociations = associations.filter(association => association.filenamePattern && globMatchesResource(association.filenamePattern, resource));
		const allEditors: RegisteredEditors = this._registeredEditors;
		// Ensure that the settings are valid editors
		return matchingAssociations.filter(association => allEditors.find(c => c.editorInfo.id === association.viewType));
	}

	private convertOldAssociationFormat(): void {
		const rawAssociations = this.configurationService.getValue<EditorAssociations | { [fileNamePattern: string]: string }>(editorsAssociationsSettingId) || [];
		// If it's not an array, then it's the new format
		if (!Array.isArray(rawAssociations)) {
			return;
		}
		let newSettingObject = Object.create(null);
		// Make the correctly formatted object from the array and then set that object
		for (const association of rawAssociations) {
			if (association.filenamePattern) {
				newSettingObject[association.filenamePattern] = association.viewType;
			}
		}
		this.logService.info(`Migrating ${editorsAssociationsSettingId}`);
		this.configurationService.updateValue(editorsAssociationsSettingId, newSettingObject);
	}

	private getAllUserAssociations(): EditorAssociations {
		const rawAssociations = this.configurationService.getValue<{ [fileNamePattern: string]: string }>(editorsAssociationsSettingId) || {};
		let associations = [];
		for (const [key, value] of Object.entries(rawAssociations)) {
			const association: EditorAssociation = {
				filenamePattern: key,
				viewType: value
			};
			associations.push(association);
		}
		return associations;
	}

	/**
	 * Returns all editors as an array. Possible to contain duplicates
	 */
	private get _registeredEditors(): RegisteredEditors {
		return flatten(Array.from(this._editors.values()));
	}

	updateUserAssociations(globPattern: string, editorID: string): void {
		const newAssociation: EditorAssociation = { viewType: editorID, filenamePattern: globPattern };
		const currentAssociations = this.getAllUserAssociations();
		const newSettingObject = Object.create(null);
		// Form the new setting object including the newest associations
		for (const association of [...currentAssociations, newAssociation]) {
			if (association.filenamePattern) {
				newSettingObject[association.filenamePattern] = association.viewType;
			}
		}
		this.configurationService.updateValue(editorsAssociationsSettingId, newSettingObject);
	}

	private findMatchingEditors(resource: URI): RegisteredEditor[] {
		// The user setting should be respected even if the editor doesn't specify that resource in package.json
		const userSettings = this.getAssociationsForResource(resource);
		let matchingEditors: RegisteredEditor[] = [];
		// Then all glob patterns
		for (const [key, editors] of this._editors) {
			for (const editor of editors) {
				const foundInSettings = userSettings.find(setting => setting.viewType === editor.editorInfo.id);
				if ((foundInSettings && editor.editorInfo.priority !== RegisteredEditorPriority.exclusive) || globMatchesResource(key, resource)) {
					matchingEditors.push(editor);
				}
			}
		}
		// Return the editors sorted by their priority
		return matchingEditors.sort((a, b) => {
			// Very crude if priorities match longer glob wins as longer globs are normally more specific
			if (priorityToRank(b.editorInfo.priority) === priorityToRank(a.editorInfo.priority) && typeof b.globPattern === 'string' && typeof a.globPattern === 'string') {
				return b.globPattern.length - a.globPattern.length;
			}
			return priorityToRank(b.editorInfo.priority) - priorityToRank(a.editorInfo.priority);
		});
	}

	public getEditorIds(resource: URI): string[] {
		const editors = this.findMatchingEditors(resource);
		if (editors.find(e => e.editorInfo.priority === RegisteredEditorPriority.exclusive)) {
			return [];
		}
		return editors.map(editor => editor.editorInfo.id);
	}

	/**
	 * Given a resource and an editorId selects the best possible editor
	 * @returns The editor and whether there was another default which conflicted with it
	 */
	private getEditor(resource: URI, editorId: string | EditorResolution.EXCLUSIVE_ONLY | undefined): { editor: RegisteredEditor | undefined, conflictingDefault: boolean } {

		const findMatchingEditor = (editors: RegisteredEditors, viewType: string) => {
			return editors.find((editor) => {
				if (editor.options && editor.options.canSupportResource !== undefined) {
					return editor.editorInfo.id === viewType && editor.options.canSupportResource(resource);
				}
				return editor.editorInfo.id === viewType;
			});
		};

		if (editorId && editorId !== EditorResolution.EXCLUSIVE_ONLY) {
			// Specific id passed in doesn't have to match the resource, it can be anything
			const registeredEditors = this._registeredEditors;
			return {
				editor: findMatchingEditor(registeredEditors, editorId),
				conflictingDefault: false
			};
		}

		let editors = this.findMatchingEditors(resource);

		const associationsFromSetting = this.getAssociationsForResource(resource);
		// We only want minPriority+ if no user defined setting is found, else we won't resolve an editor
		const minPriority = editorId === EditorResolution.EXCLUSIVE_ONLY ? RegisteredEditorPriority.exclusive : RegisteredEditorPriority.builtin;
		const possibleEditors = editors.filter(editor => priorityToRank(editor.editorInfo.priority) >= priorityToRank(minPriority) && editor.editorInfo.id !== DEFAULT_EDITOR_ASSOCIATION.id);
		if (possibleEditors.length === 0) {
			return {
				editor: associationsFromSetting[0] && minPriority !== RegisteredEditorPriority.exclusive ? findMatchingEditor(editors, associationsFromSetting[0].viewType) : undefined,
				conflictingDefault: false
			};
		}
		// If the editor is exclusive we use that, else use the user setting, else use the built-in+ editor
		const selectedViewType = possibleEditors[0].editorInfo.priority === RegisteredEditorPriority.exclusive ?
			possibleEditors[0].editorInfo.id :
			associationsFromSetting[0]?.viewType || possibleEditors[0].editorInfo.id;

		let conflictingDefault = false;
		if (associationsFromSetting.length === 0 && possibleEditors.length > 1) {
			conflictingDefault = true;
		}

		return {
			editor: findMatchingEditor(editors, selectedViewType),
			conflictingDefault
		};
	}

	private async doResolveEditor(editor: IUntypedEditorInput, group: IEditorGroup, selectedEditor: RegisteredEditor): Promise<IEditorInputWithOptions | undefined> {
		let options = editor.options;
		const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
		// If no activation option is provided, populate it.
		if (options && typeof options.activation === 'undefined') {
			options = { ...options, activation: options.preserveFocus ? EditorActivation.RESTORE : undefined };
		}

		// If it's a diff editor we trigger the create diff editor input
		if (isResourceDiffEditorInput(editor)) {
			if (!selectedEditor.createDiffEditorInput) {
				return;
			}
			const inputWithOptions = await selectedEditor.createDiffEditorInput(editor, group);
			return { editor: inputWithOptions.editor, options: inputWithOptions.options ?? options };
		}

		if (isResourceSideBySideEditorInput(editor)) {
			throw new Error(`Untyped side by side editor input not supported here.`);
		}

		if (isUntitledResourceEditorInput(editor)) {
			if (!selectedEditor.createUntitledEditorInput) {
				return;
			}
			const inputWithOptions = await selectedEditor.createUntitledEditorInput(editor, group);
			return { editor: inputWithOptions.editor, options: inputWithOptions.options ?? options };
		}

		// Should no longer have an undefined resource so lets throw an error if that's somehow the case
		if (resource === undefined) {
			throw new Error(`Undefined resource on non untitled editor input.`);
		}

		// Respect options passed back
		const inputWithOptions = await selectedEditor.createEditorInput(editor, group);
		options = inputWithOptions.options ?? options;
		const input = inputWithOptions.editor;

		// If the editor states it can only be opened once per resource we must close all existing ones first
		const singleEditorPerResource = typeof selectedEditor.options?.singlePerResource === 'function' ? selectedEditor.options.singlePerResource() : selectedEditor.options?.singlePerResource;
		if (singleEditorPerResource) {
			this.closeExistingEditorsForResource(resource, selectedEditor.editorInfo.id, group);
		}

		return { editor: input, options };
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
	 * Given a resource and an editorId, returns all editors open for that resouce and editorId.
	 * @param resource The resource specified
	 * @param editorId The editorID
	 * @returns A list of editors
	 */
	private findExistingEditorsForResource(
		resource: URI,
		editorId: string,
	): Array<{ editor: IEditorInput, group: IEditorGroup }> {
		const out: Array<{ editor: IEditorInput, group: IEditorGroup }> = [];
		const orderedGroups = distinct([
			...this.editorGroupService.groups,
		]);

		for (const group of orderedGroups) {
			for (const editor of group.editors) {
				if (isEqual(editor.resource, resource) && editor.editorId === editorId) {
					out.push({ editor, group });
				}
			}
		}
		return out;
	}

	private async doHandleConflictingDefaults(resource: URI, editorName: string, untypedInput: IUntypedEditorInput, currentEditor: IEditorInput, group: IEditorGroup) {
		type StoredChoice = {
			[key: string]: string[];
		};
		const editors = this.findMatchingEditors(resource);
		const storedChoices: StoredChoice = JSON.parse(this.storageService.get(EditorResolverService.conflictingDefaultsStorageID, StorageScope.GLOBAL, '{}'));
		const globForResource = `*${extname(resource)}`;
		// Writes to the storage service that a choice has been made for the currently installed editors
		const writeCurrentEditorsToStorage = () => {
			storedChoices[globForResource] = [];
			editors.forEach(editor => storedChoices[globForResource].push(editor.editorInfo.id));
			this.storageService.store(EditorResolverService.conflictingDefaultsStorageID, JSON.stringify(storedChoices), StorageScope.GLOBAL, StorageTarget.MACHINE);
		};

		// If the user has already made a choice for this editor we don't want to ask them again
		if (storedChoices[globForResource] && storedChoices[globForResource].find(editorID => editorID === currentEditor.editorId)) {
			return;
		}

		const handle = this.notificationService.prompt(Severity.Warning,
			localize('editorResolver.conflictingDefaults', 'There are multiple default editors available for the resource.'),
			[{
				label: localize('editorResolver.configureDefault', 'Configure Default'),
				run: async () => {
					// Show the picker and tell it to update the setting to whatever the user selected
					const picked = await this.doPickEditor(untypedInput, true);
					if (!picked) {
						return;
					}
					untypedInput.options = picked;
					const replacementEditor = await this.resolveEditor(untypedInput, group);
					if (replacementEditor === ResolvedStatus.ABORT || replacementEditor === ResolvedStatus.NONE) {
						return;
					}
					// Replace the current editor with the picked one
					group.replaceEditors([
						{
							editor: currentEditor,
							replacement: replacementEditor.editor,
							options: replacementEditor.options ?? picked,
						}
					]);
				}
			},
			{
				label: localize('editorResolver.keepDefault', 'Keep {0}', editorName),
				run: writeCurrentEditorsToStorage
			}
			]);
		// If the user pressed X we assume they want to keep the current editor as default
		const onCloseListener = handle.onDidClose(() => {
			writeCurrentEditorsToStorage();
			onCloseListener.dispose();
		});
	}

	private mapEditorsToQuickPickEntry(resource: URI, showDefaultPicker?: boolean) {
		const currentEditor = firstOrDefault(this.editorGroupService.activeGroup.findEditors(resource));
		// If untitled, we want all registered editors
		let registeredEditors = resource.scheme === Schemas.untitled ? this._registeredEditors.filter(e => e.editorInfo.priority !== RegisteredEditorPriority.exclusive) : this.findMatchingEditors(resource);
		// We don't want duplicate Id entries
		registeredEditors = distinct(registeredEditors, c => c.editorInfo.id);
		const defaultSetting = this.getAssociationsForResource(resource)[0]?.viewType;
		// Not the most efficient way to do this, but we want to ensure the text editor is at the top of the quickpick
		registeredEditors = registeredEditors.sort((a, b) => {
			if (a.editorInfo.id === DEFAULT_EDITOR_ASSOCIATION.id) {
				return -1;
			} else if (b.editorInfo.id === DEFAULT_EDITOR_ASSOCIATION.id) {
				return 1;
			} else {
				return priorityToRank(b.editorInfo.priority) - priorityToRank(a.editorInfo.priority);
			}
		});
		const quickPickEntries: Array<IQuickPickItem | IQuickPickSeparator> = [];
		const currentlyActiveLabel = localize('promptOpenWith.currentlyActive', "Active");
		const currentDefaultLabel = localize('promptOpenWith.currentDefault', "Default");
		const currentDefaultAndActiveLabel = localize('promptOpenWith.currentDefaultAndActive', "Active and Default");
		// Default order = setting -> highest priority -> text
		let defaultViewType = defaultSetting;
		if (!defaultViewType && registeredEditors.length > 2 && registeredEditors[1]?.editorInfo.priority !== RegisteredEditorPriority.option) {
			defaultViewType = registeredEditors[1]?.editorInfo.id;
		}
		if (!defaultViewType) {
			defaultViewType = DEFAULT_EDITOR_ASSOCIATION.id;
		}
		// Map the editors to quickpick entries
		registeredEditors.forEach(editor => {
			const currentViewType = currentEditor?.editorId ?? DEFAULT_EDITOR_ASSOCIATION.id;
			const isActive = currentEditor ? editor.editorInfo.id === currentViewType : false;
			const isDefault = editor.editorInfo.id === defaultViewType;
			const quickPickEntry: IQuickPickItem = {
				id: editor.editorInfo.id,
				label: editor.editorInfo.label,
				description: isActive && isDefault ? currentDefaultAndActiveLabel : isActive ? currentlyActiveLabel : isDefault ? currentDefaultLabel : undefined,
				detail: editor.editorInfo.detail ?? editor.editorInfo.priority,
			};
			quickPickEntries.push(quickPickEntry);
		});
		if (!showDefaultPicker && extname(resource) !== '') {
			const separator: IQuickPickSeparator = { type: 'separator' };
			quickPickEntries.push(separator);
			const configureDefaultEntry = {
				id: EditorResolverService.configureDefaultID,
				label: localize('promptOpenWith.configureDefault', "Configure default editor for '{0}'...", `*${extname(resource)}`),
			};
			quickPickEntries.push(configureDefaultEntry);
		}
		return quickPickEntries;
	}

	private async doPickEditor(editor: IUntypedEditorInput, showDefaultPicker?: boolean): Promise<IEditorOptions | undefined> {

		type EditorPick = {
			readonly item: IQuickPickItem;
			readonly keyMods?: IKeyMods;
			readonly openInBackground: boolean;
		};

		let resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });

		if (resource === undefined) {
			resource = URI.from({ scheme: Schemas.untitled });
		}

		// Get all the editors for the resource as quickpick entries
		const editorPicks = this.mapEditorsToQuickPickEntry(resource, showDefaultPicker);

		// Create the editor picker
		const editorPicker = this.quickInputService.createQuickPick<IQuickPickItem>();
		const placeHolderMessage = showDefaultPicker ?
			localize('prompOpenWith.updateDefaultPlaceHolder', "Select new default editor for '{0}'", `*${extname(resource)}`) :
			localize('promptOpenWith.placeHolder', "Select editor for '{0}'", basename(resource));
		editorPicker.placeholder = placeHolderMessage;
		editorPicker.canAcceptInBackground = true;
		editorPicker.items = editorPicks;
		const firstItem = editorPicker.items.find(item => item.type === 'item') as IQuickPickItem | undefined;
		if (firstItem) {
			editorPicker.selectedItems = [firstItem];
		}

		// Prompt the user to select an editor
		const picked: EditorPick | undefined = await new Promise<EditorPick | undefined>(resolve => {
			editorPicker.onDidAccept(e => {
				let result: EditorPick | undefined = undefined;

				if (editorPicker.selectedItems.length === 1) {
					result = {
						item: editorPicker.selectedItems[0],
						keyMods: editorPicker.keyMods,
						openInBackground: e.inBackground
					};
				}

				// If asked to always update the setting then update it even if the gear isn't clicked
				if (resource && showDefaultPicker && result?.item.id) {
					this.updateUserAssociations(`*${extname(resource)}`, result.item.id,);
				}

				resolve(result);
			});

			editorPicker.onDidHide(() => resolve(undefined));

			editorPicker.onDidTriggerItemButton(e => {

				// Trigger opening and close picker
				resolve({ item: e.item, openInBackground: false });

				// Persist setting
				if (resource && e.item && e.item.id) {
					this.updateUserAssociations(`*${extname(resource)}`, e.item.id,);
				}
			});

			editorPicker.show();
		});

		// Close picker
		editorPicker.dispose();

		// If the user picked an editor, look at how the picker was
		// used (e.g. modifier keys, open in background) and create the
		// options and group to use accordingly
		if (picked) {

			// If the user selected to configure default we trigger this picker again and tell it to show the default picker
			if (picked.item.id === EditorResolverService.configureDefaultID) {
				return this.doPickEditor(editor, true);
			}

			// Figure out options
			const targetOptions: IEditorOptions = {
				...editor.options,
				override: picked.item.id,
				preserveFocus: picked.openInBackground || editor.options?.preserveFocus,
			};

			return targetOptions;
		}

		return undefined;
	}

	private sendEditorResolutionTelemetry(chosenInput: IEditorInput): void {
		type editorResolutionClassification = {
			viewType: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
		};
		type editorResolutionEvent = {
			viewType: string
		};
		if (chosenInput.editorId) {
			this.telemetryService.publicLog2<editorResolutionEvent, editorResolutionClassification>('override.viewType', { viewType: chosenInput.editorId });
		}
	}

	private cacheEditors() {
		// Create a set to store glob patterns
		const cacheStorage: Set<string> = new Set<string>();

		// Store just the relative pattern pieces without any path info
		for (const [globPattern, contribPoint] of this._editors) {
			const nonOptional = !!contribPoint.find(c => c.editorInfo.priority !== RegisteredEditorPriority.option && c.editorInfo.id !== DEFAULT_EDITOR_ASSOCIATION.id);
			// Don't keep a cache of the optional ones as those wouldn't be opened on start anyways
			if (!nonOptional) {
				continue;
			}
			if (glob.isRelativePattern(globPattern)) {
				cacheStorage.add(`${globPattern.pattern}`);
			} else {
				cacheStorage.add(globPattern);
			}
		}

		// Also store the users settings as those would have to activate on startup as well
		const userAssociations = this.getAllUserAssociations();
		for (const association of userAssociations) {
			if (association.filenamePattern) {
				cacheStorage.add(association.filenamePattern);
			}
		}
		this.storageService.store(EditorResolverService.cacheStorageID, JSON.stringify(Array.from(cacheStorage)), StorageScope.GLOBAL, StorageTarget.MACHINE);
	}

	private resourceMatchesCache(resource: URI): boolean {
		if (!this.cache) {
			return false;
		}

		for (const cacheEntry of this.cache) {
			if (globMatchesResource(cacheEntry, resource)) {
				return true;
			}
		}
		return false;
	}
}

registerSingleton(IEditorResolverService, EditorResolverService);
