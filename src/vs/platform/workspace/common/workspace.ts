/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export const IWorkspaceContextService = createDecorator<IWorkspaceContextService>('contextService');

export interface IWorkspaceContextService {
	serviceId: ServiceIdentifier<any>;

	/**
	 * Provides access to the workspace object the platform is running with. This may be null if the workbench was opened
	 * without workspace (empty);
	 */
	getWorkspace(): IWorkspace;

	/**
	 * Provides access to the configuration object the platform is running with.
	 */
	getConfiguration(): IConfiguration;

	/**
	 * Provides access to the options object the platform is running with.
	 */
	getOptions(): any;

	/**
	 * Returns iff the provided resource is inside the workspace or not.
	 */
	isInsideWorkspace(resource: URI): boolean;

	/**
	 * Given a resource inside the workspace, returns its relative path from the workspace root
	 * without leading or trailing slashes. Returns null if the file is not inside an opened
	 * workspace.
	 */
	toWorkspaceRelativePath: (resource: URI) => string;

	/**
	 * Given a workspace relative path, returns the resource with the absolute path.
	 */
	toResource: (workspaceRelativePath: string) => URI;
}

export interface IWorkspace {

	/**
	 * the full uri of the workspace. this is a file:// URL to the location
	 * of the workspace on disk.
	 */
	resource: URI;

	/**
	 * the identifier that uniquely identifies this workspace among others.
	 */
	id: string;

	/**
	 * the name of the workspace
	 */
	name: string;

	/**
	 * the last modified date of the workspace if known
	 */
	mtime?: number;

	/**
	 * the unique identifier of the workspace. if the workspace is deleted and recreated
	 * the identifier also changes. this makes the uid more unique compared to the id which
	 * is just derived from the workspace name.
	 */
	uid?: number;
}

export interface IConfiguration {
	/**
	 * Some environmental flags
	 */
	env?: IEnvironment;
}

export interface IEnvironment {
	appName: string;
	appRoot: string;
	isBuilt: boolean;
	execPath: string;

	applicationName: string;
	darwinBundleIdentifier: string;

	version: string;
	commitHash: string;

	updateFeedUrl: string;
	updateChannel: string;

	extensionsGallery: {
		serviceUrl: string;
		cacheUrl: string;
		itemUrl: string;
	};

	extensionTips: { [id: string]: string; };

	releaseNotesUrl: string;
	licenseUrl: string;
	productDownloadUrl: string;

	welcomePage: string;

	crashReporter: any;

	appSettingsHome: string;
	appSettingsPath: string;
	appKeybindingsPath: string;

	debugExtensionHostPort: number;
	debugBrkExtensionHost: boolean;
	disableExtensions: boolean;

	logExtensionHostCommunication: boolean;
	verboseLogging: boolean;
	enablePerformance: boolean;

	userExtensionsHome: string;
	sharedIPCHandle: string;
	extensionDevelopmentPath: string;
	extensionTestsPath: string;

	recentPaths: string[];

	enableTelemetry: boolean;

	aiConfig: {
		key: string;
		asimovKey: string;
	};

	sendASmile: {
		reportIssueUrl: string,
		requestFeatureUrl: string
	};
}