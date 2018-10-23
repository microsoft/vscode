/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI as uri } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { IconLabel, IIconLabelValueOptions, IIconLabelCreationOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IModeService } from 'vs/editor/common/services/modeService';
import { toResource, IEditorInput } from 'vs/workbench/common/editor';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IDecorationsService, IResourceDecorationChangeEvent, IDecorationData } from 'vs/workbench/services/decorations/browser/decorations';
import { Schemas } from 'vs/base/common/network';
import { FileKind, FILES_ASSOCIATIONS_CONFIG } from 'vs/platform/files/common/files';
import { ITextModel } from 'vs/editor/common/model';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Event, Emitter } from 'vs/base/common/event';
import { ILabelService } from 'vs/platform/label/common/label';
import { getIconClasses, getConfiguredLangId } from 'vs/editor/common/services/getIconClasses';

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

	private _onDidRender = this._register(new Emitter<void>());
	get onDidRender(): Event<void> { return this._onDidRender.event; }

	private label: IResourceLabel;
	private options: IResourceLabelOptions;
	private computedIconClasses: string[];
	private lastKnownConfiguredLangId: string;
	private computedPathLabel: string;

	constructor(
		container: HTMLElement,
		options: IIconLabelCreationOptions,
		@IExtensionService private extensionService: IExtensionService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
		@IDecorationsService protected decorationsService: IDecorationsService,
		@IThemeService private themeService: IThemeService,
		@ILabelService protected labelService: ILabelService
	) {
		super(container, options);

		this.registerListeners();
	}

	private registerListeners(): void {

		// update when extensions are registered with potentially new languages
		this._register(this.extensionService.onDidRegisterExtensions(() => this.render(true /* clear cache */)));

		// react to model mode changes
		this._register(this.modelService.onModelModeChanged(e => this.onModelModeChanged(e)));

		// react to file decoration changes
		this._register(this.decorationsService.onDidChangeDecorations(this.onFileDecorationsChanges, this));

		// react to theme changes
		this._register(this.themeService.onThemeChange(() => this.render(false)));

		// react to files.associations changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
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

	setLabel(label: IResourceLabel, options?: IResourceLabelOptions): void {
		const hasResourceChanged = this.hasResourceChanged(label, options);

		this.label = label;
		this.options = options;

		if (hasResourceChanged) {
			this.computedPathLabel = void 0; // reset path label due to resource change
		}

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

		if (newResource && this.computedPathLabel !== this.labelService.getUriLabel(newResource)) {
			return true;
		}

		if (newResource && oldResource) {
			return newResource.toString() !== oldResource.toString();
		}

		if (!newResource && !oldResource) {
			return false;
		}

		return true;
	}

	clear(): void {
		this.label = void 0;
		this.options = void 0;
		this.lastKnownConfiguredLangId = void 0;
		this.computedIconClasses = void 0;
		this.computedPathLabel = void 0;

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
			extraClasses: []
		};

		const resource = this.label.resource;
		const label = this.label.name;

		if (this.options && typeof this.options.title === 'string') {
			iconLabelOptions.title = this.options.title;
		} else if (resource && resource.scheme !== Schemas.data /* do not accidentally inline Data URIs */) {
			if (!this.computedPathLabel) {
				this.computedPathLabel = this.labelService.getUriLabel(resource);
			}

			iconLabelOptions.title = this.computedPathLabel;
		}

		if (this.options && !this.options.hideIcon) {
			if (!this.computedIconClasses) {
				this.computedIconClasses = getIconClasses(this.modelService, this.modeService, resource, this.options && this.options.fileKind);
			}
			iconLabelOptions.extraClasses = this.computedIconClasses.slice(0);
		}
		if (this.options && this.options.extraClasses) {
			iconLabelOptions.extraClasses.push(...this.options.extraClasses);
		}

		if (this.options && this.options.fileDecorations && resource) {
			const deco = this.decorationsService.getDecoration(
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

	dispose(): void {
		super.dispose();

		this.label = void 0;
		this.options = void 0;
		this.lastKnownConfiguredLangId = void 0;
		this.computedIconClasses = void 0;
		this.computedPathLabel = void 0;
	}
}

export class EditorLabel extends ResourceLabel {

	setEditor(editor: IEditorInput, options?: IResourceLabelOptions): void {
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
}

export class FileLabel extends ResourceLabel {

	constructor(
		container: HTMLElement,
		options: IIconLabelCreationOptions,
		@IExtensionService extensionService: IExtensionService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService,
		@IDecorationsService decorationsService: IDecorationsService,
		@IThemeService themeService: IThemeService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@ILabelService labelService: ILabelService
	) {
		super(container, options, extensionService, configurationService, modeService, modelService, decorationsService, themeService, labelService);
	}

	setFile(resource: uri, options?: IFileLabelOptions): void {
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
			description = this.labelService.getUriLabel(resources.dirname(resource), { relative: true });
		}

		this.setLabel({ resource, name, description }, options);
	}
}
