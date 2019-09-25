/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, distinct } from 'vs/base/common/arrays';
import * as glob from 'vs/base/common/glob';
import { UnownedDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { basename, DataUri } from 'vs/base/common/resources';
import { withNullAsUndefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { EditorInput, EditorOptions, IEditor, IEditorInput } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { webviewEditorsExtensionPoint } from 'vs/workbench/contrib/customEditor/browser/extensionPoint';
import { CustomEditorDiscretion, CustomEditorInfo, CustomEditorSelector, ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, IOpenEditorOverride } from 'vs/workbench/services/editor/common/editorService';
import { CustomFileEditorInput } from './customEditorInput';

const defaultEditorId = 'default';

const defaultEditorInfo: CustomEditorInfo = {
	id: defaultEditorId,
	displayName: nls.localize('promptOpenWith.defaultEditor', "Default built-in editor"),
	selector: [
		{ filenamePattern: '*' }
	],
	discretion: CustomEditorDiscretion.default,
};

export class CustomEditorStore {
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
			customEditor.selector.some(selector => matches(selector, resource)));
	}
}

export class CustomEditorService implements ICustomEditorService {
	_serviceBrand: any;

	private readonly editors = new CustomEditorStore();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWebviewService private readonly webviewService: IWebviewService,
	) {
		webviewEditorsExtensionPoint.setHandler(extensions => {
			this.editors.clear();

			for (const extension of extensions) {
				for (const webviewEditorContribution of extension.value) {
					this.editors.add({
						id: webviewEditorContribution.viewType,
						displayName: webviewEditorContribution.displayName,
						selector: webviewEditorContribution.selector || [],
						discretion: webviewEditorContribution.discretion || CustomEditorDiscretion.default,
					});
				}
			}
		});
	}

	public getContributedCustomEditors(resource: URI): readonly CustomEditorInfo[] {
		return this.editors.getContributedEditors(resource);
	}

	public getUserConfiguredCustomEditors(resource: URI): readonly CustomEditorInfo[] {
		const rawAssociations = this.configurationService.getValue<CustomEditorsAssociations>(customEditorsAssociationsKey) || [];
		return coalesce(rawAssociations
			.filter(association => matches(association, resource))
			.map(association => this.editors.get(association.viewType)));
	}

	public async promptOpenWith(
		resource: URI,
		options?: ITextEditorOptions,
		group?: IEditorGroup,
	): Promise<IEditor | undefined> {
		const customEditors = distinct([
			defaultEditorInfo,
			...this.getUserConfiguredCustomEditors(resource),
			...this.getContributedCustomEditors(resource),
		], editor => editor.id);

		const pick = await this.quickInputService.pick(
			customEditors.map((editorDescriptor): IQuickPickItem => ({
				label: editorDescriptor.displayName,
				id: editorDescriptor.id,
			})), {
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

		if (!this.editors.get(viewType)) {
			return this.promptOpenWith(resource, options, group);
		}

		const input = this.createInput(resource, viewType, group);
		return this.openEditorForResource(resource, input, options, group);
	}

	public createInput(
		resource: URI,
		viewType: string,
		group: IEditorGroup | undefined
	): CustomFileEditorInput {
		const id = generateUuid();
		const webview = this.webviewService.createWebviewEditorOverlay(id, {}, {});
		const input = this.instantiationService.createInstance(CustomFileEditorInput, resource, viewType, id, new UnownedDisposable(webview));
		if (group) {
			input.updateGroup(group!.id);
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
			const existingEditors = group.editors.filter(editor => editor.getResource() && editor.getResource()!.toString() === resource.toString());
			if (existingEditors.length) {
				await this.editorService.replaceEditors([{
					editor: existingEditors[0],
					replacement: input,
					options: options ? EditorOptions.create(options) : undefined,
				}], group);
			}
		}
		return this.editorService.openEditor(input, options, group);
	}
}

export const customEditorsAssociationsKey = 'workbench.experimental.editorAssociations';

export type CustomEditorsAssociations = readonly (CustomEditorSelector & { readonly viewType: string })[];

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
			return;
		}

		if (editor instanceof DiffEditorInput) {
			const getCustomEditorOverrideForSubInput = (subInput: IEditorInput): EditorInput | undefined => {
				if (subInput instanceof CustomFileEditorInput) {
					return undefined;
				}
				const resource = subInput.getResource();
				if (!resource) {
					return undefined;
				}

				const editors = distinct([
					...this.customEditorService.getUserConfiguredCustomEditors(resource),
					...this.customEditorService.getContributedCustomEditors(resource),
				], editor => editor.id);

				// Always prefer the first editor in the diff editor case
				return editors.length
					? this.customEditorService.createInput(resource, editors[0].id, group)
					: undefined;
			};

			const modifiedOverride = getCustomEditorOverrideForSubInput(editor.modifiedInput);
			const originalOverride = getCustomEditorOverrideForSubInput(editor.originalInput);

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

		const resource = editor.getResource();
		if (!resource) {
			return;
		}

		const userConfiguredEditors = this.customEditorService.getUserConfiguredCustomEditors(resource);
		const contributedEditors = this.customEditorService.getContributedCustomEditors(resource);

		if (!userConfiguredEditors.length) {
			if (!contributedEditors.length) {
				return;
			}

			const defaultEditors = contributedEditors.filter(editor => editor.discretion === CustomEditorDiscretion.default);
			if (defaultEditors.length === 1) {
				return {
					override: this.customEditorService.openWith(resource, defaultEditors[0].id, options, group),
				};
			}
		}

		for (const input of group.editors) {
			if (input instanceof CustomFileEditorInput && input.getResource().toString() === resource.toString()) {
				return {
					override: group.openEditor(input, options).then(withNullAsUndefined)
				};
			}
		}

		if (userConfiguredEditors.length) {
			return {
				override: this.customEditorService.openWith(resource, userConfiguredEditors[0].id, options, group),
			};
		}

		// Open default editor but prompt user to see if they wish to use a custom one instead
		return {
			override: (async () => {
				const standardEditor = await this.editorService.openEditor(editor, { ...options, ignoreOverrides: true }, group);
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
}

function matches(selector: CustomEditorSelector, resource: URI): boolean {
	if (resource.scheme === Schemas.data) {
		const metadata = DataUri.parseMetaData(resource);
		const mime = metadata.get(DataUri.META_DATA_MIME);
		if (!selector.mime || !mime) {
			return false;
		}
		return glob.match(selector.mime, mime.toLowerCase());
	}

	if (!selector.filenamePattern && !selector.scheme) {
		return false;
	}
	if (selector.filenamePattern) {
		if (!glob.match(selector.filenamePattern.toLowerCase(), basename(resource).toLowerCase())) {
			return false;
		}
	}
	if (selector.scheme) {
		if (resource.scheme !== selector.scheme) {
			return false;
		}
	}
	return true;
}
