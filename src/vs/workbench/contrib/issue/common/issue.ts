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
	AgentsWindow = 'agentsWindow',
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
	/** An optional internal destination, not the default destination. */
	privateUri?: UriComponents;
}

export interface IssueReporterData extends WindowData {
	styles: IssueReporterStyles;
	enabledExtensions: IssueReporterExtensionData[];
	/**
	 * Resolves once `enabledExtensions` has been populated (or failed to populate).
	 * Lets the reporter pane wait for the async extension enumeration in
	 * `NativeIssueService` to finish before rendering the extensions section.
	 */
	whenExtensionsLoaded?: Promise<void>;
	/**
	 * Resolves once all async data (extensions, token, integrity, experiments)
	 * has been populated. Lets the reporter pane forward late-arriving values
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
	/** Refreshes an automatically selected GitHub session before a new reporter preview. */
	getGitHubAccessToken?: () => Promise<string>;
	issueTitle?: string;
	issueBody?: string;
	data?: string;
	uri?: UriComponents;
	/** An optional internal destination, not the default destination. */
	privateUri?: UriComponents;
	/** Additional product-report destinations, in owner/repo form. */
	additionalRepositories?: readonly string[];
	/** The user's repository choice, independent of the issue source. */
	issueRepository?: string;
}

export interface ISettingSearchResult {
	extensionId: string;
	key: string;
	score: number;
}

export const IIssueFormService = createDecorator<IIssueFormService>('issueFormService');

export interface IIssueReporterFileAttachment {
	readonly filePath: string;
	readonly name: string;
	readonly mimeType: string;
	readonly thumbnailDataUrl?: string;
	readonly durationMs?: number;
}

export interface IIssueReporterScreenshot {
	readonly dataUrl: string;
	readonly annotatedDataUrl?: string;
}

export interface IIssueReporterAttachmentUpload {
	readonly destination: string;
	readonly state: 'pending' | 'uploading' | 'done';
}

export type IssueReporterAttachment<TScreenshot extends IIssueReporterScreenshot = IIssueReporterScreenshot> = {
	readonly id: string;
	upload?: IIssueReporterAttachmentUpload;
} & (
		| { readonly kind: 'screenshot'; readonly screenshot: TScreenshot }
		| { readonly kind: 'file'; readonly file: IIssueReporterFileAttachment }
	);

/** The new reporter's attachment and upload feedback contract. */
export interface IIssueSubmissionHost {
	getAttachments(): readonly IssueReporterAttachment[];
	setUploading(uploading: boolean): void;
	setAttachmentUploadState(attachment: IssueReporterAttachment, upload: IIssueReporterAttachmentUpload): void;
	setAttachmentUploadError(message: string | undefined, details?: string): void;
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
	submitIssue(host: IIssueSubmissionHost, data: IssueReporterData, title: string, body: string, signal?: AbortSignal): Promise<boolean>;
	searchGitHubIssues(repo: string, title: string, signal: AbortSignal): Promise<readonly ISimilarIssue[]>;
}

export interface ISimilarIssue {
	readonly html_url: string;
	readonly title: string;
	readonly state?: string;
}

export const IWorkbenchIssueService = createDecorator<IWorkbenchIssueService>('workbenchIssueService');

export interface IWorkbenchIssueService {
	readonly _serviceBrand: undefined;
	openReporter(dataOverrides?: Partial<IssueReporterData>): Promise<void>;
}
