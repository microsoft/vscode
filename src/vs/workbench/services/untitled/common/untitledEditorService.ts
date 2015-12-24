/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {UntitledEditorInput} from 'vs/workbench/common/editor';
import {ServiceIdentifier, createDecorator} from 'vs/platform/instantiation/common/instantiation';

export var IUntitledEditorService = createDecorator<IUntitledEditorService>('untitledEditorService');

export interface IUntitledEditorService {

	serviceId : ServiceIdentifier<any>;

	/**
	 * Returns the untitled editor input matching the provided resource.
	 */
	get(resource: URI): UntitledEditorInput;

	/**
	 * Returns all untitled editor inputs.
	 */
	getAll(resources?: URI[]): UntitledEditorInput[];

	/**
	 * Returns dirty untitled editors as resource URIs.
	 */
	getDirty(): URI[];

	/**
	 * Returns true iff the provided resource is dirty.
	 */
	isDirty(resource: URI): boolean;

	/**
	 * Creates a new untitled input with the optional resource URI or returns an existing one
	 * if the provided resource exists already as untitled input.
	 *
	 * It is valid to pass in a file resource. In that case the path will be used as identifier.
	 * The use case is to be able to create a new file with a specific path with VSCode.
	 */
	createOrGet(resource?: URI, modeId?: string): UntitledEditorInput;

	/**
	 * A check to find out if a untitled resource has a file path associated or not.
	 */
	hasAssociatedFilePath(resource: URI): boolean;
}