/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import uri from 'vs/base/common/uri';
import resources = require('vs/base/common/resources');
import { IconLabel, IIconLabelValueOptions, IIconLabelCreationOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
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
import { IDecorationsService, IResourceDecorationChangeEvent, IDecorationData } from 'vs/workbench/services/decorations/browser/decorations';
import { Schemas } from 'vs/base/common/network';
import { FileKind, FILES_ASSOCIATIONS_CONFIG } from 'vs/platform/files/common/files';
import { ITextModel } from 'vs/editor/common/model';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import Event, { Emitter } from 'vs/base/common/event';

export interface IResourceLabel {
	name: string;
	description?: string;
	resource?: uri;
}

export interface IResourceLabelOptions extends IIconLabelValueOptions {
	fileKind?: FileKind;
	fileDecorations?: { colors: boolean, badges: boolean, data?: IDecorationData };
}

export class ResourceLabel extends IconLabel {

	private toDispose: IDisposable[];
	private label: IResourceLabel;
	private options: IResourceLabelOptions;
	private computedIconClasses: string[];
	private lastKnownConfiguredLangId: string;

	private _onDidRender = new Emitter<void>();
	readonly onDidRender: Event<void> = this._onDidRender.event;

	constructor(
		container: HTMLElement,
		options: IIconLabelCreationOptions,
		@IExtensionService private extensionService: IExtensionService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
		@IEnvironmentService protected environmentService: IEnvironmentService,
		@IDecorationsService protected decorationsService: IDecorationsService,
		@IThemeService private themeService: IThemeService
	) {
		super(container, options);

		this.toDispose = [];

		this.registerListeners();
	}

	private registerListeners(): void {

		// update when extensions are registered with potentially new languages
		this.toDispose.push(this.extensionService.onDidRegisterExtensions(() => this.render(true /* clear cache */)));

		// react to model mode changes
		this.toDispose.push(this.modelService.onModelModeChanged(e => this.onModelModeChanged(e)));

		// react to file decoration changes
		this.toDispose.push(this.decorationsService.onDidChangeDecorations(this.onFileDecorationsChanges, this));

		// react to theme changes
		this.toDispose.push(this.themeService.onThemeChange(() => this.render(false)));

		// react to files.associations changes
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(FILES_ASSOCIATIONS_CONFIG)) {
				this.render(true /* clear cache */);
			}
		}));
	}

	private onModelModeChanged(e: { model: ITextModel; oldModeId: string; }): void {
		if (!this.label || !this.label.resource) {
			return; // only update if label exists
		}

		if (!e.model.uri) {
			return; // we need the resource to compare
		}

		if (e.model.uri.scheme === Schemas.file && e.oldModeId === PLAINTEXT_MODE_ID) { // todo@remote does this apply?
			return; // ignore transitions in files from no mode to specific mode because this happens each time a model is created
		}

		if (e.model.uri.toString() === this.label.resource.toString()) {
			if (this.lastKnownConfiguredLangId !== e.model.getLanguageIdentifier().language) {
				this.render(true); // update if the language id of the model has changed from our last known state
			}
		}
	}

	private onFileDecorationsChanges(e: IResourceDecorationChangeEvent): void {
		if (!this.options || !this.label || !this.label.resource) {
			return;
		}

		if (this.options.fileDecorations && e.affectsResource(this.label.resource)) {
			this.render(false);
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

		const iconLabelOptions: IIconLabelValueOptions = {
			title: '',
			italic: this.options && this.options.italic,
			matches: this.options && this.options.matches,
		};

		const resource = this.label.resource;
		const label = this.label.name;

		if (this.options && typeof this.options.title === 'string') {
			iconLabelOptions.title = this.options.title;
		} else if (resource && resource.scheme !== Schemas.data /* do not accidentally inline Data URIs */) {
			iconLabelOptions.title = getPathLabel(resource, void 0, this.environmentService);
		}

		if (!this.computedIconClasses) {
			this.computedIconClasses = getIconClasses(this.modelService, this.modeService, resource, this.options && this.options.fileKind);
		}

		iconLabelOptions.extraClasses = this.computedIconClasses.slice(0);
		if (this.options && this.options.extraClasses) {
			iconLabelOptions.extraClasses.push(...this.options.extraClasses);
		}

		if (this.options && this.options.fileDecorations && resource) {
			let deco = this.decorationsService.getDecoration(
				resource,
				this.options.fileKind !== FileKind.FILE,
				this.options.fileDecorations.data
			);

			if (deco) {
				if (deco.tooltip) {
					iconLabelOptions.title = `${iconLabelOptions.title} • ${deco.tooltip}`;
				}
				if (this.options.fileDecorations.colors) {
					iconLabelOptions.extraClasses.push(deco.labelClassName);
				}
				if (this.options.fileDecorations.badges) {
					iconLabelOptions.extraClasses.push(deco.badgeClassName);
				}
			}
		}

		this.setValue(label, this.label.description, iconLabelOptions);
		this._onDidRender.fire();
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
		@IDecorationsService decorationsService: IDecorationsService,
		@IThemeService themeService: IThemeService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
	) {
		super(container, options, extensionService, contextService, configurationService, modeService, modelService, environmentService, decorationsService, themeService);
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
				name = resources.basenameOrAuthority(resource);
			}
		}

		let description: string;
		const hidePath = (options && options.hidePath) || (resource.scheme === Schemas.untitled && !this.untitledEditorService.hasAssociatedFilePath(resource));
		if (!hidePath) {
			let rootProvider: IWorkspaceFolderProvider;
			if (options && options.root) {
				rootProvider = {
					getWorkspaceFolder(): { uri } { return { uri: options.root }; },
					getWorkspace(): { folders: { uri: uri }[]; } { return { folders: [{ uri: options.root }] }; },
				};
			} else {
				rootProvider = this.contextService;
			}

			description = getPathLabel(resources.dirname(resource), rootProvider, this.environmentService);
		}

		this.setLabel({ resource, name, description }, options);
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
			classes.push(`ext-file-icon`); // extra segment to increase file-ext score

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
