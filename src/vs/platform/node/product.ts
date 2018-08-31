/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { getPathFromAmdModule } from 'vs/base/common/amd';

export interface IProductConfiguration {
	nameShort: string;
	nameLong: string;
	applicationName: string;
	win32AppId: string;
	win32x64AppId: string;
	win32UserAppId: string;
	win32x64UserAppId: string;
	win32AppUserModelId: string;
	win32MutexName: string;
	darwinBundleIdentifier: string;
	urlProtocol: string;
	dataFolderName: string;
	downloadUrl: string;
	updateUrl?: string;
	quality?: string;
	target?: string;
	commit?: string;
	settingsSearchBuildId?: number;
	settingsSearchUrl?: string;
	experimentsUrl?: string;
	date: string;
	extensionsGallery: {
		serviceUrl: string;
		itemUrl: string;
		controlUrl: string;
		recommendationsUrl: string;
	};
	extensionTips: { [id: string]: string; };
	extensionImportantTips: { [id: string]: { name: string; pattern: string; }; };
	exeBasedExtensionTips: { [id: string]: { friendlyName: string, windowsPath?: string, recommendations: string[] }; };
	extensionKeywords: { [extension: string]: string[]; };
	extensionAllowedBadgeProviders: string[];
	extensionAllowedProposedApi: string[];
	keymapExtensionTips: string[];
	crashReporter: {
		companyName: string;
		productName: string;
	};
	welcomePage: string;
	enableTelemetry: boolean;
	aiConfig: {
		asimovKey: string;
	};
	sendASmile: {
		reportIssueUrl: string,
		requestFeatureUrl: string
	};
	documentationUrl: string;
	releaseNotesUrl: string;
	keyboardShortcutsUrlMac: string;
	keyboardShortcutsUrlLinux: string;
	keyboardShortcutsUrlWin: string;
	introductoryVideosUrl: string;
	tipsAndTricksUrl: string;
	twitterUrl: string;
	requestFeatureUrl: string;
	reportIssueUrl: string;
	licenseUrl: string;
	privacyStatementUrl: string;
	telemetryOptOutUrl: string;
	npsSurveyUrl: string;
	surveys: ISurveyData[];
	checksums: { [path: string]: string; };
	checksumFailMoreInfoUrl: string;
	hockeyApp: {
		'win32-ia32': string;
		'win32-x64': string;
		'linux-ia32': string;
		'linux-x64': string;
		'darwin': string;
	};
	logUploaderUrl: string;
	portable?: string;
}

export interface ISurveyData {
	surveyId: string;
	surveyUrl: string;
	languageId: string;
	editCount: number;
	userProbability: number;
}

const rootPath = path.dirname(getPathFromAmdModule(require, ''));
const productJsonPath = path.join(rootPath, 'product.json');
const product = require.__$__nodeRequire(productJsonPath) as IProductConfiguration;

if (process.env['VSCODE_DEV']) {
	product.nameShort += ' Dev';
	product.nameLong += ' Dev';
	product.dataFolderName += '-dev';
}

export default product;
