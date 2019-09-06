/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import product from 'vs/platform/product/node/product';
import { isMacintosh, isLinux, language } from 'vs/base/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { URI } from 'vs/base/common/uri';

export class KeybindingsReferenceAction extends Action {

	static readonly ID = 'workbench.action.keybindingsReference';
	static readonly LABEL = nls.localize('keybindingsReference', "Keyboard Shortcuts Reference");

	private static readonly URL = isLinux ? product.keyboardShortcutsUrlLinux : isMacintosh ? product.keyboardShortcutsUrlMac : product.keyboardShortcutsUrlWin;
	static readonly AVAILABLE = !!KeybindingsReferenceAction.URL;

	constructor(
		id: string,
		label: string,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		this.openerService.open(URI.parse(KeybindingsReferenceAction.URL));

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
		label: string,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		this.openerService.open(URI.parse(OpenDocumentationUrlAction.URL));

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
		label: string,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		this.openerService.open(URI.parse(OpenIntroductoryVideosUrlAction.URL));

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
		label: string,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		this.openerService.open(URI.parse(OpenTipsAndTricksUrlAction.URL));
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
		@IOpenerService private readonly openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(id, label);
		this.telemetryService = telemetryService;
	}

	async run(): Promise<void> {
		const info = await this.telemetryService.getTelemetryInfo();

		this.openerService.open(URI.parse(`${OpenNewsletterSignupUrlAction.URL}?machineId=${encodeURIComponent(info.machineId)}`));
	}
}

export class OpenTwitterUrlAction extends Action {

	static readonly ID = 'workbench.action.openTwitterUrl';
	static LABEL = nls.localize('openTwitterUrl', "Join Us on Twitter", product.applicationName);

	constructor(
		id: string,
		label: string,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		if (product.twitterUrl) {
			this.openerService.open(URI.parse(product.twitterUrl));
		}

		return Promise.resolve();
	}
}

export class OpenRequestFeatureUrlAction extends Action {

	static readonly ID = 'workbench.action.openRequestFeatureUrl';
	static LABEL = nls.localize('openUserVoiceUrl', "Search Feature Requests");

	constructor(
		id: string,
		label: string,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		if (product.requestFeatureUrl) {
			this.openerService.open(URI.parse(product.requestFeatureUrl));
		}

		return Promise.resolve();
	}
}

export class OpenLicenseUrlAction extends Action {

	static readonly ID = 'workbench.action.openLicenseUrl';
	static LABEL = nls.localize('openLicenseUrl', "View License");

	constructor(
		id: string,
		label: string,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		if (product.licenseUrl) {
			if (language) {
				const queryArgChar = product.licenseUrl.indexOf('?') > 0 ? '&' : '?';
				this.openerService.open(URI.parse(`${product.licenseUrl}${queryArgChar}lang=${language}`));
			} else {
				this.openerService.open(URI.parse(product.licenseUrl));
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
		label: string,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		if (product.privacyStatementUrl) {
			if (language) {
				const queryArgChar = product.privacyStatementUrl.indexOf('?') > 0 ? '&' : '?';
				this.openerService.open(URI.parse(`${product.privacyStatementUrl}${queryArgChar}lang=${language}`));
			} else {
				this.openerService.open(URI.parse(product.privacyStatementUrl));
			}
		}

		return Promise.resolve();
	}
}
