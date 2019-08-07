/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import product from 'vs/platform/product/node/product';
import { isMacintosh, isLinux, language } from 'vs/base/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

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

export class OpenNewsletterSignupUrlAction extends Action {

	static readonly ID = 'workbench.action.openNewsletterSignupUrl';
	static readonly LABEL = nls.localize('newsletterSignup', "Signup for the VS Code Newsletter");
	private telemetryService: ITelemetryService;
	private static readonly URL = product.newsletterSignupUrl;
	static readonly AVAILABLE = !!OpenNewsletterSignupUrlAction.URL;

	constructor(
		id: string,
		label: string,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(id, label);
		this.telemetryService = telemetryService;
	}

	async run(): Promise<void> {
		const info = await this.telemetryService.getTelemetryInfo();

		window.open(`${OpenNewsletterSignupUrlAction.URL}?machineId=${encodeURIComponent(info.machineId)}`);
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

	run(): Promise<void> {
		if (product.twitterUrl) {
			window.open(product.twitterUrl);
		}

		return Promise.resolve();
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

	run(): Promise<void> {
		if (product.requestFeatureUrl) {
			window.open(product.requestFeatureUrl);
		}

		return Promise.resolve();
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

	run(): Promise<void> {
		if (product.licenseUrl) {
			if (language) {
				const queryArgChar = product.licenseUrl.indexOf('?') > 0 ? '&' : '?';
				window.open(`${product.licenseUrl}${queryArgChar}lang=${language}`);
			} else {
				window.open(product.licenseUrl);
			}
		}

		return Promise.resolve();
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

	run(): Promise<void> {
		if (product.privacyStatementUrl) {
			if (language) {
				const queryArgChar = product.privacyStatementUrl.indexOf('?') > 0 ? '&' : '?';
				window.open(`${product.privacyStatementUrl}${queryArgChar}lang=${language}`);
			} else {
				window.open(product.privacyStatementUrl);
			}
		}

		return Promise.resolve();
	}
}
