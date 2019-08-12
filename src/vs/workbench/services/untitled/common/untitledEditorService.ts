/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createDecorator, IInstantiationService, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import * as arrays from 'vs/base/common/arrays';
import { UntitledEditorInput } from 'vs/workbench/common/editor/untitledEditorInput';
import { IFilesConfiguration, IFileService } from 'vs/platform/files/common/files';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Event, Emitter } from 'vs/base/common/event';
import { ResourceMap } from 'vs/base/common/map';
import { UntitledEditorModel } from 'vs/workbench/common/editor/untitledEditorModel';
import { Schemas } from 'vs/base/common/network';
import { Disposable } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { basename } from 'vs/base/common/resources';

export const IUntitledEditorService = createDecorator<IUntitledEditorService>('untitledEditorService');

export interface IModelLoadOrCreateOptions {
	resource?: URI;
	mode?: string;
	initialValue?: string;
	encoding?: string;
	useResourcePath?: boolean;
}

export interface IUntitledEditorService {

	_serviceBrand: ServiceIdentifier<IUntitledEditorService>;

	/**
	 * Events for when untitled editors content changes (e.g. any keystroke).
	 */
	onDidChangeContent: Event<URI>;

	/**
	 * Events for when untitled editors change (e.g. getting dirty, saved or reverted).
	 */
	onDidChangeDirty: Event<URI>;

	/**
	 * Events for when untitled editor encodings change.
	 */
	onDidChangeEncoding: Event<URI>;

	/**
	 * Events for when untitled editors are disposed.
	 */
	onDidDisposeModel: Event<URI>;

	/**
	 * Returns if an untitled resource with the given URI exists.
	 */
	exists(resource: URI): boolean;

	/**
	 * Returns dirty untitled editors as resource URIs.
	 */
	getDirty(resources?: URI[]): URI[];

	/**
	 * Returns true if the provided resource is dirty.
	 */
	isDirty(resource: URI): boolean;

	/**
	 * Find out if a backup with the provided resource exists and has a backup on disk.
	 */
	hasBackup(resource: URI): boolean;

	/**
	 * Reverts the untitled resources if found.
	 */
	revertAll(resources?: URI[]): URI[];

	/**
	 * Creates a new untitled input with the optional resource URI or returns an existing one
	 * if the provided resource exists already as untitled input.
	 *
	 * It is valid to pass in a file resource. In that case the path will be used as identifier.
	 * The use case is to be able to create a new file with a specific path with VSCode.
	 */
	createOrGet(resource?: URI, mode?: string, initialValue?: string, encoding?: string): UntitledEditorInput;

	/**
	 * Creates a new untitled model with the optional resource URI or returns an existing one
	 * if the provided resource exists already as untitled model.
	 *
	 * It is valid to pass in a file resource. In that case the path will be used as identifier.
	 * The use case is to be able to create a new file with a specific path with VSCode.
	 */
	loadOrCreate(options: IModelLoadOrCreateOptions): Promise<UntitledEditorModel>;

	/**
	 * A check to find out if a untitled resource has a file path associated or not.
	 */
	hasAssociatedFilePath(resource: URI): boolean;

	/**
	 * Suggests a filename for the given untitled resource if it is known.
	 */
	suggestFileName(resource: URI): string;

	/**
	 * Get the configured encoding for the given untitled resource if any.
	 */
	getEncoding(resource: URI): string | undefined;
}

export class UntitledEditorService extends Disposable implements IUntitledEditorService {

	_serviceBrand!: ServiceIdentifier<any>;

	private mapResourceToInput = new ResourceMap<UntitledEditorInput>();
	private mapResourceToAssociatedFilePath = new ResourceMap<boolean>();

	private readonly _onDidChangeContent: Emitter<URI> = this._register(new Emitter<URI>());
	readonly onDidChangeContent: Event<URI> = this._onDidChangeContent.event;

	private readonly _onDidChangeDirty: Emitter<URI> = this._register(new Emitter<URI>());
	readonly onDidChangeDirty: Event<URI> = this._onDidChangeDirty.event;

	private readonly _onDidChangeEncoding: Emitter<URI> = this._register(new Emitter<URI>());
	readonly onDidChangeEncoding: Event<URI> = this._onDidChangeEncoding.event;

	private readonly _onDidDisposeModel: Emitter<URI> = this._register(new Emitter<URI>());
	readonly onDidDisposeModel: Event<URI> = this._onDidDisposeModel.event;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService
	) {
		super();
	}

	protected get(resource: URI): UntitledEditorInput | undefined {
		return this.mapResourceToInput.get(resource);
	}

	protected getAll(resources?: URI[]): UntitledEditorInput[] {
		if (resources) {
			return arrays.coalesce(resources.map(r => this.get(r)));
		}

		return this.mapResourceToInput.values();
	}

	exists(resource: URI): boolean {
		return this.mapResourceToInput.has(resource);
	}

	revertAll(resources?: URI[], force?: boolean): URI[] {
		const reverted: URI[] = [];

		const untitledInputs = this.getAll(resources);
		untitledInputs.forEach(input => {
			if (input) {
				input.revert();
				input.dispose();

				reverted.push(input.getResource());
			}
		});

		return reverted;
	}

	isDirty(resource: URI): boolean {
		const input = this.get(resource);

		return input ? input.isDirty() : false;
	}

	hasBackup(resource: URI): boolean {
		const input = this.get(resource);

		return input ? input.hasBackup() : false;
	}

	getDirty(resources?: URI[]): URI[] {
		let inputs: UntitledEditorInput[];
		if (resources) {
			inputs = arrays.coalesce(resources.map(r => this.get(r)));
		} else {
			inputs = this.mapResourceToInput.values();
		}

		return inputs
			.filter(i => i.isDirty())
			.map(i => i.getResource());
	}

	loadOrCreate(options: IModelLoadOrCreateOptions = Object.create(null)): Promise<UntitledEditorModel> {
		return this.createOrGet(options.resource, options.mode, options.initialValue, options.encoding, options.useResourcePath).resolve();
	}

	createOrGet(resource?: URI, mode?: string, initialValue?: string, encoding?: string, hasAssociatedFilePath: boolean = false): UntitledEditorInput {
		if (resource) {

			// Massage resource if it comes with known file based resource
			if (this.fileService.canHandleResource(resource)) {
				hasAssociatedFilePath = true;
				resource = resource.with({ scheme: Schemas.untitled }); // ensure we have the right scheme
			}

			if (hasAssociatedFilePath) {
				this.mapResourceToAssociatedFilePath.set(resource, true); // remember for future lookups
			}
		}

		// Return existing instance if asked for it
		if (resource && this.mapResourceToInput.has(resource)) {
			return this.mapResourceToInput.get(resource)!;
		}

		// Create new otherwise
		return this.doCreate(resource, hasAssociatedFilePath, mode, initialValue, encoding);
	}

	private doCreate(resource?: URI, hasAssociatedFilePath?: boolean, mode?: string, initialValue?: string, encoding?: string): UntitledEditorInput {
		let untitledResource: URI;
		if (resource) {
			untitledResource = resource;
		} else {

			// Create new taking a resource URI that is not already taken
			let counter = this.mapResourceToInput.size + 1;
			do {
				untitledResource = URI.from({ scheme: Schemas.untitled, path: `Untitled-${counter}` });
				counter++;
			} while (this.mapResourceToInput.has(untitledResource));
		}

		// Look up default language from settings if any
		if (!mode && !hasAssociatedFilePath) {
			const configuration = this.configurationService.getValue<IFilesConfiguration>();
			if (configuration.files && configuration.files.defaultLanguage) {
				mode = configuration.files.defaultLanguage;
			}
		}

		const input = this.instantiationService.createInstance(UntitledEditorInput, untitledResource, hasAssociatedFilePath, mode, initialValue, encoding);

		const contentListener = input.onDidModelChangeContent(() => this._onDidChangeContent.fire(untitledResource));
		const dirtyListener = input.onDidChangeDirty(() => this._onDidChangeDirty.fire(untitledResource));
		const encodingListener = input.onDidModelChangeEncoding(() => this._onDidChangeEncoding.fire(untitledResource));
		const disposeListener = input.onDispose(() => this._onDidDisposeModel.fire(untitledResource));

		// Remove from cache on dispose
		const onceDispose = Event.once(input.onDispose);
		onceDispose(() => {
			this.mapResourceToInput.delete(input.getResource());
			this.mapResourceToAssociatedFilePath.delete(input.getResource());
			contentListener.dispose();
			dirtyListener.dispose();
			encodingListener.dispose();
			disposeListener.dispose();
		});

		// Add to cache
		this.mapResourceToInput.set(untitledResource, input);

		return input;
	}

	hasAssociatedFilePath(resource: URI): boolean {
		return this.mapResourceToAssociatedFilePath.has(resource);
	}

	suggestFileName(resource: URI): string {
		const input = this.get(resource);

		return input ? input.suggestFileName() : basename(resource);
	}

	getEncoding(resource: URI): string | undefined {
		const input = this.get(resource);

		return input ? input.getEncoding() : undefined;
	}
}

registerSingleton(IUntitledEditorService, UntitledEditorService, true);
