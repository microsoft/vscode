/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls.js';
import { URI } from '../../base/common/uri.js';
import { dirname, isEqual, basenameOrAuthority } from '../../base/common/resources.js';
import { IconLabel, IIconLabelValueOptions, IIconLabelCreationOptions } from '../../base/browser/ui/iconLabel/iconLabel.js';
import { ILanguageService } from '../../editor/common/languages/language.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IModelService } from '../../editor/common/services/model.js';
import { ITextFileService } from '../services/textfile/common/textfiles.js';
import { IDecoration, IDecorationsService, IResourceDecorationChangeEvent } from '../services/decorations/common/decorations.js';
import { Schemas } from '../../base/common/network.js';
import { FileKind, FILES_ASSOCIATIONS_CONFIG } from '../../platform/files/common/files.js';
import { ITextModel } from '../../editor/common/model.js';
import { IThemeService } from '../../platform/theme/common/themeService.js';
import { Event, Emitter } from '../../base/common/event.js';
import { ILabelService } from '../../platform/label/common/label.js';
import { getIconClasses } from '../../editor/common/services/getIconClasses.js';
import { Disposable, dispose, IDisposable, MutableDisposable } from '../../base/common/lifecycle.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { normalizeDriveLetter } from '../../base/common/labels.js';
import { IRange } from '../../editor/common/core/range.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { INotebookDocumentService } from '../services/notebook/common/notebookDocumentService.js';

export interface IResourceLabelProps {
	resource?: URI | { primary?: URI; secondary?: URI };
	name?: string | string[];
	range?: IRange;
	description?: string;
}

function toResource(props: IResourceLabelProps | undefined): URI | undefined {
	if (!props || !props.resource) {
		return undefined;
	}

	if (URI.isUri(props.resource)) {
		return props.resource;
	}

	return props.resource.primary;
}

export interface IResourceLabelOptions extends IIconLabelValueOptions {

	/**
	 * A hint to the file kind of the resource.
	 */
	fileKind?: FileKind;

	/**
	 * File decorations to use for the label.
	 */
	readonly fileDecorations?: { colors: boolean; badges: boolean };

	/**
	 * Will take the provided label as is and e.g. not override it for untitled files.
	 */
	readonly forceLabel?: boolean;

	/**
	 * Uses the provided icon instead of deriving a resource icon.
	 */
	readonly icon?: ThemeIcon | URI;
}

export interface IFileLabelOptions extends IResourceLabelOptions {
	hideLabel?: boolean;
	hidePath?: boolean;
	range?: IRange;
}

export interface IResourceLabel extends IDisposable {

	readonly element: HTMLElement;

	readonly onDidRender: Event<void>;

	/**
	 * Most generic way to apply a label with raw information.
	 */
	setLabel(label?: string, description?: string, options?: IIconLabelValueOptions): void;

	/**
	 * Convenient method to apply a label by passing a resource along.
	 *
	 * Note: for file resources consider to use the #setFile() method instead.
	 */
	setResource(label: IResourceLabelProps, options?: IResourceLabelOptions): void;

	/**
	 * Convenient method to render a file label based on a resource.
	 */
	setFile(resource: URI, options?: IFileLabelOptions): void;

	/**
	 * Resets the label to be empty.
	 */
	clear(): void;
}

export interface IResourceLabelsContainer {
	readonly onDidChangeVisibility: Event<boolean>;
}

export const DEFAULT_LABELS_CONTAINER: IResourceLabelsContainer = {
	onDidChangeVisibility: Event.None
};

export class ResourceLabels extends Disposable {

	private readonly _onDidChangeDecorations = this._register(new Emitter<void>());
	readonly onDidChangeDecorations = this._onDidChangeDecorations.event;

	private widgets: ResourceLabelWidget[] = [];
	private labels: IResourceLabel[] = [];

	constructor(
		container: IResourceLabelsContainer,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IModelService private readonly modelService: IModelService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IDecorationsService private readonly decorationsService: IDecorationsService,
		@IThemeService private readonly themeService: IThemeService,
		@ILabelService private readonly labelService: ILabelService,
		@ITextFileService private readonly textFileService: ITextFileService
	) {
		super();

		this.registerListeners(container);
	}

	private registerListeners(container: IResourceLabelsContainer): void {

		// notify when visibility changes
		this._register(container.onDidChangeVisibility(visible => {
			this.widgets.forEach(widget => widget.notifyVisibilityChanged(visible));
		}));

		// notify when extensions are registered with potentially new languages
		this._register(this.languageService.onDidChange(() => this.widgets.forEach(widget => widget.notifyExtensionsRegistered())));

		// notify when model language changes
		this._register(this.modelService.onModelLanguageChanged(e => {
			if (!e.model.uri) {
				return; // we need the resource to compare
			}

			this.widgets.forEach(widget => widget.notifyModelLanguageChanged(e.model));
		}));

		// notify when model is added
		this._register(this.modelService.onModelAdded(model => {
			if (!model.uri) {
				return; // we need the resource to compare
			}

			this.widgets.forEach(widget => widget.notifyModelAdded(model));
		}));

		// notify when workspace folders changes
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => {
			this.widgets.forEach(widget => widget.notifyWorkspaceFoldersChange());
		}));

		// notify when file decoration changes
		this._register(this.decorationsService.onDidChangeDecorations(e => {
			let notifyDidChangeDecorations = false;
			this.widgets.forEach(widget => {
				if (widget.notifyFileDecorationsChanges(e)) {
					notifyDidChangeDecorations = true;
				}
			});

			if (notifyDidChangeDecorations) {
				this._onDidChangeDecorations.fire();
			}
		}));

		// notify when theme changes
		this._register(this.themeService.onDidColorThemeChange(() => this.widgets.forEach(widget => widget.notifyThemeChange())));

		// notify when files.associations changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(FILES_ASSOCIATIONS_CONFIG)) {
				this.widgets.forEach(widget => widget.notifyFileAssociationsChange());
			}
		}));

		// notify when label formatters change
		this._register(this.labelService.onDidChangeFormatters(e => {
			this.widgets.forEach(widget => widget.notifyFormattersChange(e.scheme));
		}));

		// notify when untitled labels change
		this._register(this.textFileService.untitled.onDidChangeLabel(model => {
			this.widgets.forEach(widget => widget.notifyUntitledLabelChange(model.resource));
		}));
	}

	get(index: number): IResourceLabel {
		return this.labels[index];
	}

	create(container: HTMLElement, options?: IIconLabelCreationOptions): IResourceLabel {
		const widget = this.instantiationService.createInstance(ResourceLabelWidget, container, options);

		// Only expose a handle to the outside
		const label: IResourceLabel = {
			element: widget.element,
			onDidRender: widget.onDidRender,
			setLabel: (label: string, description?: string, options?: IIconLabelValueOptions) => widget.setLabel(label, description, options),
			setResource: (label: IResourceLabelProps, options?: IResourceLabelOptions) => widget.setResource(label, options),
			setFile: (resource: URI, options?: IFileLabelOptions) => widget.setFile(resource, options),
			clear: () => widget.clear(),
			dispose: () => this.disposeWidget(widget)
		};

		// Store
		this.labels.push(label);
		this.widgets.push(widget);

		return label;
	}

	private disposeWidget(widget: ResourceLabelWidget): void {
		const index = this.widgets.indexOf(widget);
		if (index > -1) {
			this.widgets.splice(index, 1);
			this.labels.splice(index, 1);
		}

		dispose(widget);
	}

	clear(): void {
		this.widgets = dispose(this.widgets);
		this.labels = [];
	}

	override dispose(): void {
		super.dispose();

		this.clear();
	}
}

/**
 * Note: please consider to use `ResourceLabels` if you are in need
 * of more than one label for your widget.
 */
export class ResourceLabel extends ResourceLabels {

	private label: IResourceLabel;
	get element(): IResourceLabel { return this.label; }

	constructor(
		container: HTMLElement,
		options: IIconLabelCreationOptions | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IModelService modelService: IModelService,
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
		@ILanguageService languageService: ILanguageService,
		@IDecorationsService decorationsService: IDecorationsService,
		@IThemeService themeService: IThemeService,
		@ILabelService labelService: ILabelService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(DEFAULT_LABELS_CONTAINER, instantiationService, configurationService, modelService, workspaceService, languageService, decorationsService, themeService, labelService, textFileService);

		this.label = this._register(this.create(container, options));
	}
}

enum Redraw {
	Basic = 1,
	Full = 2
}

class ResourceLabelWidget extends IconLabel {

	private readonly _onDidRender = this._register(new Emitter<void>());
	readonly onDidRender = this._onDidRender.event;

	private label: IResourceLabelProps | undefined = undefined;
	private readonly decoration = this._register(new MutableDisposable<IDecoration>());
	private options: IResourceLabelOptions | undefined = undefined;

	private computedIconClasses: string[] | undefined = undefined;
	private computedLanguageId: string | undefined = undefined;
	private computedPathLabel: string | undefined = undefined;
	private computedWorkspaceFolderLabel: string | undefined = undefined;

	private needsRedraw: Redraw | undefined = undefined;
	private isHidden: boolean = false;

	constructor(
		container: HTMLElement,
		options: IIconLabelCreationOptions | undefined,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
		@IDecorationsService private readonly decorationsService: IDecorationsService,
		@ILabelService private readonly labelService: ILabelService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@INotebookDocumentService private readonly notebookDocumentService: INotebookDocumentService
	) {
		super(container, options);
	}

	notifyVisibilityChanged(visible: boolean): void {
		if (visible === this.isHidden) {
			this.isHidden = !visible;

			if (visible && this.needsRedraw) {
				this.render({
					updateIcon: this.needsRedraw === Redraw.Full,
					updateDecoration: this.needsRedraw === Redraw.Full
				});

				this.needsRedraw = undefined;
			}
		}
	}

	notifyModelLanguageChanged(model: ITextModel): void {
		this.handleModelEvent(model);
	}

	notifyModelAdded(model: ITextModel): void {
		this.handleModelEvent(model);
	}

	private handleModelEvent(model: ITextModel): void {
		const resource = toResource(this.label);
		if (!resource) {
			return; // only update if resource exists
		}

		if (isEqual(model.uri, resource)) {
			if (this.computedLanguageId !== model.getLanguageId()) {
				this.computedLanguageId = model.getLanguageId();
				this.render({ updateIcon: true, updateDecoration: false }); // update if the language id of the model has changed from our last known state
			}
		}
	}

	notifyFileDecorationsChanges(e: IResourceDecorationChangeEvent): boolean {
		if (!this.options) {
			return false;
		}

		const resource = toResource(this.label);
		if (!resource) {
			return false;
		}

		if (this.options.fileDecorations && e.affectsResource(resource)) {
			return this.render({ updateIcon: false, updateDecoration: true });
		}

		return false;
	}

	notifyExtensionsRegistered(): void {
		this.render({ updateIcon: true, updateDecoration: false });
	}

	notifyThemeChange(): void {
		this.render({ updateIcon: false, updateDecoration: false });
	}

	notifyFileAssociationsChange(): void {
		this.render({ updateIcon: true, updateDecoration: false });
	}

	notifyFormattersChange(scheme: string): void {
		if (toResource(this.label)?.scheme === scheme) {
			this.render({ updateIcon: false, updateDecoration: false });
		}
	}

	notifyUntitledLabelChange(resource: URI): void {
		if (isEqual(resource, toResource(this.label))) {
			this.render({ updateIcon: false, updateDecoration: false });
		}
	}

	notifyWorkspaceFoldersChange(): void {
		if (typeof this.computedWorkspaceFolderLabel === 'string') {
			const resource = toResource(this.label);
			if (URI.isUri(resource) && this.label?.name === this.computedWorkspaceFolderLabel) {
				this.setFile(resource, this.options);
			}
		}
	}

	setFile(resource: URI, options?: IFileLabelOptions): void {
		const hideLabel = options?.hideLabel;
		let name: string | undefined;
		if (!hideLabel) {
			if (options?.fileKind === FileKind.ROOT_FOLDER) {
				const workspaceFolder = this.contextService.getWorkspaceFolder(resource);
				if (workspaceFolder) {
					name = workspaceFolder.name;
					this.computedWorkspaceFolderLabel = name;
				}
			}

			if (!name) {
				name = normalizeDriveLetter(basenameOrAuthority(resource));
			}
		}

		let description: string | undefined;
		if (!options?.hidePath) {
			const descriptionCandidate = this.labelService.getUriLabel(dirname(resource), { relative: true });
			if (descriptionCandidate && descriptionCandidate !== '.') {
				// omit description if its not significant: a relative path
				// of '.' just indicates that there is no parent to the path
				// https://github.com/microsoft/vscode/issues/208692
				description = descriptionCandidate;
			}
		}

		this.setResource({ resource, name, description, range: options?.range }, options);
	}

	setResource(label: IResourceLabelProps, options: IResourceLabelOptions = Object.create(null)): void {
		const resource = toResource(label);
		const isSideBySideEditor = label?.resource && !URI.isUri(label.resource);

		if (!options.forceLabel && !isSideBySideEditor && resource?.scheme === Schemas.untitled) {
			// Untitled labels are very dynamic because they may change
			// whenever the content changes (unless a path is associated).
			// As such we always ask the actual editor for it's name and
			// description to get latest in case name/description are
			// provided. If they are not provided from the label we got
			// we assume that the client does not want to display them
			// and as such do not override.
			//
			// We do not touch the label if it represents a primary-secondary
			// because in that case we expect it to carry a proper label
			// and description.
			const untitledModel = this.textFileService.untitled.get(resource);
			if (untitledModel && !untitledModel.hasAssociatedFilePath) {
				if (typeof label.name === 'string') {
					label.name = untitledModel.name;
				}

				if (typeof label.description === 'string') {
					const untitledDescription = untitledModel.resource.path;
					if (label.name !== untitledDescription) {
						label.description = untitledDescription;
					} else {
						label.description = undefined;
					}
				}

				const untitledTitle = untitledModel.resource.path;
				if (untitledModel.name !== untitledTitle) {
					options.title = `${untitledModel.name} • ${untitledTitle}`;
				} else {
					options.title = untitledTitle;
				}
			}
		}

		if (!options.forceLabel && !isSideBySideEditor && resource?.scheme === Schemas.vscodeNotebookCell) {
			// Notebook cells are embeded in a notebook document
			// As such we always ask the actual notebook document
			// for its position in the document.
			const notebookDocument = this.notebookDocumentService.getNotebook(resource);
			const cellIndex = notebookDocument?.getCellIndex(resource);
			if (notebookDocument && cellIndex !== undefined && typeof label.name === 'string') {
				options.title = localize('notebookCellLabel', "{0} • Cell {1}", label.name, `${cellIndex + 1}`);
			}

			if (typeof label.name === 'string' && notebookDocument && cellIndex !== undefined && typeof label.name === 'string') {
				label.name = localize('notebookCellLabel', "{0} • Cell {1}", label.name, `${cellIndex + 1}`);
			}
		}

		const hasResourceChanged = this.hasResourceChanged(label);
		const hasPathLabelChanged = hasResourceChanged || this.hasPathLabelChanged(label);
		const hasFileKindChanged = this.hasFileKindChanged(options);
		const hasIconChanged = this.hasIconChanged(options);

		this.label = label;
		this.options = options;

		if (hasResourceChanged) {
			this.computedLanguageId = undefined; // reset computed language since resource changed
		}

		if (hasPathLabelChanged) {
			this.computedPathLabel = undefined; // reset path label due to resource/path-label change
		}

		this.render({
			updateIcon: hasResourceChanged || hasFileKindChanged || hasIconChanged,
			updateDecoration: hasResourceChanged || hasFileKindChanged
		});
	}

	private hasFileKindChanged(newOptions?: IResourceLabelOptions): boolean {
		const newFileKind = newOptions?.fileKind;
		const oldFileKind = this.options?.fileKind;

		return newFileKind !== oldFileKind; // same resource but different kind (file, folder)
	}

	private hasResourceChanged(newLabel: IResourceLabelProps): boolean {
		const newResource = toResource(newLabel);
		const oldResource = toResource(this.label);

		if (newResource && oldResource) {
			return newResource.toString() !== oldResource.toString();
		}

		if (!newResource && !oldResource) {
			return false;
		}

		return true;
	}

	private hasPathLabelChanged(newLabel: IResourceLabelProps): boolean {
		const newResource = toResource(newLabel);

		return !!newResource && this.computedPathLabel !== this.labelService.getUriLabel(newResource);
	}

	private hasIconChanged(newOptions?: IResourceLabelOptions): boolean {
		return this.options?.icon !== newOptions?.icon;
	}

	clear(): void {
		this.label = undefined;
		this.options = undefined;
		this.computedLanguageId = undefined;
		this.computedIconClasses = undefined;
		this.computedPathLabel = undefined;

		this.setLabel('');
	}

	private render(options: { updateIcon: boolean; updateDecoration: boolean }): boolean {
		if (this.isHidden) {
			if (this.needsRedraw !== Redraw.Full) {
				this.needsRedraw = (options.updateIcon || options.updateDecoration) ? Redraw.Full : Redraw.Basic;
			}

			return false;
		}

		if (options.updateIcon) {
			this.computedIconClasses = undefined;
		}

		if (!this.label) {
			return false;
		}

		const iconLabelOptions: IIconLabelValueOptions & { extraClasses: string[] } = {
			title: '',
			italic: this.options?.italic,
			strikethrough: this.options?.strikethrough,
			matches: this.options?.matches,
			descriptionMatches: this.options?.descriptionMatches,
			extraClasses: [],
			separator: this.options?.separator,
			domId: this.options?.domId,
			disabledCommand: this.options?.disabledCommand,
			labelEscapeNewLines: this.options?.labelEscapeNewLines,
			descriptionTitle: this.options?.descriptionTitle,
		};

		const resource = toResource(this.label);

		if (this.options?.title !== undefined) {
			iconLabelOptions.title = this.options.title;
		}

		if (resource && resource.scheme !== Schemas.data /* do not accidentally inline Data URIs */
			&& (
				(!this.options?.title)
				|| ((typeof this.options.title !== 'string') && !this.options.title.markdownNotSupportedFallback)
			)) {

			if (!this.computedPathLabel) {
				this.computedPathLabel = this.labelService.getUriLabel(resource);
			}

			if (!iconLabelOptions.title || (typeof iconLabelOptions.title === 'string')) {
				iconLabelOptions.title = this.computedPathLabel;
			} else if (!iconLabelOptions.title.markdownNotSupportedFallback) {
				iconLabelOptions.title.markdownNotSupportedFallback = this.computedPathLabel;
			}
		}

		if (this.options && !this.options.hideIcon) {
			if (!this.computedIconClasses) {
				this.computedIconClasses = getIconClasses(this.modelService, this.languageService, resource, this.options.fileKind, this.options.icon);
			}

			if (URI.isUri(this.options.icon)) {
				iconLabelOptions.iconPath = this.options.icon;
			}

			iconLabelOptions.extraClasses = this.computedIconClasses.slice(0);
		}

		if (this.options?.extraClasses) {
			iconLabelOptions.extraClasses.push(...this.options.extraClasses);
		}

		if (this.options?.fileDecorations && resource) {
			if (options.updateDecoration) {
				this.decoration.value = this.decorationsService.getDecoration(resource, this.options.fileKind !== FileKind.FILE);
			}

			const decoration = this.decoration.value;
			if (decoration) {
				if (decoration.tooltip) {
					if (typeof iconLabelOptions.title === 'string') {
						iconLabelOptions.title = `${iconLabelOptions.title} • ${decoration.tooltip}`;
					} else if (typeof iconLabelOptions.title?.markdown === 'string') {
						const title = `${iconLabelOptions.title.markdown} • ${decoration.tooltip}`;
						iconLabelOptions.title = { markdown: title, markdownNotSupportedFallback: title };
					}
				}

				if (decoration.strikethrough) {
					iconLabelOptions.strikethrough = true;
				}

				if (this.options.fileDecorations.colors) {
					iconLabelOptions.extraClasses.push(decoration.labelClassName);
				}

				if (this.options.fileDecorations.badges) {
					iconLabelOptions.extraClasses.push(decoration.badgeClassName);
					iconLabelOptions.extraClasses.push(decoration.iconClassName);
				}
			}
		}

		if (this.label.range) {
			iconLabelOptions.suffix = this.label.range.startLineNumber !== this.label.range.endLineNumber ?
				`:${this.label.range.startLineNumber}-${this.label.range.endLineNumber}` :
				`:${this.label.range.startLineNumber}`;
		}

		this.setLabel(this.label.name ?? '', this.label.description, iconLabelOptions);

		this._onDidRender.fire();

		return true;
	}

	override dispose(): void {
		super.dispose();

		this.label = undefined;
		this.options = undefined;
		this.computedLanguageId = undefined;
		this.computedIconClasses = undefined;
		this.computedPathLabel = undefined;
		this.computedWorkspaceFolderLabel = undefined;
	}
}
