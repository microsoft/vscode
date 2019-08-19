/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IProductService = createDecorator<IProductService>('productService');

export interface IProductService extends Readonly<IProductConfiguration> {

	_serviceBrand: undefined;

}

export interface IProductConfiguration {
	version: string;
	nameShort: string;
	nameLong: string;
	readonly applicationName: string;
	readonly win32AppId: string;
	readonly win32x64AppId: string;
	readonly win32UserAppId: string;
	readonly win32x64UserAppId: string;
	readonly win32AppUserModelId: string;
	readonly win32MutexName: string;
	readonly darwinBundleIdentifier: string;
	readonly urlProtocol: string;
	dataFolderName: string;
	readonly downloadUrl: string;
	readonly updateUrl?: string;
	readonly quality?: string;
	readonly target?: string;
	readonly commit?: string;
	readonly settingsSearchBuildId?: number;
	readonly settingsSearchUrl?: string;
	readonly experimentsUrl?: string;
	readonly date: string;
	readonly extensionsGallery?: {
		readonly serviceUrl: string;
		readonly itemUrl: string;
		readonly controlUrl: string;
		readonly recommendationsUrl: string;
	};
	readonly extensionTips: { [id: string]: string; };
	readonly extensionImportantTips: { [id: string]: { name: string; pattern: string; isExtensionPack?: boolean }; };
	readonly exeBasedExtensionTips: { [id: string]: IExeBasedExtensionTip; };
	readonly extensionKeywords: { [extension: string]: readonly string[]; };
	readonly extensionAllowedProposedApi: readonly string[];
	readonly keymapExtensionTips: readonly string[];
	readonly crashReporter: {
		readonly companyName: string;
		readonly productName: string;
	};
	readonly welcomePage: string;
	readonly enableTelemetry: boolean;
	readonly aiConfig: {
		readonly asimovKey: string;
	};
	readonly sendASmile: {
		readonly reportIssueUrl: string,
		readonly requestFeatureUrl: string
	};
	readonly documentationUrl: string;
	readonly releaseNotesUrl: string;
	readonly keyboardShortcutsUrlMac: string;
	readonly keyboardShortcutsUrlLinux: string;
	readonly keyboardShortcutsUrlWin: string;
	readonly introductoryVideosUrl: string;
	readonly tipsAndTricksUrl: string;
	readonly newsletterSignupUrl: string;
	readonly twitterUrl: string;
	readonly requestFeatureUrl: string;
	readonly reportIssueUrl: string;
	readonly licenseUrl: string;
	readonly privacyStatementUrl: string;
	readonly telemetryOptOutUrl: string;
	readonly npsSurveyUrl: string;
	readonly surveys: readonly ISurveyData[];
	readonly checksums: { [path: string]: string; };
	readonly checksumFailMoreInfoUrl: string;
	readonly hockeyApp: {
		readonly 'win32-ia32': string;
		readonly 'win32-x64': string;
		readonly 'linux-x64': string;
		readonly 'darwin': string;
	};
	readonly logUploaderUrl: string;
	readonly portable?: string;
	readonly uiExtensions?: readonly string[];
}

export interface IExeBasedExtensionTip {
	friendlyName: string;
	windowsPath?: string;
	recommendations: readonly string[];
	important?: boolean;
	exeFriendlyName?: string;
}

export interface ISurveyData {
	surveyId: string;
	surveyUrl: string;
	languageId: string;
	editCount: number;
	userProbability: number;
}
