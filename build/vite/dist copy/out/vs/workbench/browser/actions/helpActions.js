/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../nls.js';
import product from '../../../platform/product/common/product.js';
import { isMacintosh, isLinux, language, isWeb } from '../../../base/common/platform.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { URI } from '../../../base/common/uri.js';
import { MenuId, Action2, registerAction2, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { KeyChord } from '../../../base/common/keyCodes.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { Categories } from '../../../platform/action/common/actionCommonCategories.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { IsSessionsWindowContext } from '../../common/contextkeys.js';
class KeybindingsReferenceAction extends Action2 {
    static { this.ID = 'workbench.action.keybindingsReference'; }
    static { this.AVAILABLE = !!(isLinux ? product.keyboardShortcutsUrlLinux : isMacintosh ? product.keyboardShortcutsUrlMac : product.keyboardShortcutsUrlWin); }
    constructor() {
        super({
            id: KeybindingsReferenceAction.ID,
            title: {
                ...localize2('keybindingsReference', "Keyboard Shortcuts Reference"),
                mnemonicTitle: localize({ key: 'miKeyboardShortcuts', comment: ['&& denotes a mnemonic'] }, "&&Keyboard Shortcuts Reference"),
            },
            category: Categories.Help,
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: null,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 48 /* KeyCode.KeyR */)
            },
            menu: {
                id: MenuId.MenubarHelpMenu,
                group: '2_reference',
                order: 1
            }
        });
    }
    run(accessor) {
        const productService = accessor.get(IProductService);
        const openerService = accessor.get(IOpenerService);
        const url = isLinux ? productService.keyboardShortcutsUrlLinux : isMacintosh ? productService.keyboardShortcutsUrlMac : productService.keyboardShortcutsUrlWin;
        if (url) {
            openerService.open(URI.parse(url));
        }
    }
}
class OpenIntroductoryVideosUrlAction extends Action2 {
    static { this.ID = 'workbench.action.openVideoTutorialsUrl'; }
    static { this.AVAILABLE = !!product.introductoryVideosUrl; }
    constructor() {
        super({
            id: OpenIntroductoryVideosUrlAction.ID,
            title: {
                ...localize2('openVideoTutorialsUrl', "Video Tutorials"),
                mnemonicTitle: localize({ key: 'miVideoTutorials', comment: ['&& denotes a mnemonic'] }, "&&Video Tutorials"),
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
    run(accessor) {
        const productService = accessor.get(IProductService);
        const openerService = accessor.get(IOpenerService);
        if (productService.introductoryVideosUrl) {
            openerService.open(URI.parse(productService.introductoryVideosUrl));
        }
    }
}
class OpenTipsAndTricksUrlAction extends Action2 {
    static { this.ID = 'workbench.action.openTipsAndTricksUrl'; }
    static { this.AVAILABLE = !!product.tipsAndTricksUrl; }
    constructor() {
        super({
            id: OpenTipsAndTricksUrlAction.ID,
            title: {
                ...localize2('openTipsAndTricksUrl', "Tips and Tricks"),
                mnemonicTitle: localize({ key: 'miTipsAndTricks', comment: ['&& denotes a mnemonic'] }, "Tips and Tri&&cks"),
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
    run(accessor) {
        const productService = accessor.get(IProductService);
        const openerService = accessor.get(IOpenerService);
        if (productService.tipsAndTricksUrl) {
            openerService.open(URI.parse(productService.tipsAndTricksUrl));
        }
    }
}
class OpenDocumentationUrlAction extends Action2 {
    static { this.ID = 'workbench.action.openDocumentationUrl'; }
    static { this.AVAILABLE = !!(isWeb ? product.serverDocumentationUrl : product.documentationUrl); }
    constructor() {
        super({
            id: OpenDocumentationUrlAction.ID,
            title: {
                ...localize2('openDocumentationUrl', "Documentation"),
                mnemonicTitle: localize({ key: 'miDocumentation', comment: ['&& denotes a mnemonic'] }, "&&Documentation"),
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
    run(accessor) {
        const productService = accessor.get(IProductService);
        const openerService = accessor.get(IOpenerService);
        const url = isWeb ? productService.serverDocumentationUrl : productService.documentationUrl;
        if (url) {
            openerService.open(URI.parse(url));
        }
    }
}
class OpenNewsletterSignupUrlAction extends Action2 {
    static { this.ID = 'workbench.action.openNewsletterSignupUrl'; }
    static { this.AVAILABLE = !!product.newsletterSignupUrl; }
    constructor() {
        super({
            id: OpenNewsletterSignupUrlAction.ID,
            title: localize2('newsletterSignup', 'Signup for the VS Code Newsletter'),
            category: Categories.Help,
            f1: true
        });
    }
    run(accessor) {
        const productService = accessor.get(IProductService);
        const openerService = accessor.get(IOpenerService);
        const telemetryService = accessor.get(ITelemetryService);
        openerService.open(URI.parse(`${productService.newsletterSignupUrl}?machineId=${encodeURIComponent(telemetryService.machineId)}`));
    }
}
class OpenYouTubeUrlAction extends Action2 {
    static { this.ID = 'workbench.action.openYouTubeUrl'; }
    static { this.AVAILABLE = !!product.youTubeUrl; }
    constructor() {
        super({
            id: OpenYouTubeUrlAction.ID,
            title: {
                ...localize2('openYouTubeUrl', "Join Us on YouTube"),
                mnemonicTitle: localize({ key: 'miYouTube', comment: ['&& denotes a mnemonic'] }, "&&Join Us on YouTube"),
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
    run(accessor) {
        const productService = accessor.get(IProductService);
        const openerService = accessor.get(IOpenerService);
        if (productService.youTubeUrl) {
            openerService.open(URI.parse(productService.youTubeUrl));
        }
    }
}
class OpenRequestFeatureUrlAction extends Action2 {
    static { this.ID = 'workbench.action.openRequestFeatureUrl'; }
    static { this.AVAILABLE = !!product.requestFeatureUrl; }
    constructor() {
        super({
            id: OpenRequestFeatureUrlAction.ID,
            title: {
                ...localize2('openUserVoiceUrl', "Search Feature Requests"),
                mnemonicTitle: localize({ key: 'miUserVoice', comment: ['&& denotes a mnemonic'] }, "&&Search Feature Requests"),
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
    run(accessor) {
        const productService = accessor.get(IProductService);
        const openerService = accessor.get(IOpenerService);
        if (productService.requestFeatureUrl) {
            openerService.open(URI.parse(productService.requestFeatureUrl));
        }
    }
}
class OpenLicenseUrlAction extends Action2 {
    static { this.ID = 'workbench.action.openLicenseUrl'; }
    static { this.AVAILABLE = !!(isWeb ? product.serverLicense : product.licenseUrl); }
    constructor() {
        super({
            id: OpenLicenseUrlAction.ID,
            title: {
                ...localize2('openLicenseUrl', "View License"),
                mnemonicTitle: localize({ key: 'miLicense', comment: ['&& denotes a mnemonic'] }, "View &&License"),
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
    run(accessor) {
        const productService = accessor.get(IProductService);
        const openerService = accessor.get(IOpenerService);
        const url = isWeb ? productService.serverLicenseUrl : productService.licenseUrl;
        if (url) {
            if (language) {
                const queryArgChar = url.indexOf('?') > 0 ? '&' : '?';
                openerService.open(URI.parse(`${url}${queryArgChar}lang=${language}`));
            }
            else {
                openerService.open(URI.parse(url));
            }
        }
    }
}
class OpenPrivacyStatementUrlAction extends Action2 {
    static { this.ID = 'workbench.action.openPrivacyStatementUrl'; }
    static { this.AVAILABLE = !!product.privacyStatementUrl; }
    constructor() {
        super({
            id: OpenPrivacyStatementUrlAction.ID,
            title: {
                ...localize2('openPrivacyStatement', "Privacy Statement"),
                mnemonicTitle: localize({ key: 'miPrivacyStatement', comment: ['&& denotes a mnemonic'] }, "Privac&&y Statement"),
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
    run(accessor) {
        const productService = accessor.get(IProductService);
        const openerService = accessor.get(IOpenerService);
        if (productService.privacyStatementUrl) {
            openerService.open(URI.parse(productService.privacyStatementUrl));
        }
    }
}
class GetStartedWithAccessibilityFeatures extends Action2 {
    static { this.ID = 'workbench.action.getStartedWithAccessibilityFeatures'; }
    constructor() {
        super({
            id: GetStartedWithAccessibilityFeatures.ID,
            title: localize2('getStartedWithAccessibilityFeatures', 'Get Started with Accessibility Features'),
            category: Categories.Help,
            f1: true,
            precondition: IsSessionsWindowContext.negate(),
            menu: {
                id: MenuId.MenubarHelpMenu,
                group: '1_welcome',
                order: 6,
                when: IsSessionsWindowContext.negate()
            }
        });
    }
    run(accessor) {
        const commandService = accessor.get(ICommandService);
        commandService.executeCommand('workbench.action.openWalkthrough', 'SetupAccessibility');
    }
}
class AskVSCodeCopilot extends Action2 {
    static { this.ID = 'workbench.action.askVScode'; }
    constructor() {
        super({
            id: AskVSCodeCopilot.ID,
            title: localize2('askVScode', 'Ask @vscode'),
            category: Categories.Help,
            f1: true,
            precondition: ContextKeyExpr.and(ContextKeyExpr.equals('chatSetupHidden', false), IsSessionsWindowContext.negate())
        });
    }
    async run(accessor) {
        const commandService = accessor.get(ICommandService);
        commandService.executeCommand('workbench.action.chat.open', { mode: 'agent', query: '@vscode ', isPartialQuery: true });
    }
}
MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
    command: {
        id: AskVSCodeCopilot.ID,
        title: localize2('askVScode', 'Ask @vscode'),
    },
    order: 7,
    group: '1_welcome',
    when: ContextKeyExpr.and(ContextKeyExpr.equals('chatSetupHidden', false), IsSessionsWindowContext.negate())
});
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
if (OpenPrivacyStatementUrlAction.AVAILABLE) {
    registerAction2(OpenPrivacyStatementUrlAction);
}
registerAction2(GetStartedWithAccessibilityFeatures);
registerAction2(AskVSCodeCopilot);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGVscEFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9hY3Rpb25zL2hlbHBBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDdEQsT0FBTyxPQUFPLE1BQU0sNkNBQTZDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzdHLE9BQU8sRUFBRSxRQUFRLEVBQW1CLE1BQU0sa0NBQWtDLENBQUM7QUFDN0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBR3JGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUN2RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDaEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRXRFLE1BQU0sMEJBQTJCLFNBQVEsT0FBTzthQUUvQixPQUFFLEdBQUcsdUNBQXVDLENBQUM7YUFDN0MsY0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLE9B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