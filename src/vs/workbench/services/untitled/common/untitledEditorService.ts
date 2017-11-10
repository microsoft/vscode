/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import arrays = require('vs/base/common/arrays');
import { UntitledEditorInput } from 'vs/workbench/common/editor/untitledEditorInput';
import { IFilesConfiguration } from 'vs/platform/files/common/files';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import Event, { Emitter, once } from 'vs/base/common/event';
import { ResourceMap } from 'vs/base/common/map';
import { TPromise } from 'vs/base/common/winjs.base';
import { UntitledEditorModel } from 'vs/workbench/common/editor/untitledEditorModel';
import { Schemas } from 'vs/base/common/network';

export const IUntitledEditorService = createDecorator<IUntitledEditorService>('untitledEditorService');

export const UNTITLED_SCHEMA = 'untitled';

export interface IModelLoadOrCreateOptions {
	resource?: URI;
	modeId?: string;
	initialValue?: string;
	encoding?: string;
}

export interface IUntitledEditorService {

	_serviceBrand: any;

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
	createOrGet(resource?: URI, modeId?: string, initialValue?: string, encoding?: string): UntitledEditorInput;

	/**
	 * Creates a new untitled model with the optional resource URI or returns an existing one
	 * if the provided resource exists already as untitled model.
	 *
	 * It is valid to pass in a file resource. In that case the path will be used as identifier.
	 * The use case is to be able to create a new file with a specific path with VSCode.
	 */
	loadOrCreate(options: IModelLoadOrCreateOptions): TPromise<UntitledEditorModel>;

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
	getEncoding(resource: URI): string;
}

export class UntitledEditorService implements IUntitledEditorService {

	public _serviceBrand: any;

	private mapResourceToInput = new ResourceMap<UntitledEditorInput>();
	private mapResourceToAssociatedFilePath = new ResourceMap<boolean>();

	private _onDidChangeContent: Emitter<URI>;
	private _onDidChangeDirty: Emitter<URI>;
	private _onDidChangeEncoding: Emitter<URI>;
	private _onDidDisposeModel: Emitter<URI>;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this._onDidChangeContent = new Emitter<URI>();
		this._onDidChangeDirty = new Emitter<URI>();
		this._onDidChangeEncoding = new Emitter<URI>();
		this._onDidDisposeModel = new Emitter<URI>();
	}

	public get onDidDisposeModel(): Event<URI> {
		return this._onDidDisposeModel.event;
	}

	public get onDidChangeContent(): Event<URI> {
		return this._onDidChangeContent.event;
	}

	public get onDidChangeDirty(): Event<URI> {
		return this._onDidChangeDirty.event;
	}

	public get onDidChangeEncoding(): Event<URI> {
		return this._onDidChangeEncoding.event;
	}

	protected get(resource: URI): UntitledEditorInput {
		return this.mapResourceToInput.get(resource);
	}

	protected getAll(resources?: URI[]): UntitledEditorInput[] {
		if (resources) {
			return arrays.coalesce(resources.map(r => this.get(r)));
		}

		return this.mapResourceToInput.values();
	}

	public exists(resource: URI): boolean {
		return this.mapResourceToInput.has(resource);
	}

	public revertAll(resources?: URI[], force?: boolean): URI[] {
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

	public isDirty(resource: URI): boolean {
		const input = this.get(resource);

		return input && input.isDirty();
	}

	public getDirty(resources?: URI[]): URI[] {
		let inputs: UntitledEditorInput[];
		if (resources) {
			inputs = resources.map(r => this.get(r)).filter(i => !!i);
		} else {
			inputs = this.mapResourceToInput.values();
		}

		return inputs
			.filter(i => i.isDirty())
			.map(i => i.getResource());
	}

	public loadOrCreate(options: IModelLoadOrCreateOptions = Object.create(null)): TPromise<UntitledEditorModel> {
		return this.createOrGet(options.resource, options.modeId, options.initialValue, options.encoding).resolve();
	}

	public createOrGet(resource?: URI, modeId?: string, initialValue?: string, encoding?: string): UntitledEditorInput {

		// Massage resource if it comes with a file:// scheme
		let hasAssociatedFilePath = false;
		if (resource) {
			hasAssociatedFilePath = (resource.scheme === Schemas.file);
			resource = resource.with({ scheme: UNTITLED_SCHEMA }); // ensure we have the right scheme

			if (hasAssociatedFilePath) {
				this.mapResourceToAssociatedFilePath.set(resource, true); // remember for future lookups
			}
		}

		// Return existing instance if asked for it
		if (resource && this.mapResourceToInput.has(resource)) {
			return this.mapResourceToInput.get(resource);
		}

		// Create new otherwise
		return this.doCreate(resource, hasAssociatedFilePath, modeId, initialValue, encoding);
	}

	private doCreate(resource?: URI, hasAssociatedFilePath?: boolean, modeId?: string, initialValue?: string, encoding?: string): UntitledEditorInput {
		if (!resource) {

			// Create new taking a resource URI that is not already taken
			let counter = this.mapResourceToInput.size + 1;
			do {
				resource = URI.from({ scheme: UNTITLED_SCHEMA, path: `Untitled-${counter}` });
				counter++;
			} while (this.mapResourceToInput.has(resource));
		}

		// Look up default language from settings if any
		if (!modeId && !hasAssociatedFilePath) {
			const configuration = this.configurationService.getConfiguration<IFilesConfiguration>();
			if (configuration.files && configuration.files.defaultLanguage) {
				modeId = configuration.files.defaultLanguage;
			}
		}

		const input = this.instantiationService.createInstance(UntitledEditorInput, resource, hasAssociatedFilePath, modeId, initialValue, encoding);

		const contentListener = input.onDidModelChangeContent(() => {
			this._onDidChangeContent.fire(resource);
		});

		const dirtyListener = input.onDidChangeDirty(() => {
			this._onDidChangeDirty.fire(resource);
		});

		const encodingListener = input.onDidModelChangeEncoding(() => {
			this._onDidChangeEncoding.fire(resource);
		});

		const disposeListener = input.onDispose(() => {
			this._onDidDisposeModel.fire(resource);
		});

		// Remove from cache on dispose
		const onceDispose = once(input.onDispose);
		onceDispose(() => {
			this.mapResourceToInput.delete(input.getResource());
			this.mapResourceToAssociatedFilePath.delete(input.getResource());
			contentListener.dispose();
			dirtyListener.dispose();
			encodingListener.dispose();
			disposeListener.dispose();
		});

		// Add to cache
		this.mapResourceToInput.set(resource, input);

		return input;
	}

	public hasAssociatedFilePath(resource: URI): boolean {
		return this.mapResourceToAssociatedFilePath.has(resource);
	}

	public suggestFileName(resource: URI): string {
		const input = this.get(resource);

		return input ? input.suggestFileName() : void 0;
	}

	public getEncoding(resource: URI): string {
		const input = this.get(resource);

		return input ? input.getEncoding() : void 0;
	}

	public dispose(): void {
		this._onDidChangeContent.dispose();
		this._onDidChangeDirty.dispose();
		this._onDidChangeEncoding.dispose();
		this._onDidDisposeModel.dispose();
	}
}
