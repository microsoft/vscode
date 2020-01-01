/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable } from 'vs/base/common/lifecycle';
import { basename, isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { EditorInput, EditorOptions, IEditor, IEditorInput } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { webviewEditorsExtensionPoint } from 'vs/workbench/contrib/customEditor/browser/extensionPoint';
import { CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE, CONTEXT_HAS_CUSTOM_EDITORS, CustomEditorInfo, CustomEditorInfoCollection, CustomEditorPriority, CustomEditorSelector, ICustomEditor, ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { CustomEditorModelManager } from 'vs/workbench/contrib/customEditor/common/customEditorModelManager';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { IWebviewService, webviewHasOwnEditFunctionsContext } from 'vs/workbench/contrib/webview/browser/webview';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, IOpenEditorOverride } from 'vs/workbench/services/editor/common/editorService';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { CustomFileEditorInput } from './customEditorInput';
export const defaultEditorId = 'default';

const defaultEditorInfo = new CustomEditorInfo({
	id: defaultEditorId,
	displayName: nls.localize('promptOpenWith.defaultEditor', "VS Code's standard text editor"),
	selector: [
		{ filenamePattern: '*' }
	],
	priority: CustomEditorPriority.default,
});

export class CustomEditorInfoStore {
	private readonly contributedEditors = new Map<string, CustomEditorInfo>();

	public clear() {
		this.contributedEditors.clear();
	}

	public get(viewType: string): CustomEditorInfo | undefined {
		return viewType === defaultEditorId
			? defaultEditorInfo
			: this.contributedEditors.get(viewType);
	}

	public add(info: CustomEditorInfo): void {
		if (info.id === defaultEditorId || this.contributedEditors.has(info.id)) {
			console.log(`Custom editor with id '${info.id}' already registered`);
			return;
		}
		this.contributedEditors.set(info.id, info);
	}

	public getContributedEditors(resource: URI): readonly CustomEditorInfo[] {
		return Array.from(this.contributedEditors.values()).filter(customEditor =>
			customEditor.matches(resource));
	}
}

export class CustomEditorService extends Disposable implements ICustomEditorService {
	_serviceBrand: any;

	private readonly _editorInfoStore = new CustomEditorInfoStore();

	private readonly _models: CustomEditorModelManager;

	private readonly _hasCustomEditor: IContextKey<boolean>;
	private readonly _focusedCustomEditorIsEditable: IContextKey<boolean>;
	private readonly _webviewHasOwnEditFunctions: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWebviewService private readonly webviewService: IWebviewService,
	) {
		super();

		this._models = new CustomEditorModelManager(workingCopyService);

		webviewEditorsExtensionPoint.setHandler(extensions => {
			this._editorInfoStore.clear();

			for (const extension of extensions) {
				for (const webviewEditorContribution of extension.value) {
					this._editorInfoStore.add(new CustomEditorInfo({
						id: webviewEditorContribution.viewType,
						displayName: webviewEditorContribution.displayName,
						selector: webviewEditorContribution.selector || [],
						priority: webviewEditorContribution.priority || CustomEditorPriority.default,
					}));
				}
			}
			this.updateContexts();
		});

		this._hasCustomEditor = CONTEXT_HAS_CUSTOM_EDITORS.bindTo(contextKeyService);
		this._focusedCustomEditorIsEditable = CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE.bindTo(contextKeyService);
		this._webviewHasOwnEditFunctions = webviewHasOwnEditFunctionsContext.bindTo(contextKeyService);

		this._register(this.editorService.onDidActiveEditorChange(() => this.updateContexts()));
		this.updateContexts();
	}

	public get models() { return this._models; }

	public get activeCustomEditor(): ICustomEditor | undefined {
		const activeInput = this.editorService.activeControl?.input;
		if (!(activeInput instanceof CustomFileEditorInput)) {
			return undefined;
		}
		const resource = activeInput.getResource();
		return { resource, viewType: activeInput.viewType };
	}

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

	public async promptOpenWith(
		resource: URI,
		options?: ITextEditorOptions,
		group?: IEditorGroup,
	): Promise<IEditor | undefined> {
		const customEditors = new CustomEditorInfoCollection([
			defaultEditorInfo,
			...this.getUserConfiguredCustomEditors(resource).allEditors,
			...this.getContributedCustomEditors(resource).allEditors,
		]);

		let currentlyOpenedEditorType: undefined | string;
		for (const editor of group ? group.editors : []) {
			if (editor.getResource() && isEqual(editor.getResource(), resource)) {
				currentlyOpenedEditorType = editor instanceof CustomFileEditorInput ? editor.viewType : defaultEditorId;
				break;
			}
		}

		const items = customEditors.allEditors.map((editorDescriptor): IQuickPickItem => ({
			label: editorDescriptor.displayName,
			id: editorDescriptor.id,
			description: editorDescriptor.id === currentlyOpenedEditorType
				? nls.localize('openWithCurrentlyActive', "Currently Active")
				: undefined
		}));
		const pick = await this.quickInputService.pick(items, {
			placeHolder: nls.localize('promptOpenWith.placeHolder', "Select editor to use for '{0}'...", basename(resource)),
		});

		if (!pick || !pick.id) {
			return;
		}
		return this.openWith(resource, pick.id, options, group);
	}

	public openWith(
		resource: URI,
		viewType: string,
		options?: ITextEditorOptions,
		group?: IEditorGroup,
	): Promise<IEditor | undefined> {
		if (viewType === defaultEditorId) {
			const fileInput = this.instantiationService.createInstance(FileEditorInput, resource, undefined, undefined);
			return this.openEditorForResource(resource, fileInput, { ...options, ignoreOverrides: true }, group);
		}

		if (!this._editorInfoStore.get(viewType)) {
			return this.promptOpenWith(resource, options, group);
		}

		const input = this.createInput(resource, viewType, group);
		return this.openEditorForResource(resource, input, options, group);
	}

	public createInput(
		resource: URI,
		viewType: string,
		group: IEditorGroup | undefined,
		options?: { readonly customClasses: string; },
	): EditorInput {
		if (viewType === defaultEditorId) {
			return this.instantiationService.createInstance(FileEditorInput, resource, undefined, undefined);
		}

		const id = generateUuid();
		const webview = new Lazy(() => {
			return this.webviewService.createWebviewEditorOverlay(id, { customClasses: options?.customClasses }, {});
		});
		const input = this.instantiationService.createInstance(CustomFileEditorInput, resource, viewType, id, webview);
		if (group) {
			input.updateGroup(group.id);
		}
		return input;
	}

	private async openEditorForResource(
		resource: URI,
		input: IEditorInput,
		options?: IEditorOptions,
		group?: IEditorGroup
	): Promise<IEditor | undefined> {
		if (group) {
			const existingEditors = group.editors.filter(editor => editor.getResource() && isEqual(editor.getResource(), resource));
			if (existingEditors.length) {
				const existing = existingEditors[0];
				if (!input.matches(existing)) {
					await this.editorService.replaceEditors([{
						editor: existing,
						replacement: input,
						options: options ? EditorOptions.create(options) : undefined,
					}], group);

					if (existing instanceof CustomFileEditorInput) {
						existing.dispose();
					}
				}
			}
		}
		return this.editorService.openEditor(input, options, group);
	}

	private updateContexts() {
		const activeControl = this.editorService.activeControl;
		const resource = activeControl?.input.getResource();
		if (!resource) {
			this._hasCustomEditor.reset();
			this._focusedCustomEditorIsEditable.reset();
			this._webviewHasOwnEditFunctions.reset();
			return;
		}

		const possibleEditors = [
			...this.getContributedCustomEditors(resource).allEditors,
			...this.getUserConfiguredCustomEditors(resource).allEditors,
		];
		this._hasCustomEditor.set(possibleEditors.length > 0);
		this._focusedCustomEditorIsEditable.set(activeControl?.input instanceof CustomFileEditorInput);
		this._webviewHasOwnEditFunctions.set(true);
	}
}

export const customEditorsAssociationsKey = 'workbench.experimental.editorAssociations';

export type CustomEditorsAssociations = readonly (CustomEditorSelector & { readonly viewType: string; })[];

export class CustomEditorContribution implements IWorkbenchContribution {
	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ICustomEditorService private readonly customEditorService: ICustomEditorService,
	) {
		this.editorService.overrideOpenEditor((editor, options, group) => this.onEditorOpening(editor, options, group));
	}

	private onEditorOpening(
		editor: IEditorInput,
		options: ITextEditorOptions | undefined,
		group: IEditorGroup
	): IOpenEditorOverride | undefined {
		if (editor instanceof CustomFileEditorInput) {
			if (editor.group === group.id) {
				return undefined;
			}
		}

		if (editor instanceof DiffEditorInput) {
			return this.onDiffEditorOpening(editor, options, group);
		}

		const resource = editor.getResource();
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
		if (userConfiguredEditors.length) {
			return {
				override: this.customEditorService.openWith(resource, userConfiguredEditors.allEditors[0].id, options, group),
			};
		}

		const contributedEditors = this.customEditorService.getContributedCustomEditors(resource);
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
			if (subInput instanceof CustomFileEditorInput) {
				return undefined;
			}
			const resource = subInput.getResource();
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

			return this.customEditorService.createInput(resource, bestAvailableEditor.id, group, { customClasses });
		};

		const modifiedOverride = getCustomEditorOverrideForSubInput(editor.modifiedInput, 'modified');
		const originalOverride = getCustomEditorOverrideForSubInput(editor.originalInput, 'original');

		if (modifiedOverride || originalOverride) {
			return {
				override: (async () => {
					const input = new DiffEditorInput(editor.getName(), editor.getDescription(), originalOverride || editor.originalInput, modifiedOverride || editor.modifiedInput);
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
