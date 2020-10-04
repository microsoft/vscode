/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput, Verbosity, GroupIdentifier, IEditorInput, ISaveOptions, IRevertOptions, IEditorInputWithPreferredResource } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { ITextFileService, ITextFileSaveOptions } from 'vs/workbench/services/textfile/common/textfiles';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IFileService, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';
import { IFilesConfigurationService, AutoSaveMode } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { Schemas } from 'vs/base/common/network';
import { dirname, isEqual } from 'vs/base/common/resources';

/**
 * The base class for all editor inputs that open in text editors.
 */
export abstract class AbstractTextResourceEditorInput extends EditorInput implements IEditorInputWithPreferredResource {

	private _preferredResource: URI;
	get preferredResource(): URI { return this._preferredResource; }

	constructor(
		public readonly resource: URI,
		preferredResource: URI | undefined,
		@IEditorService protected readonly editorService: IEditorService,
		@IEditorGroupsService protected readonly editorGroupService: IEditorGroupsService,
		@ITextFileService protected readonly textFileService: ITextFileService,
		@ILabelService protected readonly labelService: ILabelService,
		@IFileService protected readonly fileService: IFileService,
		@IFilesConfigurationService protected readonly filesConfigurationService: IFilesConfigurationService
	) {
		super();

		this._preferredResource = preferredResource || resource;

		this.registerListeners();
	}

	protected registerListeners(): void {

		// Clear label memoizer on certain events that have impact
		this._register(this.labelService.onDidChangeFormatters(e => this.onLabelEvent(e.scheme)));
		this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(e => this.onLabelEvent(e.scheme)));
		this._register(this.fileService.onDidChangeFileSystemProviderCapabilities(e => this.onLabelEvent(e.scheme)));
	}

	private onLabelEvent(scheme: string): void {
		if (scheme === this._preferredResource.scheme) {
			this.updateLabel();
		}
	}

	private updateLabel(): void {

		// Clear any cached labels from before
		this._basename = undefined;
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

	getName(): string {
		return this.basename;
	}

	private _basename: string | undefined;
	private get basename(): string {
		if (!this._basename) {
			this._basename = this.labelService.getUriBasenameLabel(this._preferredResource);
		}

		return this._basename;
	}

	getDescription(verbosity: Verbosity = Verbosity.MEDIUM): string | undefined {
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
		if (!this._shortDescription) {
			this._shortDescription = this.labelService.getUriBasenameLabel(dirname(this._preferredResource));
		}
		return this._shortDescription;
	}

	private _mediumDescription: string | undefined = undefined;
	private get mediumDescription(): string {
		if (!this._mediumDescription) {
			this._mediumDescription = this.labelService.getUriLabel(dirname(this._preferredResource), { relative: true });
		}
		return this._mediumDescription;
	}

	private _longDescription: string | undefined = undefined;
	private get longDescription(): string {
		if (!this._longDescription) {
			this._longDescription = this.labelService.getUriLabel(dirname(this._preferredResource));
		}
		return this._longDescription;
	}

	private _shortTitle: string | undefined = undefined;
	private get shortTitle(): string {
		if (!this._shortTitle) {
			this._shortTitle = this.getName();
		}
		return this._shortTitle;
	}

	private _mediumTitle: string | undefined = undefined;
	private get mediumTitle(): string {
		if (!this._mediumTitle) {
			this._mediumTitle = this.labelService.getUriLabel(this._preferredResource, { relative: true });
		}
		return this._mediumTitle;
	}

	private _longTitle: string | undefined = undefined;
	private get longTitle(): string {
		if (!this._longTitle) {
			this._longTitle = this.labelService.getUriLabel(this._preferredResource);
		}
		return this._longTitle;
	}

	getTitle(verbosity: Verbosity): string {
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

	isUntitled(): boolean {
		//  anyFile: is never untitled as it can be saved
		// untitled: is untitled by definition
		// anyOther: is untitled because it cannot be saved, as such we expect a "Save As" dialog
		return !this.fileService.canHandleResource(this.resource);
	}

	isReadonly(): boolean {
		if (this.isUntitled()) {
			return false; // untitled is never readonly
		}

		return this.fileService.hasCapability(this.resource, FileSystemProviderCapabilities.Readonly);
	}

	isSaving(): boolean {
		if (this.isUntitled()) {
			return false; // untitled is never saving automatically
		}

		if (this.filesConfigurationService.getAutoSaveMode() === AutoSaveMode.AFTER_SHORT_DELAY) {
			return true; // a short auto save is configured, treat this as being saved
		}

		return false;
	}

	save(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<IEditorInput | undefined> {

		// If this is neither an `untitled` resource, nor a resource
		// we can handle with the file service, we can only "Save As..."
		if (this.resource.scheme !== Schemas.untitled && !this.fileService.canHandleResource(this.resource)) {
			return this.saveAs(group, options);
		}

		// Normal save
		return this.doSave(group, options, false);
	}

	saveAs(group: GroupIdentifier, options?: ITextFileSaveOptions): Promise<IEditorInput | undefined> {
		return this.doSave(group, options, true);
	}

	private async doSave(group: GroupIdentifier, options: ISaveOptions | undefined, saveAs: boolean): Promise<IEditorInput | undefined> {

		// Save / Save As
		let target: URI | undefined;
		if (saveAs) {
			target = await this.textFileService.saveAs(this.resource, undefined, { ...options, suggestedTarget: this.preferredResource });
		} else {
			target = await this.textFileService.save(this.resource, options);
		}

		if (!target) {
			return undefined; // save cancelled
		}

		// If the target is a different resource, return with a new editor input
		if (!isEqual(target, this.resource)) {
			return this.editorService.createEditorInput({ resource: target });
		}

		return this;
	}

	async revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		await this.textFileService.revert(this.resource, options);
	}
}
