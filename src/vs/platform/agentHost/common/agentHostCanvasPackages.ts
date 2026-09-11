/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../base/common/cancellation.js';
import type { Event } from '../../../base/common/event.js';
import { arch, platform } from '../../../base/common/process.js';
import type { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IAgentHostCanvasPackagesService = createDecorator<IAgentHostCanvasPackagesService>('agentHostCanvasPackagesService');

/** Native qualification currently covers only the macOS arm64 development preview. */
export function isLocalCanvasDevelopmentPlatform(hostPlatform: string = platform, architecture: string | undefined = arch): boolean {
	return hostPlatform === 'darwin' && architecture === 'arm64';
}

/** Approval to execute one installed revision, separate from customization enablement. */
export interface ICanvasPackageApproval {
	readonly revision: string;
	/** Absent for all workspaces on this local host; otherwise exact workspace URIs. Both scopes span profiles sharing the host's user-data directory. */
	readonly workspaces?: readonly string[];
}

export interface IAgentHostCanvasPackage {
	readonly id: string;
	readonly name: string;
	readonly source: string;
	/** Installed snapshot URI for reviewing the exact code covered by approval. */
	readonly snapshot: string;
	readonly revision: string;
	readonly fileCount: number;
	readonly byteLength: number;
	readonly approval?: ICanvasPackageApproval;
}

export interface ICanvasPackageSnapshot {
	readonly packageId: string;
	readonly revision: string;
	readonly pluginDirectory: URI;
	readonly workspace: URI;
}

export interface ICanvasPackageLaunch extends ICanvasPackageSnapshot {
	readonly dataDirectory: URI;
}

export function canvasPackageExtensionId(packageId: string): string {
	return `plugin:canvas-${packageId.slice(0, 48)}:main`;
}

export interface IAgentHostCanvasPackagesClient {
	list(): Promise<readonly IAgentHostCanvasPackage[]>;
	prepare(source: URI): Promise<IAgentHostCanvasPackage>;
	approve(id: string, revision: string, workspace?: URI): Promise<void>;
	revoke(id: string): Promise<void>;
	remove(id: string): Promise<void>;
}

export interface IAgentHostCanvasPackagesService extends Omit<IAgentHostCanvasPackagesClient, 'list'> {
	readonly _serviceBrand: undefined;
	readonly supported: boolean;
	/** A feature-local failure that prevents package management and execution until host storage is recovered. */
	readonly unavailableError?: Error;
	readonly onDidChange: Event<string>;
	list(): readonly IAgentHostCanvasPackage[];
	prepare(source: URI, token?: CancellationToken): Promise<IAgentHostCanvasPackage>;
	getApprovedSnapshots(workspace: URI): Promise<readonly ICanvasPackageSnapshot[]>;
	getApprovedPluginDirectories(workspace: URI): Promise<readonly URI[]>;
	resolveLaunch(extensionId: string, modulePath: string, workspace: URI): Promise<ICanvasPackageLaunch | undefined>;
	isApproved(id: string, revision: string, workspace: URI): boolean;
}
