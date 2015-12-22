/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {EventType} from 'vs/base/common/events';
import arrays = require('vs/base/common/arrays');
import {UntitledEditorInput} from 'vs/workbench/browser/parts/editor/untitledEditorInput';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

export class UntitledEditorService implements IUntitledEditorService {
	public serviceId = IUntitledEditorService;

	private static CACHE: { [resource: string]: UntitledEditorInput } = Object.create(null);
	private static KNOWN_ASSOCIATED_FILE_PATHS: { [resource: string]: boolean } = Object.create(null);

	private instantiationService: IInstantiationService;

	public setInstantiationService(service: IInstantiationService): void {
		this.instantiationService = service;
	}

	public get(resource: URI): UntitledEditorInput {
		return UntitledEditorService.CACHE[resource.toString()];
	}

	public getAll(resources?: URI[]): UntitledEditorInput[] {
		if (resources) {
			return arrays.coalesce(resources.map((r) => this.get(r)));
		}

		return Object.keys(UntitledEditorService.CACHE).map((key) => UntitledEditorService.CACHE[key]);
	}

	public isDirty(resource: URI): boolean {
		let input = this.get(resource);

		return input && input.isDirty();
	}

	public getDirty(): URI[] {
		return Object.keys(UntitledEditorService.CACHE)
			.map((key) => UntitledEditorService.CACHE[key])
			.filter((i) => i.isDirty())
			.map((i) => i.getResource());
	}

	public createOrGet(resource?: URI, modeId?: string): UntitledEditorInput {
		let hasAssociatedFilePath = false;
		if (resource) {
			hasAssociatedFilePath = (resource.scheme === 'file');
			resource = this.resourceToUntitled(resource); // ensure we have the right scheme

			if (hasAssociatedFilePath) {
				UntitledEditorService.KNOWN_ASSOCIATED_FILE_PATHS[resource.toString()] = true; // remember for future lookups
			}
		}

		// Return existing instance if asked for it
		if (resource && UntitledEditorService.CACHE[resource.toString()]) {
			return UntitledEditorService.CACHE[resource.toString()];
		}

		// Create new otherwise
		return this.doCreate(resource, hasAssociatedFilePath, modeId);
	}

	private doCreate(resource?: URI, hasAssociatedFilePath?: boolean, modeId?: string): UntitledEditorInput {
		if (!resource) {

			// Create new taking a resource URI that is not already taken
			let counter = Object.keys(UntitledEditorService.CACHE).length + 1;
			do {
				resource = URI.create(UntitledEditorInput.SCHEMA, null, 'Untitled-' + counter);
				counter++;
			} while (Object.keys(UntitledEditorService.CACHE).indexOf(resource.toString()) >= 0);
		}

		let input = this.instantiationService.createInstance(UntitledEditorInput, resource, hasAssociatedFilePath, modeId);

		// Remove from cache on dispose
		input.addOneTimeListener(EventType.DISPOSE, () => {
			delete UntitledEditorService.CACHE[input.getResource().toString()];
			delete UntitledEditorService.KNOWN_ASSOCIATED_FILE_PATHS[input.getResource().toString()];
		});

		// Add to cache
		UntitledEditorService.CACHE[resource.toString()] = input;

		return input;
	}

	private resourceToUntitled(resource: URI): URI {
		if (resource.scheme === UntitledEditorInput.SCHEMA) {
			return resource;
		}

		return URI.create(UntitledEditorInput.SCHEMA, null, resource.fsPath);
	}

	public hasAssociatedFilePath(resource: URI): boolean {
		return !!UntitledEditorService.KNOWN_ASSOCIATED_FILE_PATHS[resource.toString()];
	}
}