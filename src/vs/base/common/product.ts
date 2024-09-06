/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from './collections.js';
import { PlatformName } from './platform.js';

export interface IBuiltInExtension {
	readonly name: string;
	readonly version: string;
	readonly repo: string;
	readonly metadata: any;
}

export interface IProductWalkthrough {
	id: string;
	steps: IProductWalkthroughStep[];
}

export interface IProductWalkthroughStep {
	id: string;
	title: string;
	when: string;
	description: string;
	media:
	| { type: 'image'; path: string | { hc: string; hcLight?: string; light: string; dark: string }; altText: string }
	| { type: 'svg'; path: string; altText: string }
	| { type: 'markdown'; path: string };
}

export interface IFeaturedExtension {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly imagePath: string;
}

export type ConfigurationSyncStore = {
	url: string;
	insidersUrl: string;
	stableUrl: string;
	canSwitch?: boolean;
	authenticationProviders: IStringDictionary<{ scopes: string[] }>;
};

export type ExtensionUntrustedWorkspaceSupport = {
	readonly default?: boolean | 'limited';
	readonly override?: boolean | 'limited';
};

export type ExtensionVirtualWorkspaceSupport = {
	readonly default?: boolean;
	readonly override?: boolean;
};

export interface IProductConfiguration {
	readonly version: string;
	readonly date?: string;
	readonly quality?: string;
	readonly commit?: string;

	readonly nameShort: string;
	readonly nameLong: string;

	readonly win32AppUserModelId?: string;
	readonly win32MutexName?: string;
	readonly win32RegValueName?: string;
	readonly applicationName: string;
	readonly embedderIdentifier?: string;

	readonly urlProtocol: string;
	readonly dataFolderName: string; // location for extensions (e.g. ~/.vscode-insiders)

	readonly builtInExtensions?: IBuiltInExtension[];
	readonly walkthroughMetadata?: IProductWalkthrough[];
	readonly featuredExtensions?: IFeaturedExtension[];

	readonly downloadUrl?: string;
	readonly updateUrl?: string;
	readonly webUrl?: string;
	readonly webEndpointUrlTemplate?: string;
	readonly webviewContentExternalBaseUrlTemplate?: string;
	readonly target?: string;
	readonly nlsCoreBaseUrl?: string;

	readonly settingsSearchBuildId?: number;
	readonly settingsSearchUrl?: string;

	readonly tasConfig?: {
		endpoint: string;
		telemetryEventName: string;
		assignmentContextTelemetryPropertyName: string;
	};

	readonly extensionsGallery?: {
		readonly serviceUrl: string;
		readonly servicePPEUrl?: string;
		readonly searchUrl?: string;
		readonly itemUrl: string;
		readonly publisherUrl: string;
		readonly resourceUrlTemplate: string;
		readonly controlUrl: string;
		readonly nlsBaseUrl: string;
	};

	readonly extensionRecommendations?: IStringDictionary<IExtensionRecommendations>;
	readonly configBasedExtensionTips?: IStringDictionary<IConfigBasedExtensionTip>;
	readonly exeBasedExtensionTips?: IStringDictionary<IExeBasedExtensionTip>;
	readonly remoteExtensionTips?: IStringDictionary<IRemoteExtensionTip>;
	readonly virtualWorkspaceExtensionTips?: IStringDictionary<IVirtualWorkspaceExtensionTip>;
	readonly extensionKeywords?: IStringDictionary<string[]>;
	readonly keymapExtensionTips?: readonly string[];
	readonly webExtensionTips?: readonly string[];
	readonly languageExtensionTips?: readonly string[];
	readonly trustedExtensionUrlPublicKeys?: IStringDictionary<string[]>;
	readonly trustedExtensionAuthAccess?: string[] | IStringDictionary<string[]>;
	readonly trustedExtensionProtocolHandlers?: readonly string[];

	readonly commandPaletteSuggestedCommandIds?: string[];

	readonly crashReporter?: {
		readonly companyName: string;
		readonly productName: string;
	};

	readonly removeTelemetryMachineId?: boolean;
	readonly enabledTelemetryLevels?: { error: boolean; usage: boolean };
	readonly enableTelemetry?: boolean;
	readonly openToWelcomeMainPage?: boolean;
	readonly aiConfig?: {
		readonly ariaKey: string;
	};

	readonly documentationUrl?: string;
	readonly serverDocumentationUrl?: string;
	readonly releaseNotesUrl?: string;
	readonly keyboardShortcutsUrlMac?: string;
	readonly keyboardShortcutsUrlLinux?: string;
	readonly keyboardShortcutsUrlWin?: string;
	readonly introductoryVideosUrl?: string;
	readonly tipsAndTricksUrl?: string;
	readonly newsletterSignupUrl?: string;
	readonly youTubeUrl?: string;
	readonly requestFeatureUrl?: string;
	readonly reportIssueUrl?: string;
	readonly reportMarketplaceIssueUrl?: string;
	readonly licenseUrl?: string;
	readonly serverLicenseUrl?: string;
	readonly privacyStatementUrl?: string;
	readonly showTelemetryOptOut?: boolean;

	readonly serverGreeting?: string[];
	readonly serverLicense?: string[];
	readonly serverLicensePrompt?: string;
	readonly serverApplicationName: string;
	readonly serverDataFolderName?: string;

	readonly tunnelApplicationName?: string;
	readonly tunnelApplicationConfig?: ITunnelApplicationConfig;

	readonly npsSurveyUrl?: string;
	readonly surveys?: readonly ISurveyData[];

	readonly checksums?: { [path: string]: string };
	readonly checksumFailMoreInfoUrl?: string;

	readonly appCenter?: IAppCenterConfiguration;

	readonly portable?: string;

	readonly extensionKind?: { readonly [extensionId: string]: ('ui' | 'workspace' | 'web')[] };
	readonly extensionPointExtensionKind?: { readonly [extensionPointId: string]: ('ui' | 'workspace' | 'web')[] };
	readonly extensionSyncedKeys?: { readonly [extensionId: string]: string[] };

	readonly extensionsEnabledWithApiProposalVersion?: string[];
	readonly extensionEnabledApiProposals?: { readonly [extensionId: string]: string[] };
	readonly extensionUntrustedWorkspaceSupport?: { readonly [extensionId: string]: ExtensionUntrustedWorkspaceSupport };
	readonly extensionVirtualWorkspacesSupport?: { readonly [extensionId: string]: ExtensionVirtualWorkspaceSupport };

	readonly msftInternalDomains?: string[];
	readonly linkProtectionTrustedDomains?: readonly string[];

	readonly 'configurationSync.store'?: ConfigurationSyncStore;

	readonly 'editSessions.store'?: Omit<ConfigurationSyncStore, 'insidersUrl' | 'stableUrl'>;
	readonly darwinUniversalAssetId?: string;
	readonly profileTemplatesUrl?: string;

	readonly commonlyUsedSettings?: string[];
	readonly aiGeneratedWorkspaceTrust?: IAiGeneratedWorkspaceTrust;
	readonly gitHubEntitlement?: IGitHubEntitlement;
	readonly chatParticipantRegistry?: string;

	readonly emergencyAlertUrl?: string;
}

export interface ITunnelApplicationConfig {
	authenticationProviders: IStringDictionary<{ scopes: string[] }>;
	editorWebUrl: string;
	extension: IRemoteExtensionTip;
}

export interface IExtensionRecommendations {
	readonly onFileOpen: IFileOpenCondition[];
	readonly onSettingsEditorOpen?: ISettingsEditorOpenCondition;
}

export interface ISettingsEditorOpenCondition {
	readonly prerelease?: boolean | string;
	readonly descriptionOverride?: string;
}

export interface IExtensionRecommendationCondition {
	readonly important?: boolean;
	readonly whenInstalled?: string[];
	readonly whenNotInstalled?: string[];
}

export type IFileOpenCondition = IFileLanguageCondition | IFilePathCondition | IFileContentCondition;

export interface IFileLanguageCondition extends IExtensionRecommendationCondition {
	readonly languages: string[];
}

export interface IFilePathCondition extends IExtensionRecommendationCondition {
	readonly pathGlob: string;
}

export type IFileContentCondition = (IFileLanguageCondition | IFilePathCondition) & { readonly contentPattern: string };

export interface IAppCenterConfiguration {
	readonly 'win32-x64': string;
	readonly 'win32-arm64': string;
	readonly 'linux-x64': string;
	readonly 'darwin': string;
	readonly 'darwin-universal': string;
	readonly 'darwin-arm64': string;
}

export interface IConfigBasedExtensionTip {
	configPath: string;
	configName: string;
	configScheme?: string;
	recommendations: IStringDictionary<{
		name: string;
		contentPattern?: string;
		important?: boolean;
		isExtensionPack?: boolean;
		whenNotInstalled?: string[];
	}>;
}

export interface IExeBasedExtensionTip {
	friendlyName: string;
	windowsPath?: string;
	important?: boolean;
	recommendations: IStringDictionary<{ name: string; important?: boolean; isExtensionPack?: boolean; whenNotInstalled?: string[] }>;
}

export interface IRemoteExtensionTip {
	friendlyName: string;
	extensionId: string;
	supportedPlatforms?: PlatformName[];
	startEntry?: {
		helpLink: string;
		startConnectLabel: string;
		startCommand: string;
		priority: number;
	};
}

export interface IVirtualWorkspaceExtensionTip {
	friendlyName: string;
	extensionId: string;
	supportedPlatforms?: PlatformName[];
	startEntry: {
		helpLink: string;
		startConnectLabel: string;
		startCommand: string;
		priority: number;
	};
}

export interface ISurveyData {
	surveyId: string;
	surveyUrl: string;
	languageId: string;
	editCount: number;
	userProbability: number;
}

export interface IAiGeneratedWorkspaceTrust {
	readonly title: string;
	readonly checkboxText: string;
	readonly trustOption: string;
	readonly dontTrustOption: string;
	readonly startupTrustRequestLearnMore: string;
}

export interface IGitHubEntitlement {
	providerId: string;
	command: { title: string; titleWithoutPlaceHolder: string; action: string; when: string };
	entitlementUrl: string;
	extensionId: string;
	enablementKey: string;
	confirmationMessage: string;
	confirmationAction: string;
}
