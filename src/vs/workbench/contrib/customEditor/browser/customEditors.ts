/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/customEditor.css';
import { coalesce } from '../../../../base/common/arrays.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { extname, isEqual } from '../../../../base/common/resources.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { RedoCommand, UndoCommand } from '../../../../editor/browser/editorExtensions.js';
import { ITextResourceConfigurationChangeEvent, ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { FileOperation, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorExtensions, GroupIdentifier, IEditorFactoryRegistry, IResourceDiffEditorInput } from '../../../common/editor.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ActiveCustomEditorDiffCanToggleLayoutContext, ActiveCustomEditorTextDiffContext } from '../../../common/contextkeys.js';
import { CONTEXT_ACTIVE_CUSTOM_EDITOR_ID, CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE, CustomEditorCapabilities, CustomEditorDiffEditorLayout, CustomEditorInfo, CustomEditorInfoCollection, ICustomEditorModelManager, ICustomEditorService } from '../common/customEditor.js';
import { CustomEditorModelManager } from '../common/customEditorModelManager.js';
import { IEditorGroup, IEditorGroupContextKeyProvider, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService, IEditorType, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IEditorService, IUntypedEditorReplacement } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ContributedCustomEditors } from '../common/contributedCustomEditors.js';
import { CustomEditorDiffInput, CustomEditorSideBySideDiffInput } from './customEditorDiffInput.js';
import { CustomEditorInput } from './customEditorInput.js';

interface CustomEditorDiffInputInfo {
	readonly viewType: string;
	readonly originalResource: URI;
	readonly modifiedResource: URI;
	readonly layout: CustomEditorDiffEditorLayout;
}

type CustomEditorUndoRedoInput = CustomEditorInput | CustomEditorDiffInput | CustomEditorSideBySideDiffInput;

export class CustomEditorService extends Disposable implements ICustomEditorService {
	_serviceBrand: any;

	private readonly _contributedEditors: ContributedCustomEditors;
	private _untitledCounter = 0;
	private readonly _editorResolverDisposables = this._register(new DisposableStore());
	private readonly _editorCapabilities = new Map<string, CustomEditorCapabilities>();

	private readonly _models: ICustomEditorModelManager;

	private readonly _onDidChangeEditorTypes = this._register(new Emitter<void>());
	public readonly onDidChangeEditorTypes: Event<void> = this._onDidChangeEditorTypes.event;

	private readonly _fileEditorFactory = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).getFileEditorFactory();

	constructor(
		@IFileService fileService: IFileService,
		@IStorageService storageService: IStorageService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@ITextResourceConfigurationService private readonly textResourceConfigurationService: ITextResourceConfigurationService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		super();

		this._models = new CustomEditorModelManager();

		this._contributedEditors = this._register(new ContributedCustomEditors(storageService));
		// Register the contribution points only emitting one change from the resolver
		this.editorResolverService.bufferChangeEvents(this.registerContributionPoints.bind(this));

		this._register(this._contributedEditors.onChange(() => {
			// Register the contribution points only emitting one change from the resolver
			this.editorResolverService.bufferChangeEvents(this.registerContributionPoints.bind(this));
			this._onDidChangeEditorTypes.fire();
		}));

		// Register group context key providers.
		// These set the context keys for each editor group and the global context
		const activeCustomEditorContextKeyProvider: IEditorGroupContextKeyProvider<string> = {
			contextKey: CONTEXT_ACTIVE_CUSTOM_EDITOR_ID,
			getGroupContextKeyValue: group => this.getActiveCustomEditorId(group),
			onDidChange: this.onDidChangeEditorTypes
		};

		const customEditorIsEditableContextKeyProvider: IEditorGroupContextKeyProvider<boolean> = {
			contextKey: CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE,
			getGroupContextKeyValue: group => this.getCustomEditorIsEditable(group),
			onDidChange: this.onDidChangeEditorTypes
		};

		const customEditorDiffCanToggleLayoutContextKeyProvider: IEditorGroupContextKeyProvider<boolean> = {
			contextKey: ActiveCustomEditorDiffCanToggleLayoutContext,
			getGroupContextKeyValue: group => this.getActiveCustomEditorDiffCanToggleLayout(group),
			onDidChange: this.onDidChangeEditorTypes
		};

		const customEditorTextDiffContextKeyProvider: IEditorGroupContextKeyProvider<boolean> = {
			contextKey: ActiveCustomEditorTextDiffContext,
			getGroupContextKeyValue: group => this.getActiveCustomEditorTextDiff(group),
			onDidChange: this.onDidChangeEditorTypes
		};

		this._register(this.editorGroupService.registerContextKeyProvider(activeCustomEditorContextKeyProvider));
		this._register(this.editorGroupService.registerContextKeyProvider(customEditorIsEditableContextKeyProvider));
		this._register(this.editorGroupService.registerContextKeyProvider(customEditorDiffCanToggleLayoutContextKeyProvider));
		this._register(this.editorGroupService.registerContextKeyProvider(customEditorTextDiffContextKeyProvider));

		this._register(this.textResourceConfigurationService.onDidChangeConfiguration(e => {
			void this.updateCustomDiffEditorsForDiffConfigurationChange(e);
		}));

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
	}

	getEditorTypes(): IEditorType[] {
		return [...this._contributedEditors];
	}

	private withActiveCustomEditor(f: (editor: CustomEditorUndoRedoInput) => void | Promise<void>): boolean | Promise<void> {
		const editor = this.getActiveCustomEditorUndoRedoInput();
		if (editor) {
			const result = f(editor);
			if (result) {
				return result;
			}
			return true;
		}
		return false;
	}

	private getActiveCustomEditorUndoRedoInput(): CustomEditorUndoRedoInput | undefined {
		const activeEditor = this.editorService.activeEditor;
		if (activeEditor instanceof CustomEditorInput || activeEditor instanceof CustomEditorDiffInput || activeEditor instanceof CustomEditorSideBySideDiffInput) {
			return activeEditor;
		}
		if (activeEditor instanceof DiffEditorInput && activeEditor.modified instanceof CustomEditorSideBySideDiffInput) {
			return activeEditor.modified;
		}
		return undefined;
	}

	private registerContributionPoints(): void {
		// Clear all previous contributions we know
		this._editorResolverDisposables.clear();

		for (const contributedEditor of this._contributedEditors) {
			for (const globPattern of contributedEditor.selector) {
				if (!globPattern.filenamePattern) {
					continue;
				}

				this._editorResolverDisposables.add(this.editorResolverService.registerEditor(
					globPattern.filenamePattern,
					{
						id: contributedEditor.id,
						label: contributedEditor.displayName,
						detail: contributedEditor.providerDisplayName,
						priority: contributedEditor.priority,
					},
					{
						singlePerResource: () => !(this.getCustomEditorCapabilities(contributedEditor.id)?.supportsMultipleEditorsPerDocument ?? false)
					},
					{
						createEditorInput: ({ resource, label }, group) => {
							return { editor: CustomEditorInput.create(this.instantiationService, { resource, viewType: contributedEditor.id, webviewTitle: undefined, preferredName: label, iconPath: undefined }, group.id) };
						},
						createUntitledEditorInput: ({ resource }, group) => {
							return { editor: CustomEditorInput.create(this.instantiationService, { resource: resource ?? URI.from({ scheme: Schemas.untitled, authority: `Untitled-${this._untitledCounter++}` }), viewType: contributedEditor.id, webviewTitle: undefined, preferredName: undefined, iconPath: undefined }, group.id) };
						},
						createDiffEditorInput: async (diffEditorInput, group) => {
							await this.extensionService.activateByEvent(`onCustomEditor:${contributedEditor.id}`);
							return { editor: this.createDiffEditorInput(diffEditorInput, contributedEditor, group) };
						},
					}
				));
			}
		}
	}

	private createDiffEditorInput(
		editor: IResourceDiffEditorInput,
		contributedEditor: CustomEditorInfo,
		group: IEditorGroup,
	): EditorInput {
		const originalResource = assertReturnsDefined(editor.original.resource);
		const modifiedResource = assertReturnsDefined(editor.modified.resource);
		const diffEditorLayout = this.getDiffEditorLayout(contributedEditor, modifiedResource);

		if (diffEditorLayout === CustomEditorDiffEditorLayout.Inline) {
			return CustomEditorDiffInput.create(this.instantiationService, {
				originalResource,
				modifiedResource,
				viewType: contributedEditor.id,
				label: editor.label,
				description: editor.description,
				iconPath: undefined
			}, group);
		}

		if (diffEditorLayout === CustomEditorDiffEditorLayout.SideBySide) {
			const diffId = generateUuid();
			const originalOverride = CustomEditorSideBySideDiffInput.create(this.instantiationService, {
				originalResource,
				modifiedResource,
				viewType: contributedEditor.id,
				diffId,
				side: 'original',
				label: editor.label,
				description: editor.description,
				iconPath: undefined
			}, group);
			const modifiedOverride = CustomEditorSideBySideDiffInput.create(this.instantiationService, {
				originalResource,
				modifiedResource,
				viewType: contributedEditor.id,
				diffId,
				side: 'modified',
				label: editor.label,
				description: editor.description,
				iconPath: undefined
			}, group);
			return this.instantiationService.createInstance(DiffEditorInput, editor.label, editor.description, originalOverride, modifiedOverride, true);
		}

		const modifiedOverride = CustomEditorInput.create(this.instantiationService, { resource: modifiedResource, viewType: contributedEditor.id, webviewTitle: undefined, preferredName: undefined, iconPath: undefined }, group.id, { customClasses: 'modified' });
		const originalOverride = CustomEditorInput.create(this.instantiationService, { resource: originalResource, viewType: contributedEditor.id, webviewTitle: undefined, preferredName: undefined, iconPath: undefined }, group.id, { customClasses: 'original' });
		return this.instantiationService.createInstance(DiffEditorInput, editor.label, editor.description, originalOverride, modifiedOverride, true);
	}

	private getDiffEditorLayout(contributedEditor: CustomEditorInfo, modifiedResource: URI): CustomEditorDiffEditorLayout | undefined {
		const capabilities = this.getCustomEditorCapabilities(contributedEditor.id);
		const supportsInlineDiff = capabilities?.supportsInlineDiff === true;
		const supportsSideBySideDiff = capabilities?.supportsSideBySideDiff === true;

		if (supportsInlineDiff && supportsSideBySideDiff) {
			return this.textResourceConfigurationService.getValue<boolean>(modifiedResource, 'diffEditor.renderSideBySide') ? CustomEditorDiffEditorLayout.SideBySide : CustomEditorDiffEditorLayout.Inline;
		}

		return supportsInlineDiff ? CustomEditorDiffEditorLayout.Inline : supportsSideBySideDiff ? CustomEditorDiffEditorLayout.SideBySide : undefined;
	}

	private async updateCustomDiffEditorsForDiffConfigurationChange(e: ITextResourceConfigurationChangeEvent): Promise<void> {
		for (const group of this.editorGroupService.groups) {
			const replacements: IUntypedEditorReplacement[] = [];
			for (const editor of group.editors) {
				const diffInfo = this.getCustomEditorDiffInputInfo(editor);
				const contributedEditor = diffInfo ? this._contributedEditors.get(diffInfo.viewType) : undefined;
				if (!diffInfo
					|| !contributedEditor
					|| !e.affectsConfiguration(diffInfo.modifiedResource, 'diffEditor.renderSideBySide')
					|| !this.getCustomEditorCapabilities(contributedEditor.id)?.supportsInlineDiff
					|| !this.getCustomEditorCapabilities(contributedEditor.id)?.supportsSideBySideDiff
					|| this.getDiffEditorLayout(contributedEditor, diffInfo.modifiedResource) === diffInfo.layout) {
					continue;
				}

				replacements.push({
					editor,
					replacement: {
						original: { resource: diffInfo.originalResource },
						modified: { resource: diffInfo.modifiedResource },
						label: editor.getName(),
						description: editor.getDescription(),
						options: {
							override: diffInfo.viewType,
							pinned: group.isPinned(editor),
							sticky: group.isSticky(editor),
							preserveFocus: group.activeEditor !== editor,
						}
					}
				});
			}

			if (replacements.length) {
				await this.editorService.replaceEditors(replacements, group);
			}
		}
	}

	private getCustomEditorDiffInputInfo(input: EditorInput | undefined): CustomEditorDiffInputInfo | undefined {
		if (input instanceof CustomEditorDiffInput) {
			return {
				viewType: input.viewType,
				originalResource: input.originalResource,
				modifiedResource: input.modifiedResource,
				layout: CustomEditorDiffEditorLayout.Inline,
			};
		}

		if (input instanceof DiffEditorInput
			&& input.original instanceof CustomEditorSideBySideDiffInput
			&& input.modified instanceof CustomEditorSideBySideDiffInput
			&& input.original.side === 'original'
			&& input.modified.side === 'modified'
			&& input.original.viewType === input.modified.viewType
			&& input.original.diffId === input.modified.diffId) {
			return {
				viewType: input.original.viewType,
				originalResource: input.original.originalResource,
				modifiedResource: input.original.modifiedResource,
				layout: CustomEditorDiffEditorLayout.SideBySide,
			};
		}

		return undefined;
	}

	public get models() { return this._models; }

	public getCustomEditor(viewType: string): CustomEditorInfo | undefined {
		return this._contributedEditors.get(viewType);
	}

	public getContributedCustomEditors(resource: URI): CustomEditorInfoCollection {
		return new CustomEditorInfoCollection(this._contributedEditors.getContributedEditors(resource));
	}

	public getUserConfiguredCustomEditors(resource: URI): CustomEditorInfoCollection {
		const resourceAssocations = this.editorResolverService.getAssociationsForResource(resource);
		return new CustomEditorInfoCollection(
			coalesce(resourceAssocations
				.map(association => this._contributedEditors.get(association.viewType))));
	}

	public getAllCustomEditors(resource: URI): CustomEditorInfoCollection {
		return new CustomEditorInfoCollection([
			...this.getUserConfiguredCustomEditors(resource).allEditors,
			...this.getContributedCustomEditors(resource).allEditors,
		]);
	}

	public registerCustomEditorCapabilities(viewType: string, options: CustomEditorCapabilities): IDisposable {
		if (this._editorCapabilities.has(viewType)) {
			throw new Error(`Capabilities for ${viewType} already set`);
		}
		this._editorCapabilities.set(viewType, options);
		this._onDidChangeEditorTypes.fire();
		return toDisposable(() => {
			this._editorCapabilities.delete(viewType);
			this._onDidChangeEditorTypes.fire();
		});
	}

	public getCustomEditorCapabilities(viewType: string): CustomEditorCapabilities | undefined {
		return this._editorCapabilities.get(viewType);
	}

	private getActiveCustomEditorId(group: IEditorGroup): string {
		const activeEditorPane = group.activeEditorPane;
		const input = activeEditorPane?.input;
		const diffInfo = this.getCustomEditorDiffInputInfo(input);
		if (diffInfo) {
			return diffInfo.viewType;
		}

		return input instanceof CustomEditorInput && input.resource ? input.viewType : '';
	}

	private getActiveCustomEditorDiffCanToggleLayout(group: IEditorGroup): boolean {
		const diffInfo = this.getCustomEditorDiffInputInfo(group.activeEditorPane?.input);
		const capabilities = diffInfo ? this.getCustomEditorCapabilities(diffInfo.viewType) : undefined;
		return capabilities?.supportsInlineDiff === true && capabilities.supportsSideBySideDiff === true;
	}

	private getActiveCustomEditorTextDiff(group: IEditorGroup): boolean {
		const diffInfo = this.getCustomEditorDiffInputInfo(group.activeEditorPane?.input);
		return !!diffInfo && this.getCustomEditorCapabilities(diffInfo.viewType)?.isTextEditor === true;
	}

	private getCustomEditorIsEditable(group: IEditorGroup): boolean {
		const activeEditorPane = group.activeEditorPane;
		const resource = activeEditorPane?.input?.resource;
		if (!resource) {
			return false;
		}

		return activeEditorPane?.input instanceof CustomEditorInput;
	}

	private async handleMovedFileInOpenedFileEditors(oldResource: URI, newResource: URI): Promise<void> {
		if (extname(oldResource).toLowerCase() === extname(newResource).toLowerCase()) {
			return;
		}

		const possibleEditors = this.getAllCustomEditors(newResource);

		// See if we have any non-optional custom editor for this resource
		if (!possibleEditors.allEditors.some(editor => editor.priority !== RegisteredEditorPriority.option)) {
			return;
		}

		// If so, check all editors to see if there are any file editors open for the new resource
		const editorsToReplace = new Map<GroupIdentifier, EditorInput[]>();
		for (const group of this.editorGroupService.groups) {
			for (const editor of group.editors) {
				if (this._fileEditorFactory.isFileEditor(editor)
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
				let replacement: EditorInput | IResourceEditorInput;
				if (possibleEditors.defaultEditor) {
					const viewType = possibleEditors.defaultEditor.id;
					replacement = CustomEditorInput.create(this.instantiationService, { resource: newResource, viewType, webviewTitle: undefined, preferredName: undefined, iconPath: undefined }, group);
				} else {
					replacement = { resource: newResource, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
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
}
