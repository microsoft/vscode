/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import product from 'vs/platform/node/product';
import { isMacintosh, isLinux, language } from 'vs/base/common/platform';
import { shell } from 'electron';
import { IssueType } from 'vs/platform/issue/common/issue';
import { IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';

// --- actions

export class OpenIssueReporterAction extends Action {
	static readonly ID = 'workbench.action.openIssueReporter';
	static readonly LABEL = nls.localize({ key: 'reportIssueInEnglish', comment: ['Translate this to "Report Issue in English" in all languages please!'] }, "Report Issue");

	constructor(
		id: string,
		label: string,
		@IWorkbenchIssueService private readonly issueService: IWorkbenchIssueService
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		return this.issueService.openReporter()
			.then(() => true);
	}
}

export class OpenProcessExplorer extends Action {
	static readonly ID = 'workbench.action.openProcessExplorer';
	static readonly LABEL = nls.localize('openProcessExplorer', "Open Process Explorer");

	constructor(
		id: string,
		label: string,
		@IWorkbenchIssueService private readonly issueService: IWorkbenchIssueService
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		return this.issueService.openProcessExplorer()
			.then(() => true);
	}
}

export class ReportPerformanceIssueUsingReporterAction extends Action {
	static readonly ID = 'workbench.action.reportPerformanceIssueUsingReporter';
	static readonly LABEL = nls.localize('reportPerformanceIssue', "Report Performance Issue");

	constructor(
		id: string,
		label: string,
		@IWorkbenchIssueService private readonly issueService: IWorkbenchIssueService
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		// TODO: Reporter should send timings table as well
		return this.issueService.openReporter({ issueType: IssueType.PerformanceIssue })
			.then(() => true);
	}
}

export class KeybindingsReferenceAction extends Action {

	static readonly ID = 'workbench.action.keybindingsReference';
	static readonly LABEL = nls.localize('keybindingsReference', "Keyboard Shortcuts Reference");

	private static readonly URL = isLinux ? product.keyboardShortcutsUrlLinux : isMacintosh ? product.keyboardShortcutsUrlMac : product.keyboardShortcutsUrlWin;
	static readonly AVAILABLE = !!KeybindingsReferenceAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<void> {
		window.open(KeybindingsReferenceAction.URL);
		return Promise.resolve();
	}
}

export class OpenDocumentationUrlAction extends Action {

	static readonly ID = 'workbench.action.openDocumentationUrl';
	static readonly LABEL = nls.localize('openDocumentationUrl', "Documentation");

	private static readonly URL = product.documentationUrl;
	static readonly AVAILABLE = !!OpenDocumentationUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<void> {
		window.open(OpenDocumentationUrlAction.URL);
		return Promise.resolve();
	}
}

export class OpenIntroductoryVideosUrlAction extends Action {

	static readonly ID = 'workbench.action.openIntroductoryVideosUrl';
	static readonly LABEL = nls.localize('openIntroductoryVideosUrl', "Introductory Videos");

	private static readonly URL = product.introductoryVideosUrl;
	static readonly AVAILABLE = !!OpenIntroductoryVideosUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<void> {
		window.open(OpenIntroductoryVideosUrlAction.URL);
		return Promise.resolve();
	}
}

export class OpenTipsAndTricksUrlAction extends Action {

	static readonly ID = 'workbench.action.openTipsAndTricksUrl';
	static readonly LABEL = nls.localize('openTipsAndTricksUrl', "Tips and Tricks");

	private static readonly URL = product.tipsAndTricksUrl;
	static readonly AVAILABLE = !!OpenTipsAndTricksUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<void> {
		window.open(OpenTipsAndTricksUrlAction.URL);
		return Promise.resolve();
	}
}

export class OpenTwitterUrlAction extends Action {

	static readonly ID = 'workbench.action.openTwitterUrl';
	static LABEL = nls.localize('openTwitterUrl', "Join Us on Twitter", product.applicationName);

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		if (product.twitterUrl) {
			return Promise.resolve(shell.openExternal(product.twitterUrl));
		}

		return Promise.resolve(false);
	}
}

export class OpenRequestFeatureUrlAction extends Action {

	static readonly ID = 'workbench.action.openRequestFeatureUrl';
	static LABEL = nls.localize('openUserVoiceUrl', "Search Feature Requests");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		if (product.requestFeatureUrl) {
			return Promise.resolve(shell.openExternal(product.requestFeatureUrl));
		}

		return Promise.resolve(false);
	}
}

export class OpenLicenseUrlAction extends Action {

	static readonly ID = 'workbench.action.openLicenseUrl';
	static LABEL = nls.localize('openLicenseUrl', "View License");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		if (product.licenseUrl) {
			if (language) {
				const queryArgChar = product.licenseUrl.indexOf('?') > 0 ? '&' : '?';
				return Promise.resolve(shell.openExternal(`${product.licenseUrl}${queryArgChar}lang=${language}`));
			} else {
				return Promise.resolve(shell.openExternal(product.licenseUrl));
			}
		}

		return Promise.resolve(false);
	}
}

export class OpenPrivacyStatementUrlAction extends Action {

	static readonly ID = 'workbench.action.openPrivacyStatementUrl';
	static LABEL = nls.localize('openPrivacyStatement', "Privacy Statement");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		if (product.privacyStatementUrl) {
			if (language) {
				const queryArgChar = product.privacyStatementUrl.indexOf('?') > 0 ? '&' : '?';
				return Promise.resolve(shell.openExternal(`${product.privacyStatementUrl}${queryArgChar}lang=${language}`));
			} else {
				return Promise.resolve(shell.openExternal(product.privacyStatementUrl));
			}
		}


		return Promise.resolve(false);
	}
}

