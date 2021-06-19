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
import { EditorActivation, EditorOverride, IEditorOptions } from 'vs/platform/editor/common/editor';
import { EditorResourceAccessor, IEditorInput, IEditorInputWithOptions, isResourceDiffEditorInput, SideBySideEditor } from 'vs/workbench/common/editor';
import { IEditorGroup, IEditorGroupsService, preferredSideBySideGroupDirection } from 'vs/workbench/services/editor/common/editorGroupsService';
import { Schemas } from 'vs/base/common/network';
import { RegisteredEditorInfo, RegisteredEditorPriority, RegisteredEditorOptions, DEFAULT_EDITOR_ASSOCIATION, DiffEditorInputFactoryFunction, EditorAssociation, EditorAssociations, EditorInputFactoryFunction, editorsAssociationsSettingId, globMatchesResource, IEditorOverrideService, priorityToRank, ReturnedOverride, OverrideStatus } from 'vs/workbench/services/editor/common/editorOverrideService';
import { IKeyMods, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { localize } from 'vs/nls';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IResourceEditorInputType } from 'vs/workbench/services/editor/common/editorService';
import { ILogService } from 'vs/platform/log/common/log';

interface IRegisteredEditorInput extends IEditorInput {
	viewType?: string;
}

interface RegisteredEditor {
	globPattern: string | glob.IRelativePattern,
	editorInfo: RegisteredEditorInfo,
	options?: RegisteredEditorOptions,
	createEditorInput: EditorInputFactoryFunction
	createDiffEditorInput?: DiffEditorInputFactoryFunction
}

type RegisteredEditors = Array<RegisteredEditor>;

export class EditorOverrideService extends Disposable implements IEditorOverrideService {
	readonly _serviceBrand: undefined;

	// Constants
	private static readonly configureDefaultID = 'promptOpenWith.configureDefault';
	private static readonly overrideCacheStorageID = 'editorOverrideService.cache';
	private static readonly conflictingDefaultsStorageID = 'editorOverrideService.conflictingDefaults';

	// Data Stores
	private _editors: Map<string | glob.IRelativePattern, RegisteredEditors> = new Map<string | glob.IRelativePattern, RegisteredEditors>();
	private cache: Set<string> | undefined;

	constructor(
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
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
		this.cache = new Set<string>(JSON.parse(this.storageService.get(EditorOverrideService.overrideCacheStorageID, StorageScope.GLOBAL, JSON.stringify([]))));
		this.storageService.remove(EditorOverrideService.overrideCacheStorageID, StorageScope.GLOBAL);
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

	async resolveEditorOverride(editor: IResourceEditorInputType, options: IEditorOptions | undefined, group: IEditorGroup): Promise<ReturnedOverride> {
		const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
		// If it was an override before we await for the extensions to activate and then proceed with overriding or else they won't be registered
		if (this.cache && resource && this.resourceMatchesCache(resource)) {
			await this.extensionService.whenInstalledExtensionsRegistered();
		}

		if (options?.override === EditorOverride.DISABLED) {
			throw new Error(`Calling resolve editor override when override is explicitly disabled!`);
		}

		// Always ensure inputs have populated resource fields
		// TODO make this the untitled case
		if (!resource) {
			return OverrideStatus.ABORT;
		}

		let override = typeof options?.override === 'string' ? options.override : undefined;

		if (options?.override === EditorOverride.PICK) {
			const picked = await this.doPickEditorOverride(editor, options, group);
			// If the picker was cancelled we will stop resolving the override
			if (!picked) {
				return OverrideStatus.ABORT;
			}
			// Deconstruct the return picked options and overrides if the user selected something
			override = picked[0].override as string | undefined;
			options = picked[0];
			group = picked[1] ?? group;
		}

		// Resolved the override as much as possible, now find a given editor
		const { editor: selectedEditor, conflictingDefault } = this.getEditor(resource, override);
		if (!selectedEditor) {
			return OverrideStatus.NONE;
		}

		const handlesDiff = typeof selectedEditor.options?.canHandleDiff === 'function' ? selectedEditor.options.canHandleDiff() : selectedEditor.options?.canHandleDiff;
		if (handlesDiff === false && isResourceDiffEditorInput(editor)) {
			return OverrideStatus.NONE;
		}

		// If it's the currently active editor we shouldn't do anything
		const activeEditor = group.activeEditor;
		const isActive = activeEditor ? (activeEditor as IRegisteredEditorInput).viewType === selectedEditor.editorInfo.id && isEqual(activeEditor.resource, resource) : false;
		if (isActive) {
			return OverrideStatus.ABORT;
		}
		const input = await this.doOverrideEditorInput(resource, editor, options, group, selectedEditor);
		if (conflictingDefault && input) {
			// Show the conflicting default dialog
			await this.doHandleConflictingDefaults(resource, selectedEditor.editorInfo.label, input.editor, input.options ?? options, group);
		}

		// Add the group as we might've changed it with the quickpick
		if (input) {
			this.sendOverrideTelemetry(input.editor);
			return { ...input, group };
		}
		return OverrideStatus.ABORT;
	}

	registerEditor(
		globPattern: string | glob.IRelativePattern,
		editorInfo: RegisteredEditorInfo,
		options: RegisteredEditorOptions,
		createEditorInput: EditorInputFactoryFunction,
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
				if (foundInSettings || globMatchesResource(key, resource)) {
					matchingEditors.push(editor);
				}
			}
		}
		// Return the editors sorted by their priority
		return matchingEditors.sort((a, b) => priorityToRank(b.editorInfo.priority) - priorityToRank(a.editorInfo.priority));
	}

	public getEditorIds(resource: URI): string[] {
		const editors = this.findMatchingEditors(resource);
		return editors.map(editor => editor.editorInfo.id);
	}

	/**
	 * Given a resource and an override selects the best possible editor
	 * @returns The editor and whether there was another default which conflicted with it
	 */
	private getEditor(resource: URI, override: string | EditorOverride.EXCLUSIVE_ONLY | undefined): { editor: RegisteredEditor | undefined, conflictingDefault: boolean } {
		const findMatchingEditor = (editors: RegisteredEditors, viewType: string) => {
			return editors.find((editor) => {
				if (editor.options && editor.options.canSupportResource !== undefined) {
					return editor.editorInfo.id === viewType && editor.options.canSupportResource(resource);
				}
				return editor.editorInfo.id === viewType;
			});
		};
		if (override && override !== EditorOverride.EXCLUSIVE_ONLY) {
			// Specific overried passed in doesn't have to match the resource, it can be anything
			const registeredEditors = this._registeredEditors;
			return {
				editor: findMatchingEditor(registeredEditors, override),
				conflictingDefault: false
			};
		}

		let editors = this.findMatchingEditors(resource);

		const associationsFromSetting = this.getAssociationsForResource(resource);
		// We only want minPriority+ if no user defined setting is found, else we won't override
		const minPriority = override === EditorOverride.EXCLUSIVE_ONLY ? RegisteredEditorPriority.exclusive : RegisteredEditorPriority.builtin;
		const possibleEditors = editors.filter(editor => priorityToRank(editor.editorInfo.priority) >= priorityToRank(minPriority) && editor.editorInfo.id !== DEFAULT_EDITOR_ASSOCIATION.id);
		if (possibleEditors.length === 0) {
			return {
				editor: undefined,
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

	private async doOverrideEditorInput(resource: URI, editor: IResourceEditorInputType, options: IEditorOptions | undefined, group: IEditorGroup, selectedEditor: RegisteredEditor): Promise<IEditorInputWithOptions | undefined> {

		// If no activation option is provided, populate it.
		if (options && typeof options.activation === 'undefined') {
			options = { ...options, activation: options.preserveFocus ? EditorActivation.RESTORE : undefined };
		}

		// If it's a diff editor we trigger the create diff editor input
		if (isResourceDiffEditorInput(editor)) {
			if (!selectedEditor.createDiffEditorInput) {
				return;
			}
			const inputWithOptions = selectedEditor.createDiffEditorInput(editor, options, group);
			return inputWithOptions;
		}

		// Respect options passed back
		const inputWithOptions = selectedEditor.createEditorInput(resource, options, group);
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
				if (isEqual(editor.resource, resource) && (editor as IRegisteredEditorInput).viewType === viewType) {
					out.push({ editor, group });
				}
			}
		}
		return out;
	}

	private async doHandleConflictingDefaults(resource: URI, editorName: string, currentEditor: IRegisteredEditorInput, options: IEditorOptions | undefined, group: IEditorGroup) {
		type StoredChoice = {
			[key: string]: string[];
		};
		const editors = this.findMatchingEditors(resource);
		const storedChoices: StoredChoice = JSON.parse(this.storageService.get(EditorOverrideService.conflictingDefaultsStorageID, StorageScope.GLOBAL, '{}'));
		const globForResource = `*${extname(resource)}`;
		// Writes to the storage service that a choice has been made for the currently installed editors
		const writeCurrentEditorsToStorage = () => {
			storedChoices[globForResource] = [];
			editors.forEach(editor => storedChoices[globForResource].push(editor.editorInfo.id));
			this.storageService.store(EditorOverrideService.conflictingDefaultsStorageID, JSON.stringify(storedChoices), StorageScope.GLOBAL, StorageTarget.MACHINE);
		};

		// If the user has already made a choice for this editor we don't want to ask them again
		if (storedChoices[globForResource] && storedChoices[globForResource].find(editorID => editorID === currentEditor.viewType)) {
			return;
		}

		const handle = this.notificationService.prompt(Severity.Warning,
			localize('editorOverride.conflictingDefaults', 'There are multiple default editors available for the resource.'),
			[{
				label: localize('editorOverride.configureDefault', 'Configure Default'),
				run: async () => {
					// Show the picker and tell it to update the setting to whatever the user selected
					const picked = await this.doPickEditorOverride(currentEditor, options, group, true);
					if (!picked) {
						return;
					}
					const replacementEditor = await this.resolveEditorOverride(currentEditor, picked[0], picked[1] ?? group);
					if (replacementEditor === OverrideStatus.ABORT || replacementEditor === OverrideStatus.NONE) {
						return;
					}
					// Replace the current editor with the picked one
					(replacementEditor.group ?? picked[1] ?? group).replaceEditors([
						{
							editor: currentEditor,
							replacement: replacementEditor.editor,
							options: replacementEditor.options ?? picked[0],
						}
					]);
				}
			},
			{
				label: localize('editorOverride.keepDefault', 'Keep {0}', editorName),
				run: writeCurrentEditorsToStorage
			}
			]);
		// If the user pressed X we assume they want to keep the current editor as default
		const onCloseListener = handle.onDidClose(() => {
			writeCurrentEditorsToStorage();
			onCloseListener.dispose();
		});
	}

	private mapEditorsToQuickPickEntry(resource: URI, group: IEditorGroup, showDefaultPicker?: boolean) {
		const currentEditor = firstOrDefault(group.findEditors(resource)) as IRegisteredEditorInput | undefined;
		// If untitled, we want all registered editors
		let registeredEditors = resource.scheme === Schemas.untitled ? this._registeredEditors : this.findMatchingEditors(resource);
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
			const currentViewType = currentEditor?.viewType ?? DEFAULT_EDITOR_ASSOCIATION.id;
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
		if (!showDefaultPicker) {
			const separator: IQuickPickSeparator = { type: 'separator' };
			quickPickEntries.push(separator);
			const configureDefaultEntry = {
				id: EditorOverrideService.configureDefaultID,
				label: localize('promptOpenWith.configureDefault', "Configure default editor for '{0}'...", `*${extname(resource)}`),
			};
			quickPickEntries.push(configureDefaultEntry);
		}
		return quickPickEntries;
	}

	private async doPickEditorOverride(editor: IResourceEditorInputType, options: IEditorOptions | undefined, group: IEditorGroup, showDefaultPicker?: boolean): Promise<[IEditorOptions, IEditorGroup | undefined] | undefined> {

		type EditorOverridePick = {
			readonly item: IQuickPickItem;
			readonly keyMods?: IKeyMods;
			readonly openInBackground: boolean;
		};

		const resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });

		if (!resource) {
			return;
		}

		// Text editor has the lowest priority because we
		const editorOverridePicks = this.mapEditorsToQuickPickEntry(resource, group, showDefaultPicker);

		// Create editor override picker
		const editorOverridePicker = this.quickInputService.createQuickPick<IQuickPickItem>();
		const placeHolderMessage = showDefaultPicker ?
			localize('prompOpenWith.updateDefaultPlaceHolder', "Select new default editor for '{0}'", `*${extname(resource)}`) :
			localize('promptOpenWith.placeHolder', "Select editor for '{0}'", basename(resource));
		editorOverridePicker.placeholder = placeHolderMessage;
		editorOverridePicker.canAcceptInBackground = true;
		editorOverridePicker.items = editorOverridePicks;
		const firstItem = editorOverridePicker.items.find(item => item.type === 'item') as IQuickPickItem | undefined;
		if (firstItem) {
			editorOverridePicker.selectedItems = [firstItem];
		}

		// Prompt the user to select an override
		const picked: EditorOverridePick | undefined = await new Promise<EditorOverridePick | undefined>(resolve => {
			editorOverridePicker.onDidAccept(e => {
				let result: EditorOverridePick | undefined = undefined;

				if (editorOverridePicker.selectedItems.length === 1) {
					result = {
						item: editorOverridePicker.selectedItems[0],
						keyMods: editorOverridePicker.keyMods,
						openInBackground: e.inBackground
					};
				}

				// If asked to always update the setting then update it even if the gear isn't clicked
				if (showDefaultPicker && result?.item.id) {
					this.updateUserAssociations(`*${extname(resource)}`, result.item.id,);
				}

				resolve(result);
			});

			editorOverridePicker.onDidTriggerItemButton(e => {

				// Trigger opening and close picker
				resolve({ item: e.item, openInBackground: false });

				// Persist setting
				if (resource && e.item && e.item.id) {
					this.updateUserAssociations(`*${extname(resource)}`, e.item.id,);
				}
			});

			editorOverridePicker.show();
		});

		// Close picker
		editorOverridePicker.dispose();

		// If the user picked an override, look at how the picker was
		// used (e.g. modifier keys, open in background) and create the
		// options and group to use accordingly
		if (picked) {

			// If the user selected to configure default we trigger this picker again and tell it to show the default picker
			if (picked.item.id === EditorOverrideService.configureDefaultID) {
				return this.doPickEditorOverride(editor, options, group, true);
			}

			// Figure out target group
			let targetGroup: IEditorGroup | undefined;
			if (picked.keyMods?.alt || picked.keyMods?.ctrlCmd) {
				const direction = preferredSideBySideGroupDirection(this.configurationService);
				targetGroup = this.editorGroupService.findGroup({ direction }, group.id);
				targetGroup = targetGroup ?? this.editorGroupService.addGroup(group, direction);
			}

			// Figure out options
			const targetOptions: IEditorOptions = {
				...options,
				override: picked.item.id,
				preserveFocus: picked.openInBackground || options?.preserveFocus,
			};

			return [targetOptions, targetGroup];
		}

		return undefined;
	}

	private sendOverrideTelemetry(chosenInput: IRegisteredEditorInput): void {
		type editorOverrideClassification = {
			viewType: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
		};
		type editorOverrideEvent = {
			viewType: string
		};
		if (chosenInput.viewType) {
			this.telemetryService.publicLog2<editorOverrideEvent, editorOverrideClassification>('override.viewType', { viewType: chosenInput.viewType });
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
		this.storageService.store(EditorOverrideService.overrideCacheStorageID, JSON.stringify(Array.from(cacheStorage)), StorageScope.GLOBAL, StorageTarget.MACHINE);
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

registerSingleton(IEditorOverrideService, EditorOverrideService);
