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
	/** The label of the locations of its provider ({@link IWorkspaceFolderLocationProvider.label}), where it has one. */
	readonly group?: string;
}

/** The alternate locations of one provider, under its label ({@link IWorkspaceFolderLocationProvider.label}). */
export interface IFolderLocationGroup {
	readonly label: string | undefined;
	readonly locations: readonly IFolderLocation[];
}

/**
 * Knows the alternate locations of a workspace folder.
 */
export interface IWorkspaceFolderLocationProvider {
	readonly id: string;
	/** Names the locations it provides, such as "Worktrees", where they show as a group, such as in a picker of locations. */
	readonly label?: string;

	/**
	 * The alternate locations of the folder whose primary location is `primary`.
	 */
	provideLocations(primary: URI, token: CancellationToken): Promise<IFolderLocation[]>;

	/**
	 * Resolves `location` if it is an alternate location of the folder whose
	 * primary location is `primary`, as this provider knows it.
	 */
	resolveLocation(primary: URI, location: URI, token: CancellationToken): Promise<IFolderLocation | undefined>;

	/**
	 * Fires when the locations this provider knows may have changed, for any folder: ask {@link provideLocations} again.
	 */
	readonly onDidChangeLocations?: Event<void>;
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

/**
 * Fires before the location of a folder changes, so that what is running against its current location can ask to be considered.
 */
export interface IFolderLocationWillChangeEvent {

	/**
	 * The workspace folder whose location is about to change, as it is before the change.
	 */
	readonly folder: IWorkspaceFolder;

	/**
	 * The location the folder is about to move to.
	 */
	readonly location: URI;

	readonly reason: FolderLocationChangeReason;

	/**
	 * Asks to confirm the change with the user. `reasons` are shown to the user: nothing is asked for when they are
	 * `undefined` or empty. `stop` runs when the user confirms, before the change, to stop what the reasons are about.
	 */
	veto(reasons: string | readonly string[] | undefined | Promise<string | readonly string[] | undefined>, stop?: () => Promise<void>): void;
}

/**
 * What asked to confirm a change of location ({@link IFolderLocationWillChangeEvent.veto}).
 */
export interface IFolderLocationVetoes {

	/**
	 * Why the user is asked to confirm the change, without duplicates; empty when nothing asks for it.
	 */
	readonly reasons: readonly string[];

	/**
	 * Stops what the reasons are about. Call it once the user confirmed the change.
	 */
	stop(): Promise<void>;
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
	 * Fires before the location of a folder changes through `IWorkspaceEditingService.setFolderLocation`.
	 */
	readonly onWillChangeLocation: Event<IFolderLocationWillChangeEvent>;

	/**
	 * Fires when a provider is registered or unregistered.
	 */
	readonly onDidChangeProviders: Event<void>;

	/**
	 * Fires when the locations a registered provider knows may have changed, for any folder: ask {@link getLocations} again.
	 */
	readonly onDidChangeLocations: Event<void>;

	/**
	 * Asks the listeners of {@link onWillChangeLocation} whether `folder` can move to `location` without the user's confirmation.
	 * Called by `IWorkspaceEditingService`; do not use it to switch locations.
	 */
	willChangeLocation(folder: IWorkspaceFolder, location: URI, reason: FolderLocationChangeReason): Promise<IFolderLocationVetoes>;

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
	 * The alternate locations of the folder at `primary`, grouped by the provider that knows them, in the order they
	 * registered, without duplicates and without groups that have none.
	 */
	getLocationGroups(primary: URI, token: CancellationToken): Promise<IFolderLocationGroup[]>;

	/**
	 * The known locations of `folder`, primary first, then its alternates
	 * (only discovered where the folder can be switched between locations).
	 * Which one the folder is currently at does not affect the result.
	 */
	getFolderLocations(folder: IWorkspaceFolder, token: CancellationToken): Promise<IFolderLocation[]>;

	/**
	 * Resolves `location` through the providers, or returns `undefined` if no provider knows it.
	 */
	resolveLocation(primary: URI, location: URI, token: CancellationToken): Promise<IResolvedFolderLocation | undefined>;
}
