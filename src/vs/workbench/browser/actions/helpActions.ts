/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import product from 'vs/platform/product/common/product';
import { isMacintosh, isLinux, language, isWeb } from 'vs/base/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { URI } from 'vs/base/common/uri';
import { MenuId, Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeyChord, KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IProductService } from 'vs/platform/product/common/productService';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';

class KeybindingsReferenceAction extends Action2 {

	static readonly ID = 'workbench.action.keybindingsReference';
	static readonly AVAILABLE = !!(isLinux ? product.keyboardShortcutsUrlLinux : isMacintosh ? product.keyboardShortcutsUrlMac : product.keyboardShortcutsUrlWin);

	constructor() {
		super({
			id: KeybindingsReferenceAction.ID,
			title: {
				value: localize('keybindingsReference', "Keyboard Shortcuts Reference"),
				mnemonicTitle: localize({ key: 'miKeyboardShortcuts', comment: ['&& denotes a mnemonic'] }, "&&Keyboard Shortcuts Reference"),
				original: 'Keyboard Shortcuts Reference'
			},
			category: Categories.Help,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: null,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyR)
			},
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '2_reference',
				order: 1
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const productService = accessor.get(IProductService);
		const openerService = accessor.get(IOpenerService);

		const url = isLinux ? productService.keyboardShortcutsUrlLinux : isMacintosh ? productService.keyboardShortcutsUrlMac : productService.keyboardShortcutsUrlWin;
		if (url) {
			openerService.open(URI.parse(url));
		}
	}
}

class OpenIntroductoryVideosUrlAction extends Action2 {

	static readonly ID = 'workbench.action.openVideoTutorialsUrl';
	static readonly AVAILABLE = !!product.introductoryVideosUrl;

	constructor() {
		super({
			id: OpenIntroductoryVideosUrlAction.ID,
			title: {
				value: localize('openVideoTutorialsUrl', "Video Tutorials"),
				mnemonicTitle: localize({ key: 'miVideoTutorials', comment: ['&& denotes a mnemonic'] }, "&&Video Tutorials"),
				original: 'Video Tutorials'
			},
			category: Categories.Help,
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '2_reference',
				order: 2
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const productService = accessor.get(IProductService);
		const openerService = accessor.get(IOpenerService);

		if (productService.introductoryVideosUrl) {
			openerService.open(URI.parse(productService.introductoryVideosUrl));
		}
	}
}

class OpenTipsAndTricksUrlAction extends Action2 {

	static readonly ID = 'workbench.action.openTipsAndTricksUrl';
	static readonly AVAILABLE = !!product.tipsAndTricksUrl;

	constructor() {
		super({
			id: OpenTipsAndTricksUrlAction.ID,
			title: {
				value: localize('openTipsAndTricksUrl', "Tips and Tricks"),
				mnemonicTitle: localize({ key: 'miTipsAndTricks', comment: ['&& denotes a mnemonic'] }, "Tips and Tri&&cks"),
				original: 'Tips and Tricks'
			},
			category: Categories.Help,
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '2_reference',
				order: 3
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const productService = accessor.get(IProductService);
		const openerService = accessor.get(IOpenerService);

		if (productService.tipsAndTricksUrl) {
			openerService.open(URI.parse(productService.tipsAndTricksUrl));
		}
	}
}

class OpenDocumentationUrlAction extends Action2 {

	static readonly ID = 'workbench.action.openDocumentationUrl';
	static readonly AVAILABLE = !!(isWeb ? product.serverDocumentationUrl : product.documentationUrl);

	constructor() {
		super({
			id: OpenDocumentationUrlAction.ID,
			title: {
				value: localize('openDocumentationUrl', "Documentation"),
				mnemonicTitle: localize({ key: 'miDocumentation', comment: ['&& denotes a mnemonic'] }, "&&Documentation"),
				original: 'Documentation'
			},
			category: Categories.Help,
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '1_welcome',
				order: 3
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const productService = accessor.get(IProductService);
		const openerService = accessor.get(IOpenerService);
		const url = isWeb ? productService.serverDocumentationUrl : productService.documentationUrl;

		if (url) {
			openerService.open(URI.parse(url));
		}
	}
}

class OpenNewsletterSignupUrlAction extends Action2 {

	static readonly ID = 'workbench.action.openNewsletterSignupUrl';
	static readonly AVAILABLE = !!product.newsletterSignupUrl;

	constructor() {
		super({
			id: OpenNewsletterSignupUrlAction.ID,
			title: { value: localize('newsletterSignup', "Signup for the VS Code Newsletter"), original: 'Signup for the VS Code Newsletter' },
			category: Categories.Help,
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const productService = accessor.get(IProductService);
		const openerService = accessor.get(IOpenerService);
		const telemetryService = accessor.get(ITelemetryService);
		openerService.open(URI.parse(`${productService.newsletterSignupUrl}?machineId=${encodeURIComponent(telemetryService.machineId)}`));
	}
}

class OpenYouTubeUrlAction extends Action2 {

	static readonly ID = 'workbench.action.openYouTubeUrl';
	static readonly AVAILABLE = !!product.youTubeUrl;

	constructor() {
		super({
			id: OpenYouTubeUrlAction.ID,
			title: {
				value: localize('openYouTubeUrl', "Join Us on YouTube"),
				mnemonicTitle: localize({ key: 'miYouTube', comment: ['&& denotes a mnemonic'] }, "&&Join Us on YouTube"),
				original: 'Join Us on YouTube'
			},
			category: Categories.Help,
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '3_feedback',
				order: 1
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const productService = accessor.get(IProductService);
		const openerService = accessor.get(IOpenerService);

		if (productService.youTubeUrl) {
			openerService.open(URI.parse(productService.youTubeUrl));
		}
	}
}

class OpenRequestFeatureUrlAction extends Action2 {

	static readonly ID = 'workbench.action.openRequestFeatureUrl';
	static readonly AVAILABLE = !!product.requestFeatureUrl;

	constructor() {
		super({
			id: OpenRequestFeatureUrlAction.ID,
			title: {
				value: localize('openUserVoiceUrl', "Search Feature Requests"),
				mnemonicTitle: localize({ key: 'miUserVoice', comment: ['&& denotes a mnemonic'] }, "&&Search Feature Requests"),
				original: 'Search Feature Requests'
			},
			category: Categories.Help,
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '3_feedback',
				order: 2
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const productService = accessor.get(IProductService);
		const openerService = accessor.get(IOpenerService);

		if (productService.requestFeatureUrl) {
			openerService.open(URI.parse(productService.requestFeatureUrl));
		}
	}
}

class OpenLicenseUrlAction extends Action2 {

	static readonly ID = 'workbench.action.openLicenseUrl';
	static readonly AVAILABLE = !!(isWeb ? product.serverLicense : product.licenseUrl);

	constructor() {
		super({
			id: OpenLicenseUrlAction.ID,
			title: {
				value: localize('openLicenseUrl', "View License"),
				mnemonicTitle: localize({ key: 'miLicense', comment: ['&& denotes a mnemonic'] }, "View &&License"),
				original: 'View License'
			},
			category: Categories.Help,
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '4_legal',
				order: 1
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const productService = accessor.get(IProductService);
		const openerService = accessor.get(IOpenerService);
		const url = isWeb ? productService.serverLicenseUrl : productService.licenseUrl;

		if (url) {
			if (language) {
				const queryArgChar = url.indexOf('?') > 0 ? '&' : '?';
				openerService.open(URI.parse(`${url}${queryArgChar}lang=${language}`));
			} else {
				openerService.open(URI.parse(url));
			}
		}
	}
}

class OpenPrivacyStatementUrlAction extends Action2 {

	static readonly ID = 'workbench.action.openPrivacyStatementUrl';
	static readonly AVAILABE = !!product.privacyStatementUrl;

	constructor() {
		super({
			id: OpenPrivacyStatementUrlAction.ID,
			title: {
				value: localize('openPrivacyStatement', "Privacy Statement"),
				mnemonicTitle: localize({ key: 'miPrivacyStatement', comment: ['&& denotes a mnemonic'] }, "Privac&&y Statement"),
				original: 'Privacy Statement'
			},
			category: Categories.Help,
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '4_legal',
				order: 2
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const productService = accessor.get(IProductService);
		const openerService = accessor.get(IOpenerService);

		if (productService.privacyStatementUrl) {
			openerService.open(URI.parse(productService.privacyStatementUrl));
		}
	}
}

// --- Actions Registration

if (KeybindingsReferenceAction.AVAILABLE) {
	registerAction2(KeybindingsReferenceAction);
}

if (OpenIntroductoryVideosUrlAction.AVAILABLE) {
	registerAction2(OpenIntroductoryVideosUrlAction);
}

if (OpenTipsAndTricksUrlAction.AVAILABLE) {
	registerAction2(OpenTipsAndTricksUrlAction);
}

if (OpenDocumentationUrlAction.AVAILABLE) {
	registerAction2(OpenDocumentationUrlAction);
}

if (OpenNewsletterSignupUrlAction.AVAILABLE) {
	registerAction2(OpenNewsletterSignupUrlAction);
}

if (OpenYouTubeUrlAction.AVAILABLE) {
	registerAction2(OpenYouTubeUrlAction);
}

if (OpenRequestFeatureUrlAction.AVAILABLE) {
	registerAction2(OpenRequestFeatureUrlAction);
}

if (OpenLicenseUrlAction.AVAILABLE) {
	registerAction2(OpenLicenseUrlAction);
}

if (OpenPrivacyStatementUrlAction.AVAILABE) {
	registerAction2(OpenPrivacyStatementUrlAction);
}
