/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { extname, isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { RedoCommand, UndoCommand } from 'vs/editor/browser/editorExtensions';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorOverride, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { FileOperation, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService } from 'vs/platform/storage/common/storage';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { Extensions as EditorExtensions, IEditorAssociationsRegistry, IEditorType, IEditorTypesHandler } from 'vs/workbench/browser/editor';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { EditorInput, Extensions as EditorInputExtensions, GroupIdentifier, IEditorInput, IEditorInputFactoryRegistry } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IExtensionContributedEditorService } from 'vs/workbench/contrib/customEditor/browser/extensionContributedEditorService';
import { CONTEXT_ACTIVE_CUSTOM_EDITOR_ID, CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE, CustomEditorCapabilities, CustomEditorInfo, CustomEditorInfoCollection, ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { CustomEditorModelManager } from 'vs/workbench/contrib/customEditor/common/customEditorModelManager';
import { ContributedEditorPriority, priorityToRank } from 'vs/workbench/contrib/customEditor/common/extensionContributedEditorService';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, IOpenEditorOverride } from 'vs/workbench/services/editor/common/editorService';
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
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IExtensionContributedEditorService private readonly extensionContributedEditorService: IExtensionContributedEditorService,
	) {
		super();

		this._activeCustomEditorId = CONTEXT_ACTIVE_CUSTOM_EDITOR_ID.bindTo(contextKeyService);
		this._focusedCustomEditorIsEditable = CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE.bindTo(contextKeyService);

		this._contributedEditors = this._register(new ContributedCustomEditors(storageService));
		this.registerContributionPoints();

		this._register(this._contributedEditors.onChange(() => {
			this.updateContexts();
			this.registerContributionPoints();
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

	private registerContributionPoints(): void {
		for (const contributedEditor of this._contributedEditors) {
			for (const globPattern of contributedEditor.selector) {
				if (!globPattern.filenamePattern || this.extensionContributedEditorService.hasContributionPoint(globPattern.filenamePattern)) {
					continue;
				}
				this._register(this.extensionContributedEditorService.registerContributionPoint(
					undefined,
					globPattern.filenamePattern,
					priorityToRank(contributedEditor.priority),
					{
						id: contributedEditor.id,
						label: contributedEditor.displayName,
						detail: contributedEditor.providerDisplayName,
						active: (currentEditor) => currentEditor instanceof CustomEditorInput && currentEditor.viewType === contributedEditor.id,
						instanceOf: (editorInput) => editorInput instanceof CustomEditorInput,
						priority: contributedEditor.priority,
					},
					{
						singlePerResource: () => !this.getCustomEditorCapabilities(contributedEditor.id)?.supportsMultipleEditorsPerDocument ?? true
					},
					(resource, editorID, group) => CustomEditorInput.create(this.instantiationService, resource, editorID, group.id)));
			}
		}
	}

	public get models() { return this._models; }

	public getCustomEditor(viewType: string): CustomEditorInfo | undefined {
		return this._contributedEditors.get(viewType);
	}

	public getContributedCustomEditors(resource: URI): CustomEditorInfoCollection {
		return new CustomEditorInfoCollection(this._contributedEditors.getContributedEditors(resource));
	}

	public getUserConfiguredCustomEditors(resource: URI): CustomEditorInfoCollection {
		const resourceAssocations = this.extensionContributedEditorService.getAssociationsForResource(resource);
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

	private getCustomEditorCapabilities(viewType: string): CustomEditorCapabilities | undefined {
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
		if (!possibleEditors.allEditors.some(editor => editor.priority !== ContributedEditorPriority.option)) {
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
}

export class CustomEditorContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ICustomEditorService private readonly customEditorService: ICustomEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	//@ts-ignore
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
				...this.customEditorService.getContributedCustomEditors(resource).allEditors.filter(x => x.priority !== ContributedEditorPriority.option),
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

registerThemingParticipant((theme, collector) => {
	const shadow = theme.getColor(colorRegistry.scrollbarShadow);
	if (shadow) {
		collector.addRule(`.webview.modified { box-shadow: -6px 0 5px -5px ${shadow}; }`);
	}
});
