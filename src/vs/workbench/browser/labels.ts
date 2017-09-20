/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import uri from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import resources = require('vs/base/common/resources');
import { IconLabel, IIconLabelOptions, IIconLabelCreationOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IEditorInput } from 'vs/platform/editor/common/editor';
import { toResource } from 'vs/workbench/common/editor';
import { getPathLabel, IWorkspaceFolderProvider } from 'vs/base/common/labels';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { Schemas } from 'vs/base/common/network';
import { FileKind } from 'vs/platform/files/common/files';
import { IModel } from 'vs/editor/common/editorCommon';

export interface IResourceLabel {
	name: string;
	description?: string;
	resource?: uri;
}

export interface IResourceLabelOptions extends IIconLabelOptions {
	fileKind?: FileKind;
}

export class ResourceLabel extends IconLabel {
	private toDispose: IDisposable[];
	private label: IResourceLabel;
	private options: IResourceLabelOptions;
	private computedIconClasses: string[];
	private lastKnownConfiguredLangId: string;

	constructor(
		container: HTMLElement,
		options: IIconLabelCreationOptions,
		@IExtensionService private extensionService: IExtensionService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
		@IEnvironmentService protected environmentService: IEnvironmentService
	) {
		super(container, options);

		this.toDispose = [];

		this.registerListeners();
	}

	private registerListeners(): void {
		this.extensionService.onReady().then(() => this.render(true /* clear cache */)); // update when extensions are loaded with potentially new languages
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(() => this.render(true /* clear cache */))); // update when file.associations change
		this.toDispose.push(this.modelService.onModelModeChanged(e => this.onModelModeChanged(e))); // react to model mode changes
	}

	private onModelModeChanged(e: { model: IModel; oldModeId: string; }): void {
		if (!this.label || !this.label.resource) {
			return; // only update if label exists
		}

		if (!e.model.uri) {
			return; // we need the resource to compare
		}

		if (e.model.uri.scheme === Schemas.file && e.oldModeId === PLAINTEXT_MODE_ID) {
			return; // ignore transitions in files from no mode to specific mode because this happens each time a model is created
		}

		if (e.model.uri.toString() === this.label.resource.toString()) {
			if (this.lastKnownConfiguredLangId !== e.model.getLanguageIdentifier().language) {
				this.render(true); // update if the language id of the model has changed from our last known state
			}
		}
	}

	public setLabel(label: IResourceLabel, options?: IResourceLabelOptions): void {
		const hasResourceChanged = this.hasResourceChanged(label, options);

		this.label = label;
		this.options = options;

		this.render(hasResourceChanged);
	}

	private hasResourceChanged(label: IResourceLabel, options: IResourceLabelOptions): boolean {
		const newResource = label ? label.resource : void 0;
		const oldResource = this.label ? this.label.resource : void 0;

		const newFileKind = options ? options.fileKind : void 0;
		const oldFileKind = this.options ? this.options.fileKind : void 0;

		if (newFileKind !== oldFileKind) {
			return true; // same resource but different kind (file, folder)
		}

		if (newResource && oldResource) {
			return newResource.toString() !== oldResource.toString();
		}

		if (!newResource && !oldResource) {
			return false;
		}

		return true;
	}

	public clear(): void {
		this.label = void 0;
		this.options = void 0;
		this.lastKnownConfiguredLangId = void 0;
		this.computedIconClasses = void 0;

		this.setValue();
	}

	private render(clearIconCache: boolean): void {
		if (this.label) {
			const configuredLangId = getConfiguredLangId(this.modelService, this.label.resource);
			if (this.lastKnownConfiguredLangId !== configuredLangId) {
				clearIconCache = true;
				this.lastKnownConfiguredLangId = configuredLangId;
			}
		}

		if (clearIconCache) {
			this.computedIconClasses = void 0;
		}

		if (!this.label) {
			return;
		}

		const resource = this.label.resource;

		let title = '';
		if (this.options && typeof this.options.title === 'string') {
			title = this.options.title;
		} else if (resource) {
			title = getPathLabel(resource, void 0, this.environmentService);
		}

		if (!this.computedIconClasses) {
			this.computedIconClasses = getIconClasses(this.modelService, this.modeService, resource, this.options && this.options.fileKind);
		}

		let extraClasses = this.computedIconClasses.slice(0);
		if (this.options && this.options.extraClasses) {
			extraClasses.push(...this.options.extraClasses);
		}

		const italic = this.options && this.options.italic;
		const matches = this.options && this.options.matches;

		this.setValue(this.label.name, this.label.description, { title, extraClasses, italic, matches });
	}

	public dispose(): void {
		super.dispose();

		this.toDispose = dispose(this.toDispose);
		this.label = void 0;
		this.options = void 0;
		this.lastKnownConfiguredLangId = void 0;
		this.computedIconClasses = void 0;
	}
}

export class EditorLabel extends ResourceLabel {

	public setEditor(editor: IEditorInput, options?: IResourceLabelOptions): void {
		this.setLabel({
			resource: toResource(editor, { supportSideBySide: true }),
			name: editor.getName(),
			description: editor.getDescription()
		}, options);
	}
}

export interface IFileLabelOptions extends IResourceLabelOptions {
	hideLabel?: boolean;
	hidePath?: boolean;
	root?: uri;
}

export class FileLabel extends ResourceLabel {

	constructor(
		container: HTMLElement,
		options: IIconLabelCreationOptions,
		@IExtensionService extensionService: IExtensionService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService
	) {
		super(container, options, extensionService, contextService, configurationService, modeService, modelService, environmentService);
	}

	public setFile(resource: uri, options?: IFileLabelOptions): void {
		const hideLabel = options && options.hideLabel;
		let name: string;
		if (!hideLabel) {
			if (options && options.fileKind === FileKind.ROOT_FOLDER) {
				const workspaceFolder = this.contextService.getWorkspaceFolder(resource);
				if (workspaceFolder) {
					name = workspaceFolder.name;
				}
			}

			if (!name) {
				name = paths.basename(resource.fsPath);
			}
		}


		const hidePath = (options && options.hidePath) || (resource.scheme === Schemas.untitled && !this.untitledEditorService.hasAssociatedFilePath(resource));
		let rootProvider: IWorkspaceFolderProvider;
		if (!hidePath) {
			if (options && options.root) {
				rootProvider = {
					getWorkspaceFolder(): { uri } { return { uri: options.root }; },
					getWorkspace(): { folders: { uri: uri }[]; } { return { folders: [{ uri: options.root }] }; },
				};
			} else {
				rootProvider = this.contextService;
			}
		}

		this.setLabel({
			resource,
			name: (options && options.hideLabel) ? void 0 : resources.basenameOrAuthority(resource),
			description: !hidePath ? getPathLabel(resources.dirname(resource), rootProvider, this.environmentService) : void 0
		}, options);
	}
}

export function getIconClasses(modelService: IModelService, modeService: IModeService, resource: uri, fileKind?: FileKind): string[] {

	// we always set these base classes even if we do not have a path
	const classes = fileKind === FileKind.ROOT_FOLDER ? ['rootfolder-icon'] : fileKind === FileKind.FOLDER ? ['folder-icon'] : ['file-icon'];


	if (resource) {
		const name = cssEscape(resources.basenameOrAuthority(resource).toLowerCase());

		// Folders
		if (fileKind === FileKind.FOLDER) {
			classes.push(`${name}-name-folder-icon`);
		}

		// Files
		else {

			// Name
			classes.push(`${name}-name-file-icon`);

			// Extension(s)
			const dotSegments = name.split('.');
			for (let i = 1; i < dotSegments.length; i++) {
				classes.push(`${dotSegments.slice(i).join('.')}-ext-file-icon`); // add each combination of all found extensions if more than one
			}

			// Configured Language
			let configuredLangId = getConfiguredLangId(modelService, resource);
			configuredLangId = configuredLangId || modeService.getModeIdByFilenameOrFirstLine(name);
			if (configuredLangId) {
				classes.push(`${cssEscape(configuredLangId)}-lang-file-icon`);
			}
		}
	}
	return classes;
}

function getConfiguredLangId(modelService: IModelService, resource: uri): string {
	let configuredLangId: string;
	if (resource) {
		const model = modelService.getModel(resource);
		if (model) {
			const modeId = model.getLanguageIdentifier().language;
			if (modeId && modeId !== PLAINTEXT_MODE_ID) {
				configuredLangId = modeId; // only take if the mode is specific (aka no just plain text)
			}
		}
	}

	return configuredLangId;
}

function cssEscape(val: string): string {
	return val.replace(/\s/g, '\\$&'); // make sure to not introduce CSS classes from files that contain whitespace
}
