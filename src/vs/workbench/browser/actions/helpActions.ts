/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import product from 'vs/platform/product/browser/product';
import { isMacintosh, isLinux, language } from 'vs/base/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { URI } from 'vs/base/common/uri';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { KeyChord, KeyMod, KeyCode } from 'vs/base/common/keyCodes';

class KeybindingsReferenceAction extends Action {

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
		if (KeybindingsReferenceAction.URL) {
			this.openerService.open(URI.parse(KeybindingsReferenceAction.URL));
		}

		return Promise.resolve();
	}
}

class OpenDocumentationUrlAction extends Action {

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
		if (OpenDocumentationUrlAction.URL) {
			this.openerService.open(URI.parse(OpenDocumentationUrlAction.URL));
		}

		return Promise.resolve();
	}
}

class OpenIntroductoryVideosUrlAction extends Action {

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
		if (OpenIntroductoryVideosUrlAction.URL) {
			this.openerService.open(URI.parse(OpenIntroductoryVideosUrlAction.URL));
		}

		return Promise.resolve();
	}
}

class OpenTipsAndTricksUrlAction extends Action {

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
		if (OpenTipsAndTricksUrlAction.URL) {
			this.openerService.open(URI.parse(OpenTipsAndTricksUrlAction.URL));
		}

		return Promise.resolve();
	}
}

class OpenNewsletterSignupUrlAction extends Action {

	static readonly ID = 'workbench.action.openNewsletterSignupUrl';
	static readonly LABEL = nls.localize('newsletterSignup', "Signup for the VS Code Newsletter");
	static readonly AVAILABLE = !!product.newsletterSignupUrl;

	constructor(
		id: string,
		label: string,
		@IOpenerService private readonly openerService: IOpenerService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super(id, label);
	}

	async run(): Promise<void> {
		const info = await this.telemetryService.getTelemetryInfo();

		this.openerService.open(URI.parse(`${product.newsletterSignupUrl}?machineId=${encodeURIComponent(info.machineId)}`));
	}
}

class OpenTwitterUrlAction extends Action {

	static readonly ID = 'workbench.action.openTwitterUrl';
	static readonly LABEL = nls.localize('openTwitterUrl', "Join Us on Twitter", product.applicationName);
	static readonly AVAILABLE = !!product.twitterUrl;

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

class OpenRequestFeatureUrlAction extends Action {

	static readonly ID = 'workbench.action.openRequestFeatureUrl';
	static readonly LABEL = nls.localize('openUserVoiceUrl', "Search Feature Requests");
	static readonly AVAILABLE = !!product.requestFeatureUrl;

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

class OpenLicenseUrlAction extends Action {

	static readonly ID = 'workbench.action.openLicenseUrl';
	static readonly LABEL = nls.localize('openLicenseUrl', "View License");
	static readonly AVAILABLE = !!product.licenseUrl;

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

class OpenPrivacyStatementUrlAction extends Action {

	static readonly ID = 'workbench.action.openPrivacyStatementUrl';
	static readonly LABEL = nls.localize('openPrivacyStatement', "Privacy Statement");
	static readonly AVAILABE = !!product.privacyStatementUrl;

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

// --- Actions Registration

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
const helpCategory = nls.localize('help', "Help");

if (KeybindingsReferenceAction.AVAILABLE) {
	registry.registerWorkbenchAction(new SyncActionDescriptor(KeybindingsReferenceAction, KeybindingsReferenceAction.ID, KeybindingsReferenceAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_R) }), 'Help: Keyboard Shortcuts Reference', helpCategory);
}

if (OpenDocumentationUrlAction.AVAILABLE) {
	registry.registerWorkbenchAction(new SyncActionDescriptor(OpenDocumentationUrlAction, OpenDocumentationUrlAction.ID, OpenDocumentationUrlAction.LABEL), 'Help: Documentation', helpCategory);
}

if (OpenIntroductoryVideosUrlAction.AVAILABLE) {
	registry.registerWorkbenchAction(new SyncActionDescriptor(OpenIntroductoryVideosUrlAction, OpenIntroductoryVideosUrlAction.ID, OpenIntroductoryVideosUrlAction.LABEL), 'Help: Introductory Videos', helpCategory);
}

if (OpenTipsAndTricksUrlAction.AVAILABLE) {
	registry.registerWorkbenchAction(new SyncActionDescriptor(OpenTipsAndTricksUrlAction, OpenTipsAndTricksUrlAction.ID, OpenTipsAndTricksUrlAction.LABEL), 'Help: Tips and Tricks', helpCategory);
}

if (OpenNewsletterSignupUrlAction.AVAILABLE) {
	registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNewsletterSignupUrlAction, OpenNewsletterSignupUrlAction.ID, OpenNewsletterSignupUrlAction.LABEL), 'Help: Tips and Tricks', helpCategory);
}

if (OpenTwitterUrlAction.AVAILABLE) {
	registry.registerWorkbenchAction(new SyncActionDescriptor(OpenTwitterUrlAction, OpenTwitterUrlAction.ID, OpenTwitterUrlAction.LABEL), 'Help: Join Us on Twitter', helpCategory);
}

if (OpenRequestFeatureUrlAction.AVAILABLE) {
	registry.registerWorkbenchAction(new SyncActionDescriptor(OpenRequestFeatureUrlAction, OpenRequestFeatureUrlAction.ID, OpenRequestFeatureUrlAction.LABEL), 'Help: Search Feature Requests', helpCategory);
}

if (OpenLicenseUrlAction.AVAILABLE) {
	registry.registerWorkbenchAction(new SyncActionDescriptor(OpenLicenseUrlAction, OpenLicenseUrlAction.ID, OpenLicenseUrlAction.LABEL), 'Help: View License', helpCategory);
}

if (OpenPrivacyStatementUrlAction.AVAILABE) {
	registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPrivacyStatementUrlAction, OpenPrivacyStatementUrlAction.ID, OpenPrivacyStatementUrlAction.LABEL), 'Help: Privacy Statement', helpCategory);
}

// --- Menu Registration

// Help

if (OpenDocumentationUrlAction.AVAILABLE) {
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '1_welcome',
		command: {
			id: OpenDocumentationUrlAction.ID,
			title: nls.localize({ key: 'miDocumentation', comment: ['&& denotes a mnemonic'] }, "&&Documentation")
		},
		order: 3
	});
}

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '1_welcome',
	command: {
		id: 'update.showCurrentReleaseNotes',
		title: nls.localize({ key: 'miReleaseNotes', comment: ['&& denotes a mnemonic'] }, "&&Release Notes")
	},
	order: 4
});

// Reference
if (KeybindingsReferenceAction.AVAILABLE) {
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '2_reference',
		command: {
			id: KeybindingsReferenceAction.ID,
			title: nls.localize({ key: 'miKeyboardShortcuts', comment: ['&& denotes a mnemonic'] }, "&&Keyboard Shortcuts Reference")
		},
		order: 1
	});
}

if (OpenIntroductoryVideosUrlAction.AVAILABLE) {
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '2_reference',
		command: {
			id: OpenIntroductoryVideosUrlAction.ID,
			title: nls.localize({ key: 'miIntroductoryVideos', comment: ['&& denotes a mnemonic'] }, "Introductory &&Videos")
		},
		order: 2
	});
}

if (OpenTipsAndTricksUrlAction.AVAILABLE) {
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '2_reference',
		command: {
			id: OpenTipsAndTricksUrlAction.ID,
			title: nls.localize({ key: 'miTipsAndTricks', comment: ['&& denotes a mnemonic'] }, "Tips and Tri&&cks")
		},
		order: 3
	});
}

// Feedback
if (OpenTwitterUrlAction.AVAILABLE) {
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '3_feedback',
		command: {
			id: OpenTwitterUrlAction.ID,
			title: nls.localize({ key: 'miTwitter', comment: ['&& denotes a mnemonic'] }, "&&Join Us on Twitter")
		},
		order: 1
	});
}

if (OpenRequestFeatureUrlAction.AVAILABLE) {
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '3_feedback',
		command: {
			id: OpenRequestFeatureUrlAction.ID,
			title: nls.localize({ key: 'miUserVoice', comment: ['&& denotes a mnemonic'] }, "&&Search Feature Requests")
		},
		order: 2
	});
}

// Legal
if (OpenLicenseUrlAction.AVAILABLE) {
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '4_legal',
		command: {
			id: OpenLicenseUrlAction.ID,
			title: nls.localize({ key: 'miLicense', comment: ['&& denotes a mnemonic'] }, "View &&License")
		},
		order: 1
	});
}

if (OpenPrivacyStatementUrlAction.AVAILABE) {
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '4_legal',
		command: {
			id: OpenPrivacyStatementUrlAction.ID,
			title: nls.localize({ key: 'miPrivacyStatement', comment: ['&& denotes a mnemonic'] }, "Privac&&y Statement")
		},
		order: 2
	});
}
