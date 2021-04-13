/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, distinct, firstOrDefault } from 'vs/base/common/arrays';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { extname, isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { RedoCommand, UndoCommand } from 'vs/editor/browser/editorExtensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorActivation, EditorOverride, IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { FileOperation, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService } from 'vs/platform/storage/common/storage';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { EditorsAssociations, editorsAssociationsSettingId, Extensions as EditorExtensions, IEditorAssociationsRegistry, IEditorType, IEditorTypesHandler } from 'vs/workbench/browser/editor';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { EditorInput, EditorOptions, Extensions as EditorInputExtensions, GroupIdentifier, IEditorInput, IEditorInputFactoryRegistry, IEditorPane } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { CONTEXT_ACTIVE_CUSTOM_EDITOR_ID, CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE, CustomEditorCapabilities, CustomEditorInfo, CustomEditorInfoCollection, CustomEditorPriority, ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { CustomEditorModelManager } from 'vs/workbench/contrib/customEditor/common/customEditorModelManager';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, IOpenEditorOverride, IOpenEditorOverrideEntry } from 'vs/workbench/services/editor/common/editorService';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { ContributedCustomEditors, defaultCustomEditor } from '../common/contributedCustomEditors';
import { CustomEditorInput } from './customEditorInput';

export class CustomEditorService extends Disposable implements ICustomEditorService, IEditorTypesHandler {
	_serviceBrand: any;

	private readonly _contributedEditors: ContributedCustomEditors;
	private readonly _editorCapabilities = new Map<string, CustomEditorCapabilities>();

	private readonly _models = new CustomEditorModelManager();

	private readonly _activeCustomEditorId: IContextKey<string>;
	private readonly _focusedCustomEditorIsEditable: IContextKey<boolean>;

	private readonly _onDidChangeEditorTypes = this._register(new Emitter<void>());
	public readonly onDidChangeEditorTypes: Event<void> = this._onDidChangeEditorTypes.event;

	private readonly _fileEditorInputFactory = Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).getFileEditorInputFactory();

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IFileService fileService: IFileService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super();

		this._activeCustomEditorId = CONTEXT_ACTIVE_CUSTOM_EDITOR_ID.bindTo(contextKeyService);
		this._focusedCustomEditorIsEditable = CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE.bindTo(contextKeyService);

		this._contributedEditors = this._register(new ContributedCustomEditors(storageService));
		this._register(this._contributedEditors.onChange(() => {
			this.updateContexts();
			this._onDidChangeEditorTypes.fire();
		}));
		this._register(Registry.as<IEditorAssociationsRegistry>(EditorExtensions.Associations).registerEditorTypesHandler('Custom Editor', this));
		this._register(this.editorService.onDidActiveEditorChange(() => this.updateContexts()));

		this._register(fileService.onDidRunOperation(e => {
			if (e.isOperation(FileOperation.MOVE)) {
				this.handleMovedFileInOpenedFileEditors(e.resource, this.uriIdentityService.asCanonicalUri(e.target.resource));
			}
		}));

		const PRIORITY = 105;
		this._register(UndoCommand.addImplementation(PRIORITY, 'custom-editor', () => {
			return this.withActiveCustomEditor(editor => editor.undo());
		}));
		this._register(RedoCommand.addImplementation(PRIORITY, 'custom-editor', () => {
			return this.withActiveCustomEditor(editor => editor.redo());
		}));

		this.updateContexts();
	}

	getEditorTypes(): IEditorType[] {
		return [...this._contributedEditors];
	}

	private withActiveCustomEditor(f: (editor: CustomEditorInput) => void | Promise<void>): boolean | Promise<void> {
		const activeEditor = this.editorService.activeEditor;
		if (activeEditor instanceof CustomEditorInput) {
			const result = f(activeEditor);
			if (result) {
				return result;
			}
			return true;
		}
		return false;
	}

	public get models() { return this._models; }

	public getCustomEditor(viewType: string): CustomEditorInfo | undefined {
		return this._contributedEditors.get(viewType);
	}

	public getContributedCustomEditors(resource: URI): CustomEditorInfoCollection {
		return new CustomEditorInfoCollection(this._contributedEditors.getContributedEditors(resource));
	}

	public getUserConfiguredCustomEditors(resource: URI): CustomEditorInfoCollection {
		const rawAssociations = this.configurationService.getValue<EditorsAssociations>(editorsAssociationsSettingId) || [];
		return new CustomEditorInfoCollection(
			coalesce(rawAssociations
				.filter(association => CustomEditorInfo.selectorMatches(association, resource))
				.map(association => this._contributedEditors.get(association.viewType))));
	}

	public getAllCustomEditors(resource: URI): CustomEditorInfoCollection {
		return new CustomEditorInfoCollection([
			...this.getUserConfiguredCustomEditors(resource).allEditors,
			...this.getContributedCustomEditors(resource).allEditors,
		]);
	}

	public async openWith(
		resource: URI,
		viewType: string,
		options?: ITextEditorOptions,
		group?: IEditorGroup,
	): Promise<IEditorPane | undefined> {
		if (viewType === defaultCustomEditor.id) {
			const fileEditorInput = this.editorService.createEditorInput({ resource, forceFile: true });
			return this.openEditorForResource(resource, fileEditorInput, { ...options, override: EditorOverride.DISABLED }, group);
		}

		if (!this._contributedEditors.get(viewType)) {
			// Prompt the user
			return this.editorService.openEditor({ resource, options: { override: EditorOverride.PICK } });
		}

		const capabilities = this.getCustomEditorCapabilities(viewType) || {};
		if (!capabilities.supportsMultipleEditorsPerDocument) {
			const movedEditor = await this.tryRevealExistingEditorForResourceInGroup(resource, viewType, options, group);
			if (movedEditor) {
				return movedEditor;
			}
		}

		const input = CustomEditorInput.create(this.instantiationService, resource, viewType, group?.id);
		return this.openEditorForResource(resource, input, options, group);
	}

	private async openEditorForResource(
		resource: URI,
		input: IEditorInput,
		options?: IEditorOptions,
		group?: IEditorGroup
	): Promise<IEditorPane | undefined> {
		const targetGroup = group || this.editorGroupService.activeGroup;

		if (options && typeof options.activation === 'undefined') {
			options = { ...options, activation: options.preserveFocus ? EditorActivation.RESTORE : undefined };
		}

		// Try to replace existing editors for resource
		const existing = firstOrDefault(this.editorService.findEditors(resource, targetGroup));
		if (existing) {
			if (!input.matches(existing)) {
				await this.editorService.replaceEditors([{
					editor: existing,
					replacement: input,
					forceReplaceDirty: existing.resource?.scheme === Schemas.untitled,
					options: options ? EditorOptions.create(options) : undefined,
				}], targetGroup);

				if (existing instanceof CustomEditorInput) {
					existing.dispose();
				}
			}
		}

		return this.editorService.openEditor(input, options, group);
	}

	public registerCustomEditorCapabilities(viewType: string, options: CustomEditorCapabilities): IDisposable {
		if (this._editorCapabilities.has(viewType)) {
			throw new Error(`Capabilities for ${viewType} already set`);
		}
		this._editorCapabilities.set(viewType, options);
		return toDisposable(() => {
			this._editorCapabilities.delete(viewType);
		});
	}

	public getCustomEditorCapabilities(viewType: string): CustomEditorCapabilities | undefined {
		return this._editorCapabilities.get(viewType);
	}

	private updateContexts() {
		const activeEditorPane = this.editorService.activeEditorPane;
		const resource = activeEditorPane?.input?.resource;
		if (!resource) {
			this._activeCustomEditorId.reset();
			this._focusedCustomEditorIsEditable.reset();
			return;
		}

		this._activeCustomEditorId.set(activeEditorPane?.input instanceof CustomEditorInput ? activeEditorPane.input.viewType : '');
		this._focusedCustomEditorIsEditable.set(activeEditorPane?.input instanceof CustomEditorInput);
	}

	private async handleMovedFileInOpenedFileEditors(oldResource: URI, newResource: URI): Promise<void> {
		if (extname(oldResource).toLowerCase() === extname(newResource).toLowerCase()) {
			return;
		}

		const possibleEditors = this.getAllCustomEditors(newResource);

		// See if we have any non-optional custom editor for this resource
		if (!possibleEditors.allEditors.some(editor => editor.priority !== CustomEditorPriority.option)) {
			return;
		}

		// If so, check all editors to see if there are any file editors open for the new resource
		const editorsToReplace = new Map<GroupIdentifier, IEditorInput[]>();
		for (const group of this.editorGroupService.groups) {
			for (const editor of group.editors) {
				if (this._fileEditorInputFactory.isFileEditorInput(editor)
					&& !(editor instanceof CustomEditorInput)
					&& isEqual(editor.resource, newResource)
				) {
					let entry = editorsToReplace.get(group.id);
					if (!entry) {
						entry = [];
						editorsToReplace.set(group.id, entry);
					}
					entry.push(editor);
				}
			}
		}

		if (!editorsToReplace.size) {
			return;
		}

		for (const [group, entries] of editorsToReplace) {
			this.editorService.replaceEditors(entries.map(editor => {
				let replacement: IEditorInput;
				if (possibleEditors.defaultEditor) {
					const viewType = possibleEditors.defaultEditor.id;
					replacement = CustomEditorInput.create(this.instantiationService, newResource, viewType!, group);
				} else {
					replacement = this.editorService.createEditorInput({ resource: newResource });
				}

				return {
					editor,
					replacement,
					options: {
						preserveFocus: true,
					}
				};
			}), group);
		}
	}

	private async tryRevealExistingEditorForResourceInGroup(
		resource: URI,
		viewType: string,
		options?: ITextEditorOptions,
		group?: IEditorGroup,
	): Promise<IEditorPane | undefined> {
		const editorInfoForResource = this.findExistingEditorsForResource(resource, viewType);
		if (!editorInfoForResource.length) {
			return undefined;
		}

		const editorToUse = editorInfoForResource[0];

		// Replace all other editors
		for (const { editor, group } of editorInfoForResource) {
			if (editor !== editorToUse.editor) {
				group.closeEditor(editor);
			}
		}

		const targetGroup = group || this.editorGroupService.activeGroup;
		const newEditor = await this.openEditorForResource(resource, editorToUse.editor, { ...options, override: EditorOverride.DISABLED }, targetGroup);
		if (targetGroup.id !== editorToUse.group.id) {
			editorToUse.group.closeEditor(editorToUse.editor);
		}
		return newEditor;
	}

	private findExistingEditorsForResource(
		resource: URI,
		viewType: string,
	): Array<{ editor: IEditorInput, group: IEditorGroup }> {
		const out: Array<{ editor: IEditorInput, group: IEditorGroup }> = [];
		const orderedGroups = distinct([
			this.editorGroupService.activeGroup,
			...this.editorGroupService.groups,
		]);

		for (const group of orderedGroups) {
			for (const editor of group.editors) {
				if (isMatchingCustomEditor(editor, viewType, resource)) {
					out.push({ editor, group });
				}
			}
		}
		return out;
	}
}

export class CustomEditorContribution extends Disposable implements IWorkbenchContribution {

	private readonly _fileEditorInputFactory = Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).getFileEditorInputFactory();

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ICustomEditorService private readonly customEditorService: ICustomEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this._register(this.editorService.overrideOpenEditor({
			open: (editor, options, group) => {
				return this.onEditorOpening(editor, options, group);
			},
			getEditorOverrides: (resource: URI, options: IEditorOptions | undefined, group: IEditorGroup | undefined): IOpenEditorOverrideEntry[] => {
				const currentEditor = group && firstOrDefault(this.editorService.findEditors(resource, group));

				const toOverride = (entry: CustomEditorInfo): IOpenEditorOverrideEntry => {
					return {
						id: entry.id,
						active: currentEditor instanceof CustomEditorInput && currentEditor.viewType === entry.id,
						label: entry.displayName,
						detail: entry.providerDisplayName,
					};
				};

				if (typeof options?.override === 'string') {
					// A specific override was requested. Only return it.
					const matchingEditor = this.customEditorService.getCustomEditor(options.override);
					return matchingEditor ? [toOverride(matchingEditor)] : [];
				}

				// Otherwise, return all potential overrides.
				const customEditors = this.customEditorService.getAllCustomEditors(resource);
				if (!customEditors.length) {
					return [];
				}

				return customEditors.allEditors
					.filter(entry => entry.id !== defaultCustomEditor.id)
					.map(toOverride);
			}
		}));
	}

	private onEditorOpening(
		editor: IEditorInput,
		options: ITextEditorOptions | undefined,
		group: IEditorGroup
	): IOpenEditorOverride | undefined {
		const id = typeof options?.override === 'string' ? options.override : undefined;
		if (editor instanceof CustomEditorInput) {
			if (editor.group === group.id && (editor.viewType === id || typeof id !== 'string')) {
				// No need to do anything
				return undefined;
			} else {
				// Create a copy of the input.
				// Unlike normal editor inputs, we do not want to share custom editor inputs
				// between multiple editors / groups.
				return {
					override: this.customEditorService.openWith(editor.resource, id ?? editor.viewType, options, group)
				};
			}
		}

		if (editor instanceof DiffEditorInput) {
			return this.onDiffEditorOpening(editor, options, group);
		}

		const resource = editor.resource;
		if (!resource) {
			return undefined;
		}

		if (id) {
			return {
				override: this.customEditorService.openWith(resource, id, { ...options, override: EditorOverride.DISABLED }, group)
			};
		}

		return this.onResourceEditorOpening(resource, editor, options, group);
	}

	private onResourceEditorOpening(
		resource: URI,
		editor: IEditorInput,
		options: ITextEditorOptions | undefined,
		group: IEditorGroup,
	): IOpenEditorOverride | undefined {
		const userConfiguredEditors = this.customEditorService.getUserConfiguredCustomEditors(resource);
		const contributedEditors = this.customEditorService.getContributedCustomEditors(resource);
		if (!userConfiguredEditors.length && !contributedEditors.length) {
			return;
		}

		// Check to see if there already an editor for the resource in the group.
		// If there is, we want to open that instead of creating a new editor.
		// This ensures that we preserve whatever type of editor was previously being used
		// when the user switches back to it.
		const strictMatchEditorInput = group.editors.find(e => e === editor && !this._fileEditorInputFactory.isFileEditorInput(e));
		if (strictMatchEditorInput) {
			return;
		}

		const existingEditorForResource = firstOrDefault(this.editorService.findEditors(resource, group));
		if (existingEditorForResource) {
			if (editor === existingEditorForResource) {
				return;
			}

			return {
				override: this.editorService.openEditor(existingEditorForResource, {
					...options,
					override: EditorOverride.DISABLED,
					activation: options?.preserveFocus ? EditorActivation.RESTORE : undefined,
				}, group)
			};
		}

		if (userConfiguredEditors.length) {
			return {
				override: this.customEditorService.openWith(resource, userConfiguredEditors.allEditors[0].id, options, group),
			};
		}

		if (!contributedEditors.length) {
			return;
		}

		const defaultEditor = contributedEditors.defaultEditor;
		if (defaultEditor) {
			return {
				override: this.customEditorService.openWith(resource, defaultEditor.id, options, group),
			};
		}

		// If we have all optional editors, then open VS Code's standard editor
		if (contributedEditors.allEditors.every(editor => editor.priority === CustomEditorPriority.option)) {
			return;
		}

		// Open VS Code's standard editor but prompt user to see if they wish to use a custom one instead
		return {
			override: (async () => {
				const standardEditor = await this.editorService.openEditor(editor, { ...options, override: EditorOverride.DISABLED }, group);
				if (!standardEditor?.input) {
					return;
				}

				// Give a moment to make sure the editor is showing.
				// Otherwise the focus shift can cause the prompt to be dismissed right away.
				await new Promise(resolve => setTimeout(resolve, 20));

				// Prompt the user
				return this.editorService.openEditor(standardEditor.input, { override: EditorOverride.PICK });
			})()
		};
	}

	private onDiffEditorOpening(
		editor: DiffEditorInput,
		options: ITextEditorOptions | undefined,
		group: IEditorGroup
	): IOpenEditorOverride | undefined {
		const getBestAvailableEditorForSubInput = (subInput: IEditorInput): CustomEditorInfo | undefined => {
			if (subInput instanceof CustomEditorInput) {
				return undefined;
			}
			const resource = subInput.resource;
			if (!resource) {
				return undefined;
			}

			// Prefer default editors in the diff editor case but ultimately always take the first editor
			const allEditors = new CustomEditorInfoCollection([
				...this.customEditorService.getUserConfiguredCustomEditors(resource).allEditors,
				...this.customEditorService.getContributedCustomEditors(resource).allEditors.filter(x => x.priority !== CustomEditorPriority.option),
			]);
			return allEditors.bestAvailableEditor;
		};

		const createEditorForSubInput = (subInput: IEditorInput, editor: CustomEditorInfo | undefined, customClasses: string): EditorInput | undefined => {
			if (!editor) {
				return;
			}
			if (!subInput.resource) {
				return;
			}
			const input = CustomEditorInput.create(this.instantiationService, subInput.resource, editor.id, group.id, { customClasses });
			return input instanceof EditorInput ? input : undefined;
		};

		const modifiedEditorInfo = getBestAvailableEditorForSubInput(editor.modifiedInput);
		const originalEditorInfo = getBestAvailableEditorForSubInput(editor.originalInput);

		// If we are only using default editors, no need to override anything
		if (
			(!modifiedEditorInfo || modifiedEditorInfo.id === defaultCustomEditor.id) &&
			(!originalEditorInfo || originalEditorInfo.id === defaultCustomEditor.id)
		) {
			return undefined;
		}

		const modifiedOverride = createEditorForSubInput(editor.modifiedInput, modifiedEditorInfo, 'modified');
		const originalOverride = createEditorForSubInput(editor.originalInput, originalEditorInfo, 'original');
		if (modifiedOverride || originalOverride) {
			return {
				override: (async () => {
					const input = this.instantiationService.createInstance(DiffEditorInput, editor.getName(), editor.getDescription(), originalOverride || editor.originalInput, modifiedOverride || editor.modifiedInput, true);
					return this.editorService.openEditor(input, { ...options, override: EditorOverride.DISABLED }, group);
				})(),
			};
		}

		return undefined;
	}
}

function isMatchingCustomEditor(editor: IEditorInput, viewType: string, resource: URI): boolean {
	return editor instanceof CustomEditorInput
		&& editor.viewType === viewType
		&& isEqual(editor.resource, resource);
}

registerThemingParticipant((theme, collector) => {
	const shadow = theme.getColor(colorRegistry.scrollbarShadow);
	if (shadow) {
		collector.addRule(`.webview.modified { box-shadow: -6px 0 5px -5px ${shadow}; }`);
	}
});
