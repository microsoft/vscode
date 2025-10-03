/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Verbosity, EditorInputWithPreferredResource, EditorInputCapabilities, IFileLimitedEditorInputOptions } from '../editor.js';
import { EditorInput } from './editorInput.js';
import { URI } from '../../../base/common/uri.js';
import { ByteSize, IFileReadLimits, IFileService, getLargeFileConfirmationLimit } from '../../../platform/files/common/files.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { dirname, isEqual } from '../../../base/common/resources.js';
import { IFilesConfigurationService } from '../../services/filesConfiguration/common/filesConfigurationService.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { isConfigured } from '../../../platform/configuration/common/configuration.js';
import { ITextResourceConfigurationService } from '../../../editor/common/services/textResourceConfiguration.js';
import { ICustomEditorLabelService } from '../../services/editor/common/customEditorLabelService.js';

/**
 * The base class for all editor inputs that open resources.
 */
export abstract class AbstractResourceEditorInput extends EditorInput implements EditorInputWithPreferredResource {

	override get capabilities(): EditorInputCapabilities {
		let capabilities = EditorInputCapabilities.CanSplitInGroup;

		if (this.fileService.hasProvider(this.resource)) {
			if (this.filesConfigurationService.isReadonly(this.resource)) {
				capabilities |= EditorInputCapabilities.Readonly;
			}
		} else {
			capabilities |= EditorInputCapabilities.Untitled;
		}

		if (!(capabilities & EditorInputCapabilities.Readonly)) {
			capabilities |= EditorInputCapabilities.CanDropIntoEditor;
		}

		return capabilities;
	}

	private _preferredResource: URI;
	get preferredResource(): URI { return this._preferredResource; }

	constructor(
		readonly resource: URI,
		preferredResource: URI | undefined,
		@ILabelService protected readonly labelService: ILabelService,
		@IFileService protected readonly fileService: IFileService,
		@IFilesConfigurationService protected readonly filesConfigurationService: IFilesConfigurationService,
		@ITextResourceConfigurationService protected readonly textResourceConfigurationService: ITextResourceConfigurationService,
		@ICustomEditorLabelService protected readonly customEditorLabelService: ICustomEditorLabelService
	) {
		super();

		this._preferredResource = preferredResource || resource;

		this.registerListeners();
	}

	private registerListeners(): void {

		// Clear our labels on certain label related events
		this._register(this.labelService.onDidChangeFormatters(e => this.onLabelEvent(e.scheme)));
		this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(e => this.onLabelEvent(e.scheme)));
		this._register(this.fileService.onDidChangeFileSystemProviderCapabilities(e => this.onLabelEvent(e.scheme)));
		this._register(this.customEditorLabelService.onDidChange(() => this.updateLabel()));
		this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
	}

	private onLabelEvent(scheme: string): void {
		if (scheme === this._preferredResource.scheme) {
			this.updateLabel();
		}
	}

	private updateLabel(): void {

		// Clear any cached labels from before
		this._name = undefined;
		this._shortDescription = undefined;
		this._mediumDescription = undefined;
		this._longDescription = undefined;
		this._shortTitle = undefined;
		this._mediumTitle = undefined;
		this._longTitle = undefined;

		// Trigger recompute of label
		this._onDidChangeLabel.fire();
	}

	setPreferredResource(preferredResource: URI): void {
		if (!isEqual(preferredResource, this._preferredResource)) {
			this._preferredResource = preferredResource;

			this.updateLabel();
		}
	}

	private _name: string | undefined = undefined;
	override getName(): string {
		if (typeof this._name !== 'string') {
			this._name = this.customEditorLabelService.getName(this._preferredResource) ?? this.labelService.getUriBasenameLabel(this._preferredResource);
		}

		return this._name;
	}

	override getDescription(verbosity = Verbosity.MEDIUM): string | undefined {
		switch (verbosity) {
			case Verbosity.SHORT:
				return this.shortDescription;
			case Verbosity.LONG:
				return this.longDescription;
			case Verbosity.MEDIUM:
			default:
				return this.mediumDescription;
		}
	}

	private _shortDescription: string | undefined = undefined;
	private get shortDescription(): string {
		if (typeof this._shortDescription !== 'string') {
			this._shortDescription = this.labelService.getUriBasenameLabel(dirname(this._preferredResource));
		}

		return this._shortDescription;
	}

	private _mediumDescription: string | undefined = undefined;
	private get mediumDescription(): string {
		if (typeof this._mediumDescription !== 'string') {
			this._mediumDescription = this.labelService.getUriLabel(dirname(this._preferredResource), { relative: true });
		}

		return this._mediumDescription;
	}

	private _longDescription: string | undefined = undefined;
	private get longDescription(): string {
		if (typeof this._longDescription !== 'string') {
			this._longDescription = this.labelService.getUriLabel(dirname(this._preferredResource));
		}

		return this._longDescription;
	}

	private _shortTitle: string | undefined = undefined;
	private get shortTitle(): string {
		if (typeof this._shortTitle !== 'string') {
			this._shortTitle = this.getName();
		}

		return this._shortTitle;
	}

	private _mediumTitle: string | undefined = undefined;
	private get mediumTitle(): string {
		if (typeof this._mediumTitle !== 'string') {
			this._mediumTitle = this.labelService.getUriLabel(this._preferredResource, { relative: true });
		}

		return this._mediumTitle;
	}

	private _longTitle: string | undefined = undefined;
	private get longTitle(): string {
		if (typeof this._longTitle !== 'string') {
			this._longTitle = this.labelService.getUriLabel(this._preferredResource);
		}

		return this._longTitle;
	}

	override getTitle(verbosity?: Verbosity): string {
		switch (verbosity) {
			case Verbosity.SHORT:
				return this.shortTitle;
			case Verbosity.LONG:
				return this.longTitle;
			default:
			case Verbosity.MEDIUM:
				return this.mediumTitle;
		}
	}

	override isReadonly(): boolean | IMarkdownString {
		return this.filesConfigurationService.isReadonly(this.resource);
	}

	protected ensureLimits(options?: IFileLimitedEditorInputOptions): IFileReadLimits | undefined {
		if (options?.limits) {
			return options.limits; // respect passed in limits if any
		}

		// We want to determine the large file configuration based on the best defaults
		// for the resource but also respecting user settings. We only apply user settings
		// if explicitly configured by the user. Otherwise we pick the best limit for the
		// resource scheme.

		const defaultSizeLimit = getLargeFileConfirmationLimit(this.resource);
		let configuredSizeLimit: number | undefined = undefined;

		const configuredSizeLimitMb = this.textResourceConfigurationService.inspect<number>(this.resource, null, 'workbench.editorLargeFileConfirmation');
		if (isConfigured(configuredSizeLimitMb)) {
			configuredSizeLimit = configuredSizeLimitMb.value * ByteSize.MB; // normalize to MB
		}

		return {
			size: configuredSizeLimit ?? defaultSizeLimit
		};
	}
}
