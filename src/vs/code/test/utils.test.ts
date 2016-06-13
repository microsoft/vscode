/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import os = require('os');
import * as assert from 'assert';
import * as Utils from 'vs/code/electron-main/utils';
import { IProductConfiguration } from 'vs/platform/product';

class MockProductConfiguration implements IProductConfiguration {
	public nameShort: string;
	public nameLong: string;
	public applicationName: string;
	public win32AppUserModelId: string;
	public win32MutexName: string;
	public darwinBundleIdentifier: string;
	public dataFolderName: string;
	public downloadUrl: string;
	public updateUrl: string;
	public quality: string;
	public commit: string;
	public date: string;
	public extensionsGallery: {
		serviceUrl: string;
		itemUrl: string;
	};
	public extensionTips: { [id: string]: string; };
	public crashReporter: Electron.CrashReporterStartOptions;
	public welcomePage: string;
	public enableTelemetry: boolean;
	public aiConfig: {
		key: string;
		asimovKey: string;
	};
	public sendASmile: {
		reportIssueUrl: string,
		requestFeatureUrl: string
	};
	public documentationUrl: string;
	public releaseNotesUrl: string;
	public twitterUrl: string;
	public requestFeatureUrl: string;
	public reportIssueUrl: string;
	public licenseUrl: string;
	public privacyStatementUrl: string;
}

suite('utils', () => {
	test('generateNewIssueUrl', () => {
		if (process.env['VSCODE_DEV']) {
			delete process.env['VSCODE_DEV'];
		}

		let product = new MockProductConfiguration();
		product.commit = 'COMMIT';
		product.quality = 'QUALITY';
		product.date = 'DATE';
		product.reportIssueUrl = 'URL';
		let version = 'VERSION';
		let osVersion = `${os.type()} ${os.arch()}`;
		assert.equal(Utils.generateNewIssueUrl(version, product),
			`URL?body=- VSCode Version: VERSION-QUALITY (COMMIT, DATE)%0A- OS Version: ${osVersion}%0A%0ASteps to Reproduce:%0A%0A1.%0A2.`,
			'generateNewIssueUrl should generate correct URL when all information is provided');

		product.commit = null;
		product.date = 'DATE';
		assert.equal(Utils.generateNewIssueUrl(version, product),
			`URL?body=- VSCode Version: VERSION-QUALITY (Unknown, DATE)%0A- OS Version: ${osVersion}%0A%0ASteps to Reproduce:%0A%0A1.%0A2.`,
			'generateNewIssueUrl should include date if commit is missing');

		product.commit = 'COMMIT';
		product.date = null;
		assert.equal(Utils.generateNewIssueUrl(version, product),
			`URL?body=- VSCode Version: VERSION-QUALITY (COMMIT, Unknown)%0A- OS Version: ${osVersion}%0A%0ASteps to Reproduce:%0A%0A1.%0A2.`,
			'generateNewIssueUrl should include commit if date is missing');

		product.commit = null;
		product.date = null;
		assert.equal(Utils.generateNewIssueUrl(version, product),
			`URL?body=- VSCode Version: VERSION-QUALITY%0A- OS Version: ${osVersion}%0A%0ASteps to Reproduce:%0A%0A1.%0A2.`,
			'generateNewIssueUrl should exclude commit and date is they\'re both missing');

		product.reportIssueUrl = 'URL?foo=bar';
		assert.equal(Utils.generateNewIssueUrl(version, product),
			`URL?foo=bar&body=- VSCode Version: VERSION-QUALITY%0A- OS Version: ${osVersion}%0A%0ASteps to Reproduce:%0A%0A1.%0A2.`,
			'generateNewIssueUrl should use an & to join the query string parameter if a ? is in reportIssueUrl');

		process.env['VSCODE_DEV'] = 1;
		product.quality = null;
		assert.equal(Utils.generateNewIssueUrl(version, product),
			`URL?foo=bar&body=- VSCode Version: VERSION-dev%0A- OS Version: ${osVersion}%0A%0ASteps to Reproduce:%0A%0A1.%0A2.`,
			'generateNewIssueUrl should use a quality of \'dev\' if the VSCODE_DEV environment variable is set');
	});
});
