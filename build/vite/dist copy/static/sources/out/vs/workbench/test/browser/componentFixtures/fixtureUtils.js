/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// This should be the only place that is allowed to import from @vscode/component-explorer
// eslint-disable-next-line local/code-import-patterns
import { defineFixture, defineFixtureGroup, defineFixtureVariants } from '@vscode/component-explorer';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
// eslint-disable-next-line local/code-import-patterns
import '../../../../../../build/vite/style.css';
import '../../../browser/media/style.css';
// Theme
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { getIconsStyleSheet } from '../../../../platform/theme/browser/iconsStyleSheet.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IThemeService, Extensions as ThemingExtensions } from '../../../../platform/theme/common/themeService.js';
import { generateColorThemeCSS } from '../../../services/themes/browser/colorThemeCss.js';
import { ColorThemeData } from '../../../services/themes/common/colorThemeData.js';
import { COLOR_THEME_DARK_INITIAL_COLORS, COLOR_THEME_LIGHT_INITIAL_COLORS } from '../../../services/themes/common/workbenchThemeService.js';
// Instantiation
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
// Test service implementations
import { Emitter, Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IInlineCompletionsService, InlineCompletionsService } from '../../../../editor/browser/services/inlineCompletionsService.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ILanguageConfigurationService } from '../../../../editor/common/languages/languageConfigurationRegistry.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from '../../../../editor/common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../editor/common/services/languageFeaturesService.js';
import { LanguageService } from '../../../../editor/common/services/languageService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ModelService } from '../../../../editor/common/services/modelService.js';
import { ITextResourcePropertiesService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { ITreeSitterLibraryService } from '../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { ICodeLensCache } from '../../../../editor/contrib/codelens/browser/codeLensCache.js';
import { TestCodeEditorService, TestCommandService } from '../../../../editor/test/browser/editorTestServices.js';
import { TestLanguageConfigurationService } from '../../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { TestEditorWorkerService } from '../../../../editor/test/common/services/testEditorWorkerService.js';
import { TestTextResourcePropertiesService } from '../../../../editor/test/common/services/testTextResourcePropertiesService.js';
import { TestTreeSitterLibraryService } from '../../../../editor/test/common/services/testTreeSitterLibraryService.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../platform/clipboard/test/common/testClipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IDataChannelService, NullDataChannelService } from '../../../../platform/dataChannel/common/dataChannel.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../platform/dialogs/test/common/testDialogService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILoggerService, ILogService, NullLoggerService, NullLogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../platform/opener/test/common/nullOpenerService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { UndoRedoService } from '../../../../platform/undoRedo/common/undoRedoService.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../platform/userInteraction/browser/userInteractionService.js';
import { TestMenuService } from '../workbenchTestServices.js';
import { IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
// eslint-disable-next-line local/code-import-patterns
import { IAgentFeedbackService } from '../../../../sessions/contrib/agentFeedback/browser/agentFeedbackService.js';
import { IChatEditingService } from '../../../contrib/chat/common/editing/chatEditingService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsManagementService } from '../../../../sessions/contrib/sessions/browser/sessionsManagementService.js';
// eslint-disable-next-line local/code-import-patterns
import { ICodeReviewService } from '../../../../sessions/contrib/codeReview/browser/codeReviewService.js';
import { constObservable } from '../../../../base/common/observable.js';
// Import color registrations to ensure colors are available
import { isThenable } from '../../../../base/common/async.js';
import '../../../../platform/theme/common/colors/baseColors.js';
import '../../../../platform/theme/common/colors/editorColors.js';
import '../../../../platform/theme/common/colors/listColors.js';
import '../../../../platform/theme/common/colors/miscColors.js';
import '../../../common/theme.js';
/**
 * A storage service that never stores anything and always returns the default/fallback value.
 * This is useful for fixtures where we want consistent behavior without persisted state.
 */
class NullStorageService {
    constructor() {
        this._onDidChangeValue = new Emitter();
        this._onDidChangeTarget = new Emitter();
        this.onDidChangeTarget = this._onDidChangeTarget.event;
        this._onWillSaveState = new Emitter();
        this.onWillSaveState = this._onWillSaveState.event;
    }
    onDidChangeValue(scope, key, disposable) {
        return Event.filter(this._onDidChangeValue.event, e => e.scope === scope && (key === undefined || e.key === key), disposable);
    }
    get(_key, _scope, fallbackValue) {
        return fallbackValue;
    }
    getBoolean(_key, _scope, fallbackValue) {
        return fallbackValue;
    }
    getNumber(_key, _scope, fallbackValue) {
        return fallbackValue;
    }
    getObject(_key, _scope, fallbackValue) {
        return fallbackValue;
    }
    store(_key, _value, _scope, _target) {
        // no-op
    }
    storeAll(_entries, _external) {
        // no-op
    }
    remove(_key, _scope) {
        // no-op
    }
    isNew(_scope) {
        return true;
    }
    flush(_reason) {
        return Promise.resolve();
    }
    optimize(_scope) {
        return Promise.resolve();
    }
    log() {
        // no-op
    }
    keys(_scope, _target) {
        return [];
    }
    switch() {
        return Promise.resolve();
    }
    hasScope(_scope) {
        return false;
    }
}
// ============================================================================
// Themes
// ============================================================================
const themingRegistry = Registry.as(ThemingExtensions.ThemingContribution);
const mockEnvironmentService = Object.create(null);
export const darkTheme = ColorThemeData.createUnloadedThemeForThemeType(ColorScheme.DARK, COLOR_THEME_DARK_INITIAL_COLORS);
export const lightTheme = ColorThemeData.createUnloadedThemeForThemeType(ColorScheme.LIGHT, COLOR_THEME_LIGHT_INITIAL_COLORS);
let globalStyleSheet;
let iconsStyleSheetCache;
let darkThemeStyleSheet;
let lightThemeStyleSheet;
function getGlobalStyleSheet() {
    if (!globalStyleSheet) {
        globalStyleSheet = new CSSStyleSheet();
        const globalRules = [];
        for (const sheet of Array.from(document.styleSheets)) {
            try {
                for (const rule of Array.from(sheet.cssRules)) {
                    globalRules.push(rule.cssText);
                }
            }
            catch {
                // Cross-origin stylesheets can't be read
            }
        }
        globalStyleSheet.replaceSync(globalRules.join('\n'));
    }
    return globalStyleSheet;
}
function getIconsStyleSheetCached() {
    if (!iconsStyleSheetCache) {
        iconsStyleSheetCache = new CSSStyleSheet();
        const iconsSheet = getIconsStyleSheet(undefined);
        iconsStyleSheetCache.replaceSync(iconsSheet.getCSS());
        iconsSheet.dispose();
    }
    return iconsStyleSheetCache;
}
function getThemeStyleSheet(theme) {
    const isDark = theme.type === ColorScheme.DARK;
    if (isDark && darkThemeStyleSheet) {
        return darkThemeStyleSheet;
    }
    if (!isDark && lightThemeStyleSheet) {
        return lightThemeStyleSheet;
    }
    const scopeSelector = '.' + theme.classNames[0];
    const sheet = new CSSStyleSheet();
    const css = generateColorThemeCSS(theme, scopeSelector, themingRegistry.getThemingParticipants(), mockEnvironmentService);
    sheet.replaceSync(css.code);
    if (isDark) {
        darkThemeStyleSheet = sheet;
    }
    else {
        lightThemeStyleSheet = sheet;
    }
    return sheet;
}
let globalStylesInstalled = false;
function installGlobalStyles() {
    if (globalStylesInstalled) {
        return;
    }
    globalStylesInstalled = true;
    document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets,
        getGlobalStyleSheet(),
        getIconsStyleSheetCached(),
        getThemeStyleSheet(darkTheme),
        getThemeStyleSheet(lightTheme),
    ];
}
export function setupTheme(container, theme) {
    installGlobalStyles();
    container.classList.add('monaco-workbench', getPlatformClass(), ...theme.classNames);
}
function getPlatformClass() {
    const alwaysUseMac = true;
    if (alwaysUseMac) {
        return 'mac';
    }
    else {
        const ua = navigator.userAgent;
        if (ua.includes('Macintosh')) {
            return 'mac';
        }
        if (ua.includes('Linux')) {
            return 'linux';
        }
        return 'windows';
    }
}
/**
 * Creates a TestInstantiationService with all services needed for CodeEditorWidget.
 * Additional services can be registered via the options callback.
 */
export function createEditorServices(disposables, options) {
    const services = new ServiceCollection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serviceIdentifiers = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const define = (id, ctor) => {
        if (!services.has(id)) {
            services.set(id, new SyncDescriptor(ctor));
        }
        serviceIdentifiers.push(id);
    };
    const defineInstance = (id, instance) => {
        if (!services.has(id)) {
            services.set(id, instance);
        }
        serviceIdentifiers.push(id);
    };
    const definePartialInstance = (id, instance) => {
        defineInstance(id, instance);
    };
    // Base editor services
    define(IAccessibilityService, TestAccessibilityService);
    define(IKeybindingService, MockKeybindingService);
    define(IClipboardService, TestClipboardService);
    define(IEditorWorkerService, TestEditorWorkerService);
    defineInstance(IOpenerService, NullOpenerService);
    define(INotificationService, TestNotificationService);
    define(IDialogService, TestDialogService);
    define(IUndoRedoService, UndoRedoService);
    define(ILanguageService, LanguageService);
    define(ILanguageConfigurationService, TestLanguageConfigurationService);
    define(IConfigurationService, TestConfigurationService);
    define(ITextResourcePropertiesService, TestTextResourcePropertiesService);
    defineInstance(IStorageService, new NullStorageService());
    if (options?.colorTheme) {
        defineInstance(IThemeService, new TestThemeService(options.colorTheme));
    }
    else {
        define(IThemeService, TestThemeService);
    }
    define(ILogService, NullLogService);
    define(IModelService, ModelService);
    define(ICodeEditorService, TestCodeEditorService);
    define(IContextKeyService, MockContextKeyService);
    define(ICommandService, TestCommandService);
    define(ITelemetryService, NullTelemetryServiceShape);
    define(ILoggerService, NullLoggerService);
    define(IDataChannelService, NullDataChannelService);
    define(IEnvironmentService, class extends mock() {
        constructor() {
            super(...arguments);
            this.isBuilt = true;
            this.isExtensionDevelopment = false;
        }
    });
    define(ILanguageFeatureDebounceService, LanguageFeatureDebounceService);
    define(ILanguageFeaturesService, LanguageFeaturesService);
    define(ITreeSitterLibraryService, TestTreeSitterLibraryService);
    define(IInlineCompletionsService, InlineCompletionsService);
    defineInstance(ICodeLensCache, {
        _serviceBrand: undefined,
        put: () => { },
        get: () => undefined,
        delete: () => { },
    });
    defineInstance(IHoverService, {
        _serviceBrand: undefined,
        showDelayedHover: () => undefined,
        setupDelayedHover: () => ({ dispose: () => { } }),
        setupDelayedHoverAtMouse: () => ({ dispose: () => { } }),
        showInstantHover: () => undefined,
        hideHover: () => { },
        showAndFocusLastHover: () => { },
        setupManagedHover: () => ({ dispose: () => { }, show: () => { }, hide: () => { }, update: () => { } }),
        showManagedHover: () => { },
    });
    defineInstance(IDefaultAccountService, {
        _serviceBrand: undefined,
        onDidChangeDefaultAccount: new Emitter().event,
        onDidChangePolicyData: new Emitter().event,
        policyData: null,
        copilotTokenInfo: null,
        onDidChangeCopilotTokenInfo: new Emitter().event,
        getDefaultAccount: async () => null,
        getDefaultAccountAuthenticationProvider: () => ({ id: 'test', name: 'Test', scopes: [], enterprise: false }),
        setDefaultAccountProvider: () => { },
        refresh: async () => null,
        signIn: async () => null,
        signOut: async () => { },
    });
    // User interaction service with focus simulation enabled (all elements appear focused in fixtures)
    defineInstance(IUserInteractionService, new MockUserInteractionService(true, false));
    defineInstance(IAccessibilitySignalService, {
        _serviceBrand: undefined,
        playSignal: async () => { },
        playSignals: async () => { },
        playSignalLoop: () => ({ dispose: () => { } }),
        getEnabledState: () => ({ value: false, onDidChange: Event.None, onChange: () => ({ dispose: () => { } }) }),
        getDelayMs: () => 0,
        playSound: async () => { },
        isSoundEnabled: () => false,
        isAnnouncementEnabled: () => false,
        onSoundEnabledChanged: () => Event.None,
    });
    definePartialInstance(ITextModelService, {
        _serviceBrand: undefined,
        registerTextModelContentProvider: () => ({ dispose: () => { } }),
        canHandleResource: () => false,
    });
    defineInstance(IAgentFeedbackService, {
        _serviceBrand: undefined,
        onDidChangeFeedback: Event.None,
        onDidChangeNavigation: Event.None,
        addFeedback: () => undefined,
        removeFeedback: () => { },
        updateFeedback: () => { },
        getFeedback: () => [],
        getMostRecentSessionForResource: () => undefined,
        revealFeedback: async () => { },
        revealSessionComment: async () => { },
        getNextFeedback: () => undefined,
        getNextNavigableItem: () => undefined,
        setNavigationAnchor: () => { },
        getNavigationBearing: () => ({ activeIdx: -1, totalCount: 0 }),
        clearFeedback: () => { },
        addFeedbackAndSubmit: async () => { },
    });
    definePartialInstance(IChatEditingService, {
        _serviceBrand: undefined,
        editingSessionsObs: constObservable([]),
        startOrContinueGlobalEditingSession: () => undefined,
        getEditingSession: () => undefined,
    });
    definePartialInstance(ISessionsManagementService, {
        _serviceBrand: undefined,
        getSession: () => undefined,
        getSessions: () => [],
    });
    definePartialInstance(ICodeReviewService, {
        _serviceBrand: undefined,
        getReviewState: () => constObservable({ kind: "idle" /* CodeReviewStateKind.Idle */ }),
        getPRReviewState: () => constObservable({ kind: "none" /* PRReviewStateKind.None */ }),
        hasReview: () => false,
        requestReview: () => { },
        removeComment: () => { },
        updateComment: () => { },
        dismissReview: () => { },
        resolvePRReviewThread: async () => { },
        markPRReviewCommentConverted: () => { },
    });
    // Allow additional services to be registered
    options?.additionalServices?.({ define, defineInstance, definePartialInstance });
    const instantiationService = disposables.add(new TestInstantiationService(services, true));
    disposables.add(toDisposable(() => {
        for (const id of serviceIdentifiers) {
            const instanceOrDescriptor = services.get(id);
            if (typeof instanceOrDescriptor?.dispose === 'function') {
                instanceOrDescriptor.dispose();
            }
        }
    }));
    return instantiationService;
}
/**
 * Registers additional services needed by workbench components (merge editor, etc.).
 * Use with createEditorServices additionalServices option.
 */
export function registerWorkbenchServices(registration) {
    registration.defineInstance(IContextMenuService, {
        showContextMenu: () => { },
        onDidShowContextMenu: () => ({ dispose: () => { } }),
        onDidHideContextMenu: () => ({ dispose: () => { } }),
        _serviceBrand: undefined,
    });
    registration.defineInstance(IContextViewService, {
        showContextView: () => ({ close: () => { } }),
        hideContextView: () => { },
        getContextViewElement: () => { throw new Error('Not implemented'); },
        layout: () => { },
        anchorAlignment: 0,
        _serviceBrand: undefined,
    });
    registration.defineInstance(ILabelService, {
        getUriLabel: (uri) => uri.path,
        getUriBasenameLabel: (uri) => uri.path.split('/').pop() ?? '',
        getWorkspaceLabel: () => '',
        getHostLabel: () => '',
        getSeparator: () => '/',
        registerFormatter: () => ({ dispose: () => { } }),
        onDidChangeFormatters: () => ({ dispose: () => { } }),
        registerCachedFormatter: () => ({ dispose: () => { } }),
        _serviceBrand: undefined,
        getHostTooltip: () => '',
    });
    registration.define(IMenuService, TestMenuService);
    registration.define(IActionViewItemService, NullActionViewItemService);
}
// ============================================================================
// Text Models
// ============================================================================
/**
 * Creates a text model using the ModelService.
 */
export function createTextModel(instantiationService, text, uri, languageId) {
    const modelService = instantiationService.get(IModelService);
    const languageService = instantiationService.get(ILanguageService);
    const languageSelection = languageId ? languageService.createById(languageId) : null;
    return modelService.createModel(text, languageSelection, uri);
}
function resolveLabels(labels) {
    const result = [];
    if (labels?.kind === 'screenshot') {
        result.push('.screenshot');
    }
    else if (labels?.kind === 'animated') {
        result.push('animated');
    }
    if (labels?.blocksCi) {
        result.push('blocks-ci');
    }
    if (labels?.flaky) {
        result.push('flaky');
    }
    return result;
}
/**
 * Creates Dark and Light fixture variants from a single render function.
 * The render function receives a context with container and disposableStore.
 *
 * Note: If render returns a Promise, the async work will run in background.
 * Component-explorer waits 2 animation frames after sync render returns,
 * which should be sufficient for most async setup, but timing is not guaranteed.
 */
export function defineComponentFixture(options) {
    const createFixture = (theme) => defineFixture({
        isolation: 'none',
        displayMode: { type: 'component' },
        background: theme === darkTheme ? 'dark' : 'light',
        render: (container) => {
            const disposableStore = new DisposableStore();
            setupTheme(container, theme);
            // Start render (may be async) - component-explorer will wait 2 rAF after this returns
            const result = options.render({ container, disposableStore, theme });
            return isThenable(result) ? result.then(() => disposableStore) : disposableStore;
        },
    });
    const labels = resolveLabels(options.labels);
    return defineFixtureVariants(labels.length > 0 ? { labels } : {}, {
        Dark: createFixture(darkTheme),
        Light: createFixture(lightTheme),
    });
}
export function defineThemedFixtureGroup(optionsOrFixtures, fixtures) {
    if (fixtures) {
        const options = optionsOrFixtures;
        return defineFixtureGroup({
            labels: resolveLabels(options.labels),
            path: options.path,
        }, fixtures);
    }
    return defineFixtureGroup(optionsOrFixtures);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZml4dHVyZVV0aWxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9maXh0dXJlVXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsMEZBQTBGO0FBQzFGLHNEQUFzRDtBQUN0RCxPQUFPLEVBQUUsYUFBYSxFQUFFLGtCQUFrQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDdEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVyRixzREFBc0Q7QUFDdEQsT0FBTyx3Q0FBd0MsQ0FBQztBQUNoRCxPQUFPLGtDQUFrQyxDQUFDO0FBRTFDLFFBQVE7QUFDUixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDM0YsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3pFLE9BQU8sRUFBZSxhQUFhLEVBQW9CLFVBQVUsSUFBSSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xKLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsK0JBQStCLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUU3SSxnQkFBZ0I7QUFDaEIsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBRTFGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdFQUFn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