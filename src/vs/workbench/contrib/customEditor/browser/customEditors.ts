/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { extname, isEqual } from 'vs/base/common/resources';
import { assertIsDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { RedoCommand, UndoCommand } from 'vs/editor/browser/editorExtensions';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { FileOperation, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService } from 'vs/platform/storage/common/storage';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { DEFAULT_EDITOR_ASSOCIATION, EditorExtensions, GroupIdentifier, IEditorFactoryRegistry, IResourceDiffEditorInput } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { CONTEXT_ACTIVE_CUSTOM_EDITOR_ID, CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE, CustomEditorCapabilities, CustomEditorInfo, CustomEditorInfoCollection, ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { CustomEditorModelManager } from 'vs/workbench/contrib/customEditor/common/customEditorModelManager';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { DiffEditorInputFactoryFunction, EditorInputFactoryFunction, IEditorResolverService, IEditorType, RegisteredEditorPriority, UntitledEditorInputFactoryFunction } from 'vs/workbench/services/editor/common/editorResolverService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ContributedCustomEditors } from '../common/contributedCustomEditors';
import { CustomEditorInput } from './customEditorInput';

export class CustomEditorService extends Disposable implements ICustomEditorService {
	_serviceBrand: any;

	private readonly _contributedEditors: ContributedCustomEditors;
	private _untitledCounter = 0;
	private readonly _editorResolverDisposables = this._register(new DisposableStore());
	private readonly _editorCapabilities = new Map<string, CustomEditorCapabilities>();

	private readonly _models = new CustomEditorModelManager();

	private readonly _activeCustomEditorId: IContextKey<string>;
	private readonly _focusedCustomEditorIsEditable: IContextKey<boolean>;

	private readonly _onDidChangeEditorTypes = this._register(new Emitter<void>());
	public readonly onDidChangeEditorTypes: Event<void> = this._onDidChangeEditorTypes.event;

	private readonly _fileEditorFactory = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).getFileEditorFactory();

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IFileService fileService: IFileService,
		@IStorageService storageService: IStorageService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
	) {
		super();

		this._activeCustomEditorId = CONTEXT_ACTIVE_CUSTOM_EDITOR_ID.bindTo(contextKeyService);
		this._focusedCustomEditorIsEditable = CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE.bindTo(contextKeyService);

		this._contributedEditors = this._register(new ContributedCustomEditors(storageService));
		// Register the contribution points only emitting one change from the resolver
		this.editorResolverService.bufferChangeEvents(this.registerContributionPoints.bind(this));

		this._register(this._contributedEditors.onChange(() => {
			// Register the contribution points only emitting one change from the resolver
			this.editorResolverService.bufferChangeEvents(this.registerContributionPoints.bind(this));
			this.updateContexts();
			this._onDidChangeEditorTypes.fire();
		}));
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

	private registerContributionPoints(): void {
		// Clear all previous contributions we know
		this._editorResolverDisposables.clear();

		for (const contributedEditor of this._contributedEditors) {
			for (const globPattern of contributedEditor.selector) {
				if (!globPattern.filenamePattern) {
					continue;
				}

				const editorInputFactory: EditorInputFactoryFunction = ({ resource }, group) => {
					return { editor: CustomEditorInput.create(this.instantiationService, resource, contributedEditor.id, group.id) };
				};
				const untitledEditorInputFactory: UntitledEditorInputFactoryFunction = ({ resource }, group) => {
					return { editor: CustomEditorInput.create(this.instantiationService, resource ?? URI.from({ scheme: Schemas.untitled, authority: `Untitled-${this._untitledCounter++}` }), contributedEditor.id, group.id) };
				};
				const diffEditorInputFactory: DiffEditorInputFactoryFunction = (diffEditorInput, group) => {
					return { editor: this.createDiffEditorInput(diffEditorInput, contributedEditor.id, group) };
				};

				this._editorResolverDisposables.add(this.editorResolverService.registerEditor(
					globPattern.filenamePattern,
					{
						id: contributedEditor.id,
						label: contributedEditor.displayName,
						detail: contributedEditor.providerDisplayName,
						priority: contributedEditor.priority,
					},
					{
						singlePerResource: () => !this.getCustomEditorCapabilities(contributedEditor.id)?.supportsMultipleEditorsPerDocument ?? true
					},
					{
						createEditorInput: editorInputFactory,
						createUntitledEditorInput: untitledEditorInputFactory,
						createDiffEditorInput: diffEditorInputFactory,
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
					replacement = CustomEditorInput.create(this.instantiationService, newResource, viewType!, group);
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

registerThemingParticipant((theme, collector) => {
	const shadow = theme.getColor(colorRegistry.scrollbarShadow);
	if (shadow) {
		collector.addRule(`.webview.modified { box-shadow: -6px 0 5px -5px ${shadow}; }`);
	}
});
