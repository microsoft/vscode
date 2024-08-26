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
import { assertIsDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { RedoCommand, UndoCommand } from '../../../../editor/browser/editorExtensions.js';
import { IResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { FileOperation, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorExtensions, GroupIdentifier, IEditorFactoryRegistry, IResourceDiffEditorInput } from '../../../common/editor.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { CONTEXT_ACTIVE_CUSTOM_EDITOR_ID, CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE, CustomEditorCapabilities, CustomEditorInfo, CustomEditorInfoCollection, ICustomEditorModelManager, ICustomEditorService } from '../common/customEditor.js';
import { CustomEditorModelManager } from '../common/customEditorModelManager.js';
import { IEditorGroup, IEditorGroupContextKeyProvider, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService, IEditorType, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ContributedCustomEditors } from '../common/contributedCustomEditors.js';
import { CustomEditorInput } from './customEditorInput.js';

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
	) {
		super();

		this._models = new CustomEditorModelManager(this.uriIdentityService);

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

		this._register(this.editorGroupService.registerContextKeyProvider(activeCustomEditorContextKeyProvider));
		this._register(this.editorGroupService.registerContextKeyProvider(customEditorIsEditableContextKeyProvider));

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
						createEditorInput: ({ resource }, group) => {
							return { editor: CustomEditorInput.create(this.instantiationService, resource, contributedEditor.id, group.id) };
						},
						createUntitledEditorInput: ({ resource }, group) => {
							return { editor: CustomEditorInput.create(this.instantiationService, resource ?? URI.from({ scheme: Schemas.untitled, authority: `Untitled-${this._untitledCounter++}` }), contributedEditor.id, group.id) };
						},
						createDiffEditorInput: (diffEditorInput, group) => {
							return { editor: this.createDiffEditorInput(diffEditorInput, contributedEditor.id, group) };
						},
					}
				));
			}
		}
	}

	private createDiffEditorInput(
		editor: IResourceDiffEditorInput,
		editorID: string,
		group: IEditorGroup
	): DiffEditorInput {
		const modifiedOverride = CustomEditorInput.create(this.instantiationService, assertIsDefined(editor.modified.resource), editorID, group.id, { customClasses: 'modified' });
		const originalOverride = CustomEditorInput.create(this.instantiationService, assertIsDefined(editor.original.resource), editorID, group.id, { customClasses: 'original' });
		return this.instantiationService.createInstance(DiffEditorInput, editor.label, editor.description, originalOverride, modifiedOverride, true);
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
		return toDisposable(() => {
			this._editorCapabilities.delete(viewType);
		});
	}

	public getCustomEditorCapabilities(viewType: string): CustomEditorCapabilities | undefined {
		return this._editorCapabilities.get(viewType);
	}

	private getActiveCustomEditorId(group: IEditorGroup): string {
		const activeEditorPane = group.activeEditorPane;
		const resource = activeEditorPane?.input?.resource;
		if (!resource) {
			return '';
		}

		return activeEditorPane?.input instanceof CustomEditorInput ? activeEditorPane.input.viewType : '';
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
					replacement = CustomEditorInput.create(this.instantiationService, newResource, viewType, group);
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
