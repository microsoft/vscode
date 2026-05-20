/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

// Since data sent through the service is serialized to JSON, functions will be lost, so Color objects
// should not be sent as their 'toString' method will be stripped. Instead convert to strings before sending.
export interface WindowStyles {
	backgroundColor?: string;
	color?: string;
}
export interface WindowData {
	styles: WindowStyles;
	zoomLevel: number;
}

export const enum IssueType {
	Bug,
	PerformanceIssue,
	FeatureRequest
}

export enum IssueSource {
	VSCode = 'vscode',
	Extension = 'extension',
	Marketplace = 'marketplace',
	Unknown = 'unknown'
}

export interface IssueReporterStyles extends WindowStyles {
	textLinkColor?: string;
	textLinkActiveForeground?: string;
	inputBackground?: string;
	inputForeground?: string;
	inputBorder?: string;
	inputErrorBorder?: string;
	inputErrorBackground?: string;
	inputErrorForeground?: string;
	inputActiveBorder?: string;
	buttonBackground?: string;
	buttonForeground?: string;
	buttonHoverBackground?: string;
	sliderBackgroundColor?: string;
	sliderHoverColor?: string;
	sliderActiveColor?: string;
}

export interface IssueReporterExtensionData {
	name: string;
	publisher: string | undefined;
	version: string;
	id: string;
	isTheme: boolean;
	isBuiltin: boolean;
	displayName: string | undefined;
	repositoryUrl: string | undefined;
	bugsUrl: string | undefined;
	extensionData?: string;
	extensionTemplate?: string;
	data?: string;
	uri?: UriComponents;
	privateUri?: UriComponents;
}

export interface IssueReporterData extends WindowData {
	styles: IssueReporterStyles;
	enabledExtensions: IssueReporterExtensionData[];
	/**
	 * Resolves once `enabledExtensions` has been populated (or failed to populate).
	 * Lets the wizard pane wait for the async extension enumeration in
	 * `NativeIssueService` to finish before rendering the extensions section.
	 */
	whenExtensionsLoaded?: Promise<void>;
	/**
	 * Resolves once all async data (extensions, token, integrity, experiments)
	 * has been populated. Lets the wizard pane forward late-arriving values
	 * like `isInstallationPure` and `githubAccessToken` into the overlay model.
	 */
	whenDataComplete?: Promise<void>;
	issueType?: IssueType;
	issueSource?: IssueSource;
	extensionId?: string;
	experiments?: string;
	restrictedMode: boolean;
	isInstallationPure: boolean;
	isSessionsWindow: boolean;
	githubAccessToken: string;
	issueTitle?: string;
	issueBody?: string;
	data?: string;
	uri?: UriComponents;
	privateUri?: UriComponents;
}

export interface ISettingSearchResult {
	extensionId: string;
	key: string;
	score: number;
}

export const IIssueFormService = createDecorator<IIssueFormService>('issueFormService');

/**
 * Narrow surface of the issue reporter wizard that `IIssueFormService.submitIssue`
 * relies on. Keeping this in `common/` (rather than depending on the browser-side
 * `IssueReporterOverlay` class) lets the service interface be implemented and
 * consumed cleanly across layers.
 */
export interface IIssueSubmissionHost {
	getScreenshots(): readonly { readonly dataUrl: string; readonly annotatedDataUrl?: string }[];
	getRecordings(): readonly { readonly filePath: string }[];
	setUploading(uploading: boolean): void;
	setAttachmentUploadState(index: number, state: 'pending' | 'uploading' | 'done'): void;
}

export interface IIssueFormService {
	readonly _serviceBrand: undefined;

	// Used by the issue reporter
	openReporter(data: IssueReporterData): Promise<void>;
	reloadWithExtensionsDisabled(): Promise<void>;
	showConfirmCloseDialog(): Promise<void>;
	showClipboardDialog(): Promise<boolean>;
	sendReporterMenu(extensionId: string): Promise<IssueReporterData | undefined>;
	closeReporter(): Promise<void>;
	submitIssue(host: IIssueSubmissionHost, data: IssueReporterData, title: string, body: string): Promise<boolean>;
}

export const IWorkbenchIssueService = createDecorator<IWorkbenchIssueService>('workbenchIssueService');

export interface IWorkbenchIssueService {
	readonly _serviceBrand: undefined;
	openReporter(dataOverrides?: Partial<IssueReporterData>): Promise<void>;
}
