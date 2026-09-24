/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../base/common/lifecycle.js';
import type { IPath } from '../../../base/common/path.js';
import type { OperatingSystem } from '../../../base/common/platform.js';
import type { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IPathService = createDecorator<IPathService>('pathService');

export interface IResourcePathProvider {
	getOperatingSystem(resource: URI): Promise<OperatingSystem | undefined>;
}

/**
 * Provides access to path related properties that match the target environment.
 */
export interface IPathService {

	readonly _serviceBrand: undefined;

	/**
	 * The correct path library to use for the ambient target environment.
	 */
	readonly path: Promise<IPath>;

	/**
	 * Determines the best default URI scheme for the current workspace.
	 */
	readonly defaultUriScheme: string;

	/**
	 * Converts the given path to a file URI for the ambient target environment.
	 */
	fileURI(path: string): Promise<URI>;

	/**
	 * Resolves the user-home directory for the ambient target environment.
	 */
	userHome(options: { preferLocal: true }): URI;
	userHome(options?: { preferLocal: boolean }): Promise<URI>;

	/**
	 * Figures out if the provided resource has a valid file name for the operating system the file is saved to.
	 */
	hasValidBasename(resource: URI, basename?: string): Promise<boolean>;
	hasValidBasename(resource: URI, os: OperatingSystem, basename?: string): boolean;

	/**
	 * Resolves the operating system whose path semantics apply to a resource.
	 */
	getOperatingSystem(resource: URI): Promise<OperatingSystem | undefined>;

	/**
	 * Resolves the path implementation whose semantics apply to a resource.
	 */
	getPath(resource: URI): Promise<IPath | undefined>;

	/**
	 * Registers path semantics for a URI scheme.
	 */
	registerPathProvider(scheme: string, provider: IResourcePathProvider): IDisposable;

	/**
	 * @deprecated use `userHome` instead.
	 */
	readonly resolvedUserHome: URI | undefined;
}
