/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { Emitter } from 'vs/base/common/event';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable } from 'vs/base/common/lifecycle';
import { basename, extname, isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { FileOperation, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { EditorServiceImpl } from 'vs/workbench/browser/parts/editor/editor';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { EditorInput, EditorOptions, IEditorInput, IEditorPane, GroupIdentifier } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { webviewEditorsExtensionPoint } from 'vs/workbench/contrib/customEditor/browser/extensionPoint';
import { CONTEXT_CUSTOM_EDITORS, CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE, CustomEditorInfo, CustomEditorInfoCollection, CustomEditorPriority, CustomEditorSelector, ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { CustomEditorModelManager } from 'vs/workbench/contrib/customEditor/common/customEditorModelManager';
import { IWebviewService, webviewHasOwnEditFunctionsContext } from 'vs/workbench/contrib/webview/browser/webview';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, IOpenEditorOverride } from 'vs/workbench/services/editor/common/editorService';
import { CustomEditorInput } from './customEditorInput';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';

export const defaultEditorId = 'default';

const defaultEditorInfo = new CustomEditorInfo({
	id: defaultEditorId,
	displayName: nls.localize('promptOpenWith.defaultEditor', "VS Code's standard text editor"),
	selector: [
		{ filenamePattern: '*' }
	],
	priority: CustomEditorPriority.default,
});

export class CustomEditorInfoStore extends Disposable {

	private readonly _contributedEditors = new Map<string, CustomEditorInfo>();

	constructor() {
		super();

		webviewEditorsExtensionPoint.setHandler(extensions => {
			this._contributedEditors.clear();

			for (const extension of extensions) {
				for (const webviewEditorContribution of extension.value) {
					this.add(new CustomEditorInfo({
						id: webviewEditorContribution.viewType,
						displayName: webviewEditorContribution.displayName,
						selector: webviewEditorContribution.selector || [],
						priority: webviewEditorContribution.priority || CustomEditorPriority.default,
					}));
				}
			}
			this._onChange.fire();
		});
	}

	private readonly _onChange = this._register(new Emitter<void>());
	public readonly onChange = this._onChange.event;

	public get(viewType: string): CustomEditorInfo | undefined {
		return viewType === defaultEditorId
			? defaultEditorInfo
			: this._contributedEditors.get(viewType);
	}

	public getContributedEditors(resource: URI): readonly CustomEditorInfo[] {
		return Array.from(this._contributedEditors.values())
			.filter(customEditor => customEditor.matches(resource));
	}

	private add(info: CustomEditorInfo): void {
		if (info.id === defaultEditorId || this._contributedEditors.has(info.id)) {
			console.error(`Custom editor with id '${info.id}' already registered`);
			return;
		}
		this._contributedEditors.set(info.id, info);
	}
}

export class CustomEditorService extends Disposable implements ICustomEditorService {
	_serviceBrand: any;

	private readonly _editorInfoStore = this._register(new CustomEditorInfoStore());

	private readonly _models = new CustomEditorModelManager();

	private readonly _customEditorContextKey: IContextKey<string>;
	private readonly _focusedCustomEditorIsEditable: IContextKey<boolean>;
	private readonly _webviewHasOwnEditFunctions: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IFileService fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWebviewService private readonly webviewService: IWebviewService,
	) {
		super();

		this._customEditorContextKey = CONTEXT_CUSTOM_EDITORS.bindTo(contextKeyService);
		this._focusedCustomEditorIsEditable = CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE.bindTo(contextKeyService);
		this._webviewHasOwnEditFunctions = webviewHasOwnEditFunctionsContext.bindTo(contextKeyService);

		this._register(this._editorInfoStore.onChange(() => this.updateContexts()));
		this._register(this.editorService.onDidActiveEditorChange(() => this.updateContexts()));

		this._register(fileService.onDidRunOperation(e => {
			if (e.isOperation(FileOperation.MOVE)) {
				this.handleMovedFileInOpenedFileEditors(e.resource, e.target.resource);
			}
		}));

		this.updateContexts();
	}

	public get models() { return this._models; }

	public getCustomEditor(viewType: string): CustomEditorInfo | undefined {
		return this._editorInfoStore.get(viewType);
	}

	public getContributedCustomEditors(resource: URI): CustomEditorInfoCollection {
		return new CustomEditorInfoCollection(this._editorInfoStore.getContributedEditors(resource));
	}

	public getUserConfiguredCustomEditors(resource: URI): CustomEditorInfoCollection {
		const rawAssociations = this.configurationService.getValue<CustomEditorsAssociations>(customEditorsAssociationsKey) || [];
		return new CustomEditorInfoCollection(
			coalesce(rawAssociations
				.filter(association => CustomEditorInfo.selectorMatches(association, resource))
				.map(association => this._editorInfoStore.get(association.viewType))));
	}

	public getAllCustomEditors(resource: URI): CustomEditorInfoCollection {
		return new CustomEditorInfoCollection([
			...this.getUserConfiguredCustomEditors(resource).allEditors,
			...this.getContributedCustomEditors(resource).allEditors,
		]);
	}

	public async promptOpenWith(
		resource: URI,
		options?: ITextEditorOptions,
		group?: IEditorGroup,
	): Promise<IEditorPane | undefined> {
		const pick = await this.showOpenWithPrompt(resource, group);
		if (!pick) {
			return;
		}

		return this.openWith(resource, pick, options, group);
	}

	private showOpenWithPrompt(
		resource: URI,
		group?: IEditorGroup,
	): Promise<string | undefined> {
		const customEditors = new CustomEditorInfoCollection([
			defaultEditorInfo,
			...this.getAllCustomEditors(resource).allEditors,
		]);

		let currentlyOpenedEditorType: undefined | string;
		for (const editor of group ? group.editors : []) {
			if (editor.resource && isEqual(editor.resource, resource)) {
				currentlyOpenedEditorType = editor instanceof CustomEditorInput ? editor.viewType : defaultEditorId;
				break;
			}
		}

		const resourceExt = extname(resource);

		const items = customEditors.allEditors.map((editorDescriptor): IQuickPickItem => ({
			label: editorDescriptor.displayName,
			id: editorDescriptor.id,
			description: editorDescriptor.id === currentlyOpenedEditorType
				? nls.localize('openWithCurrentlyActive', "Currently Active")
				: undefined,
			buttons: resourceExt ? [{
				iconClass: 'codicon-settings-gear',
				tooltip: nls.localize('promptOpenWith.setDefaultTooltip', "Set as default editor for '{0}' files", resourceExt)
			}] : undefined
		}));

		const picker = this.quickInputService.createQuickPick();
		picker.items = items;
		picker.placeholder = nls.localize('promptOpenWith.placeHolder', "Select editor to use for '{0}'...", basename(resource));

		return new Promise<string | undefined>(resolve => {
			picker.onDidAccept(() => {
				resolve(picker.selectedItems.length === 1 ? picker.selectedItems[0].id : undefined);
				picker.dispose();
			});
			picker.onDidTriggerItemButton(e => {
				const pick = e.item.id;
				resolve(pick); // open the view
				picker.dispose();

				// And persist the setting
				if (pick) {
					const newAssociation: CustomEditorAssociation = { viewType: pick, filenamePattern: '*' + resourceExt };
					const currentAssociations = [...this.configurationService.getValue<CustomEditorsAssociations>(customEditorsAssociationsKey)] || [];

					// First try updating existing association
					for (let i = 0; i < currentAssociations.length; ++i) {
						const existing = currentAssociations[i];
						if (existing.filenamePattern === newAssociation.filenamePattern) {
							currentAssociations.splice(i, 1, newAssociation);
							this.configurationService.updateValue(customEditorsAssociationsKey, currentAssociations);
							return;
						}
					}

					// Otherwise, create a new one
					currentAssociations.unshift(newAssociation);
					this.configurationService.updateValue(customEditorsAssociationsKey, currentAssociations);
				}
			});
			picker.show();
		});
	}

	public openWith(
		resource: URI,
		viewType: string,
		options?: ITextEditorOptions,
		group?: IEditorGroup,
	): Promise<IEditorPane | undefined> {
		if (viewType === defaultEditorId) {
			const fileEditorInput = this.editorService.createEditorInput({ resource, forceFile: true });
			return this.openEditorForResource(resource, fileEditorInput, { ...options, ignoreOverrides: true }, group);
		}

		if (!this._editorInfoStore.get(viewType)) {
			return this.promptOpenWith(resource, options, group);
		}

		const input = this.createInput(resource, viewType, group?.id);
		return this.openEditorForResource(resource, input, options, group);
	}

	public createInput(
		resource: URI,
		viewType: string,
		group: GroupIdentifier | undefined,
		options?: { readonly customClasses: string; },
	): IEditorInput {
		if (viewType === defaultEditorId) {
			return this.editorService.createEditorInput({ resource, forceFile: true });
		}

		const id = generateUuid();
		const webview = new Lazy(() => {
			return this.webviewService.createWebviewOverlay(id, { customClasses: options?.customClasses }, {});
		});
		const input = this.instantiationService.createInstance(CustomEditorInput, resource, viewType, id, webview);
		if (typeof group !== 'undefined') {
			input.updateGroup(group);
		}
		return input;
	}

	private async openEditorForResource(
		resource: URI,
		input: IEditorInput,
		options?: IEditorOptions,
		group?: IEditorGroup
	): Promise<IEditorPane | undefined> {
		const targetGroup = group || this.editorGroupService.activeGroup;

		// Try to replace existing editors for resource
		const existingEditors = targetGroup.editors.filter(editor => editor.resource && isEqual(editor.resource, resource));
		if (existingEditors.length) {
			const existing = existingEditors[0];
			if (!input.matches(existing)) {
				await this.editorService.replaceEditors([{
					editor: existing,
					replacement: input,
					options: options ? EditorOptions.create(options) : undefined,
				}], targetGroup);

				if (existing instanceof CustomEditorInput) {
					existing.dispose();
				}
			}
		}

		return this.editorService.openEditor(input, options, group);
	}

	private updateContexts() {
		const activeEditorPane = this.editorService.activeEditorPane;
		const resource = activeEditorPane?.input?.resource;
		if (!resource) {
			this._customEditorContextKey.reset();
			this._focusedCustomEditorIsEditable.reset();
			this._webviewHasOwnEditFunctions.reset();
			return;
		}

		const possibleEditors = this.getAllCustomEditors(resource).allEditors;

		this._customEditorContextKey.set(possibleEditors.map(x => x.id).join(','));
		this._focusedCustomEditorIsEditable.set(activeEditorPane?.input instanceof CustomEditorInput);
		this._webviewHasOwnEditFunctions.set(possibleEditors.length > 0);
	}

	private async handleMovedFileInOpenedFileEditors(_oldResource: URI, newResource: URI): Promise<void> {
		// See if the new resource can be opened in a custom editor
		const possibleEditors = this.getAllCustomEditors(newResource).allEditors;
		if (!possibleEditors.length) {
			return;
		}

		// If so, check all editors to see if there are any file editors open for the new resource
		const editorsToReplace = new Map<GroupIdentifier, IEditorInput[]>();
		for (const group of this.editorGroupService.groups) {
			for (const editor of group.editors) {
				if (editor instanceof FileEditorInput
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

		// If there is, show a single prompt for all editors to see if the user wants to re-open them
		//
		// TODO: instead of prompting eagerly, it'd likly be better to replace all the editors with
		// ones that would prompt when they first become visible
		await new Promise(resolve => setTimeout(resolve, 50));
		const pickedViewType = await this.showOpenWithPrompt(newResource);
		if (!pickedViewType) {
			return;
		}

		for (const [group, entries] of editorsToReplace) {
			this.editorService.replaceEditors(entries.map(editor => {
				const replacement = this.createInput(newResource, pickedViewType, group);
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

export const customEditorsAssociationsKey = 'workbench.experimental.editorAssociations';

export type CustomEditorAssociation = CustomEditorSelector & {
	readonly viewType: string;
};

export type CustomEditorsAssociations = readonly CustomEditorAssociation[];

export class CustomEditorContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IEditorService private readonly editorService: EditorServiceImpl,
		@ICustomEditorService private readonly customEditorService: ICustomEditorService,
	) {
		super();

		this._register(this.editorService.overrideOpenEditor((editor, options, group) => {
			return this.onEditorOpening(editor, options, group);
		}));

		this._register(this.editorService.onDidCloseEditor(({ editor }) => {
			if (!(editor instanceof CustomEditorInput)) {
				return;
			}

			if (!this.editorService.editors.some(other => other === editor)) {
				editor.dispose();
			}
		}));
	}

	private onEditorOpening(
		editor: IEditorInput,
		options: ITextEditorOptions | undefined,
		group: IEditorGroup
	): IOpenEditorOverride | undefined {
		if (editor instanceof CustomEditorInput) {
			if (editor.group === group.id) {
				// No need to do anything
				return undefined;
			} else {
				// Create a copy of the input.
				// Unlike normal editor inputs, we do not want to share custom editor inputs
				// between multiple editors / groups.
				return {
					override: this.customEditorService.openWith(editor.resource, editor.viewType, options, group)
				};
			}
		}

		if (editor instanceof DiffEditorInput) {
			return this.onDiffEditorOpening(editor, options, group);
		}

		const resource = editor.resource;
		if (resource) {
			return this.onResourceEditorOpening(resource, editor, options, group);
		}
		return undefined;
	}

	private onResourceEditorOpening(
		resource: URI,
		editor: IEditorInput,
		options: ITextEditorOptions | undefined,
		group: IEditorGroup
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
		const existingEditorForResource = group.editors.find(editor => isEqual(resource, editor.resource));
		if (existingEditorForResource) {
			return {
				override: this.editorService.openEditor(existingEditorForResource, { ...options, ignoreOverrides: true }, group)
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
				const standardEditor = await this.editorService.openEditor(editor, { ...options, ignoreOverrides: true }, group);
				// Give a moment to make sure the editor is showing.
				// Otherwise the focus shift can cause the prompt to be dismissed right away.
				await new Promise(resolve => setTimeout(resolve, 20));
				const selectedEditor = await this.customEditorService.promptOpenWith(resource, options, group);
				if (selectedEditor && selectedEditor.input) {
					await group.replaceEditors([{
						editor,
						replacement: selectedEditor.input
					}]);
					return selectedEditor;
				}

				return standardEditor;
			})()
		};
	}

	private onDiffEditorOpening(
		editor: DiffEditorInput,
		options: ITextEditorOptions | undefined,
		group: IEditorGroup
	): IOpenEditorOverride | undefined {
		const getCustomEditorOverrideForSubInput = (subInput: IEditorInput, customClasses: string): EditorInput | undefined => {
			if (subInput instanceof CustomEditorInput) {
				return undefined;
			}
			const resource = subInput.resource;
			if (!resource) {
				return undefined;
			}

			// Prefer default editors in the diff editor case but ultimatly always take the first editor
			const allEditors = new CustomEditorInfoCollection([
				...this.customEditorService.getUserConfiguredCustomEditors(resource).allEditors,
				...this.customEditorService.getContributedCustomEditors(resource).allEditors.filter(x => x.priority !== CustomEditorPriority.option),
			]);

			const bestAvailableEditor = allEditors.bestAvailableEditor;
			if (!bestAvailableEditor) {
				return undefined;
			}

			const input = this.customEditorService.createInput(resource, bestAvailableEditor.id, group.id, { customClasses });
			if (input instanceof EditorInput) {
				return input;
			}

			return undefined;
		};

		const modifiedOverride = getCustomEditorOverrideForSubInput(editor.modifiedInput, 'modified');
		const originalOverride = getCustomEditorOverrideForSubInput(editor.originalInput, 'original');

		if (modifiedOverride || originalOverride) {
			return {
				override: (async () => {
					const input = new DiffEditorInput(editor.getName(), editor.getDescription(), originalOverride || editor.originalInput, modifiedOverride || editor.modifiedInput, true);
					return this.editorService.openEditor(input, { ...options, ignoreOverrides: true }, group);
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
