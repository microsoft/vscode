/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IWorkspaceFolder } from './workspace.js';

/**
 * An alternate location of a workspace folder.
 */
export interface IFolderLocation {
	readonly uri: URI;
	readonly label: string;
	readonly description?: string;
	readonly icon?: ThemeIcon;
}

/**
 * An alternate location together with the provider that resolved it.
 */
export interface IResolvedFolderLocation extends IFolderLocation {
	readonly providerId: string;

	/**
	 * Whether the provider is part of the product.
	 */
	readonly builtIn: boolean;
}

/**
 * Knows the alternate locations of a workspace folder.
 */
export interface IWorkspaceFolderLocationProvider {
	readonly id: string;

	/**
	 * The alternate locations of the folder whose primary location is `primary`.
	 */
	provideLocations(primary: URI, token: CancellationToken): Promise<IFolderLocation[]>;

	/**
	 * Resolves `location` if it is an alternate location of the folder whose
	 * primary location is `primary`, as this provider knows it.
	 */
	resolveLocation(primary: URI, location: URI, token: CancellationToken): Promise<IFolderLocation | undefined>;
}

/**
 * Why the location of the workspace folder changed: `user` when the user picked it,
 * `programmatic` for any other change.
 */
export type FolderLocationChangeReason = 'user' | 'programmatic';

export interface IFolderLocationChangeEvent {

	/**
	 * The workspace folder whose location changed, as it is after the change.
	 */
	readonly folder: IWorkspaceFolder;

	readonly reason: FolderLocationChangeReason;
}

export const IWorkspaceFolderLocationService = createDecorator<IWorkspaceFolderLocationService>('workspaceFolderLocationService');

export interface IWorkspaceFolderLocationService {
	readonly _serviceBrand: undefined;

	/**
	 * The alternate location `folder` is currently at, or `undefined` while it is at its own location
	 * or when its workspace does not support alternate locations.
	 */
	getLocation(folder: IWorkspaceFolder): IResolvedFolderLocation | undefined;

	/**
	 * Whether `folder` is opened at an alternate location. The service decides which workspaces support it.
	 */
	isAtAlternateLocation(folder: IWorkspaceFolder): boolean;

	/**
	 * Whether the location of `folder` can be set with `IWorkspaceEditingService.setFolderLocation`.
	 * This is the case for the folder of a local single-folder workspace.
	 */
	canSetLocation(folder: IWorkspaceFolder): boolean;

	/**
	 * Fires when the answer of `canSetLocation` may have changed, that is when the folders
	 * or the kind of the workspace change.
	 */
	readonly onDidChangeCanSetLocation: Event<void>;

	/**
	 * Fires when the location of a folder changes.
	 */
	readonly onDidChangeLocation: Event<IFolderLocationChangeEvent>;

	/**
	 * Fires when a provider is registered or unregistered.
	 */
	readonly onDidChangeProviders: Event<void>;

	/**
	 * Records the location `folder` is at. Called by `IWorkspaceEditingService`
	 * and when restoring a location; do not use it to switch locations.
	 */
	setLocation(folder: IWorkspaceFolder, location: IResolvedFolderLocation | undefined, reason?: FolderLocationChangeReason): void;

	/**
	 * Registers a provider. Locations of `builtIn` providers inherit the trust of the primary location.
	 */
	registerProvider(provider: IWorkspaceFolderLocationProvider, options?: { readonly builtIn?: boolean }): IDisposable;

	/**
	 * The alternate locations of all providers for the folder at `primary`, without duplicates.
	 */
	getLocations(primary: URI, token: CancellationToken): Promise<IFolderLocation[]>;

	/**
	 * Resolves `location` through the providers, or returns `undefined` if no provider knows it.
	 */
	resolveLocation(primary: URI, location: URI, token: CancellationToken): Promise<IResolvedFolderLocation | undefined>;
}
