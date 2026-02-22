/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This should be the only place that is allowed to import from @vscode/component-explorer
// eslint-disable-next-line local/code-import-patterns
import { defineFixture, defineFixtureGroup, defineFixtureVariants } from '@vscode/component-explorer';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
// eslint-disable-next-line local/code-import-patterns
import '../../../../../../build/vite/style.css';

// Theme
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { getIconsStyleSheet } from '../../../../platform/theme/browser/iconsStyleSheet.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IColorTheme, IThemeService, IThemingRegistry, Extensions as ThemingExtensions } from '../../../../platform/theme/common/themeService.js';
import { generateColorThemeCSS } from '../../../services/themes/browser/colorThemeCss.js';
import { ColorThemeData } from '../../../services/themes/common/colorThemeData.js';
import { COLOR_THEME_DARK_INITIAL_COLORS, COLOR_THEME_LIGHT_INITIAL_COLORS } from '../../../services/themes/common/workbenchThemeService.js';

// Instantiation
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ServiceIdentifier } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';

// Test service implementations
import { TestCodeEditorService, TestCommandService } from '../../../../editor/test/browser/editorTestServices.js';
import { TestLanguageConfigurationService } from '../../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { TestEditorWorkerService } from '../../../../editor/test/common/services/testEditorWorkerService.js';
import { TestTextResourcePropertiesService } from '../../../../editor/test/common/services/testTextResourcePropertiesService.js';
import { TestTreeSitterLibraryService } from '../../../../editor/test/common/services/testTreeSitterLibraryService.js';
import { TestAccessibilityService } from '../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { TestClipboardService } from '../../../../platform/clipboard/test/common/testClipboardService.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../platform/dialogs/test/common/testDialogService.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { NullOpenerService } from '../../../../platform/opener/test/common/nullOpenerService.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
import { TestMenuService } from '../workbenchTestServices.js';
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
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IDataChannelService, NullDataChannelService } from '../../../../platform/dataChannel/common/dataChannel.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILoggerService, ILogService, NullLoggerService, NullLogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IApplicationStorageValueChangeEvent, IProfileStorageValueChangeEvent, IStorageEntry, IStorageService, IStorageTargetChangeEvent, IStorageValueChangeEvent, IWillSaveStateEvent, IWorkspaceStorageValueChangeEvent, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { UndoRedoService } from '../../../../platform/undoRedo/common/undoRedoService.js';
import { IUserDataProfile } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../platform/userInteraction/browser/userInteractionService.js';
import { IAnyWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';

// Editor
import { ITextModel } from '../../../../editor/common/model.js';



// Import color registrations to ensure colors are available
import '../../../../platform/theme/common/colors/baseColors.js';
import '../../../../platform/theme/common/colors/editorColors.js';
import '../../../../platform/theme/common/colors/listColors.js';
import '../../../../platform/theme/common/colors/miscColors.js';
import '../../../common/theme.js';

/**
 * A storage service that never stores anything and always returns the default/fallback value.
 * This is useful for fixtures where we want consistent behavior without persisted state.
 */
class NullStorageService implements IStorageService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeValue = new Emitter<IStorageValueChangeEvent>();
	onDidChangeValue(scope: StorageScope.WORKSPACE, key: string | undefined, disposable: DisposableStore): Event<IWorkspaceStorageValueChangeEvent>;
	onDidChangeValue(scope: StorageScope.PROFILE, key: string | undefined, disposable: DisposableStore): Event<IProfileStorageValueChangeEvent>;
	onDidChangeValue(scope: StorageScope.APPLICATION, key: string | undefined, disposable: DisposableStore): Event<IApplicationStorageValueChangeEvent>;
	onDidChangeValue(scope: StorageScope, key: string | undefined, disposable: DisposableStore): Event<IStorageValueChangeEvent> {
		return Event.filter(this._onDidChangeValue.event, e => e.scope === scope && (key === undefined || e.key === key), disposable);
	}

	private readonly _onDidChangeTarget = new Emitter<IStorageTargetChangeEvent>();
	readonly onDidChangeTarget: Event<IStorageTargetChangeEvent> = this._onDidChangeTarget.event;

	private readonly _onWillSaveState = new Emitter<IWillSaveStateEvent>();
	readonly onWillSaveState: Event<IWillSaveStateEvent> = this._onWillSaveState.event;

	get(key: string, scope: StorageScope, fallbackValue: string): string;
	get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined;
	get(_key: string, _scope: StorageScope, fallbackValue?: string): string | undefined {
		return fallbackValue;
	}

	getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined;
	getBoolean(_key: string, _scope: StorageScope, fallbackValue?: boolean): boolean | undefined {
		return fallbackValue;
	}

	getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
	getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined;
	getNumber(_key: string, _scope: StorageScope, fallbackValue?: number): number | undefined {
		return fallbackValue;
	}

	getObject<T extends object>(key: string, scope: StorageScope, fallbackValue: T): T;
	getObject<T extends object>(key: string, scope: StorageScope, fallbackValue?: T): T | undefined;
	getObject<T extends object>(_key: string, _scope: StorageScope, fallbackValue?: T): T | undefined {
		return fallbackValue;
	}

	store(_key: string, _value: string | boolean | number | undefined | null, _scope: StorageScope, _target: StorageTarget): void {
		// no-op
	}

	storeAll(_entries: IStorageEntry[], _external: boolean): void {
		// no-op
	}

	remove(_key: string, _scope: StorageScope): void {
		// no-op
	}

	isNew(_scope: StorageScope): boolean {
		return true;
	}

	flush(_reason?: WillSaveStateReason): Promise<void> {
		return Promise.resolve();
	}

	optimize(_scope: StorageScope): Promise<void> {
		return Promise.resolve();
	}

	log(): void {
		// no-op
	}

	keys(_scope: StorageScope, _target: StorageTarget): string[] {
		return [];
	}

	switch(): Promise<void> {
		return Promise.resolve();
	}

	hasScope(_scope: IAnyWorkspaceIdentifier | IUserDataProfile): boolean {
		return false;
	}
}


// ============================================================================
// Themes
// ============================================================================

const themingRegistry = Registry.as<IThemingRegistry>(ThemingExtensions.ThemingContribution);
const mockEnvironmentService: IEnvironmentService = Object.create(null);

export const darkTheme = ColorThemeData.createUnloadedThemeForThemeType(
	ColorScheme.DARK,
	COLOR_THEME_DARK_INITIAL_COLORS
);

export const lightTheme = ColorThemeData.createUnloadedThemeForThemeType(
	ColorScheme.LIGHT,
	COLOR_THEME_LIGHT_INITIAL_COLORS
);

let globalStyleSheet: CSSStyleSheet | undefined;
let iconsStyleSheetCache: CSSStyleSheet | undefined;
let darkThemeStyleSheet: CSSStyleSheet | undefined;
let lightThemeStyleSheet: CSSStyleSheet | undefined;

function getGlobalStyleSheet(): CSSStyleSheet {
	if (!globalStyleSheet) {
		globalStyleSheet = new CSSStyleSheet();
		const globalRules: string[] = [];
		for (const sheet of Array.from(document.styleSheets)) {
			try {
				for (const rule of Array.from(sheet.cssRules)) {
					globalRules.push(rule.cssText);
				}
			} catch {
				// Cross-origin stylesheets can't be read
			}
		}
		globalStyleSheet.replaceSync(globalRules.join('\n'));
	}
	return globalStyleSheet;
}

function getIconsStyleSheetCached(): CSSStyleSheet {
	if (!iconsStyleSheetCache) {
		iconsStyleSheetCache = new CSSStyleSheet();
		const iconsSheet = getIconsStyleSheet(undefined);
		iconsStyleSheetCache.replaceSync(iconsSheet.getCSS() as string);
		iconsSheet.dispose();
	}
	return iconsStyleSheetCache;
}

function getThemeStyleSheet(theme: ColorThemeData): CSSStyleSheet {
	const isDark = theme.type === ColorScheme.DARK;
	if (isDark && darkThemeStyleSheet) {
		return darkThemeStyleSheet;
	}
	if (!isDark && lightThemeStyleSheet) {
		return lightThemeStyleSheet;
	}

	const sheet = new CSSStyleSheet();
	const css = generateColorThemeCSS(
		theme,
		':host',
		themingRegistry.getThemingParticipants(),
		mockEnvironmentService
	);
	sheet.replaceSync(css.code);

	if (isDark) {
		darkThemeStyleSheet = sheet;
	} else {
		lightThemeStyleSheet = sheet;
	}
	return sheet;
}

/**
 * Applies theme styling to a shadow DOM container.
 * Adds theme class names and adopts shared stylesheets.
 */
export function setupTheme(container: HTMLElement, theme: ColorThemeData): void {
	container.classList.add(...theme.classNames);

	const shadowRoot = container.getRootNode() as ShadowRoot;
	if (shadowRoot.adoptedStyleSheets !== undefined) {
		shadowRoot.adoptedStyleSheets = [
			getGlobalStyleSheet(),
			getIconsStyleSheetCached(),
			getThemeStyleSheet(theme),
		];
	}
}


// ============================================================================
// Services
// ============================================================================

export interface ServiceRegistration {
	define<T>(id: ServiceIdentifier<T>, ctor: new (...args: never[]) => T): void;
	defineInstance<T>(id: ServiceIdentifier<T>, instance: T): void;
}

export interface CreateServicesOptions {
	/**
	 * The color theme to use for the theme service.
	 */
	colorTheme?: IColorTheme;
	/**
	 * Additional services to register after the base editor services.
	 */
	additionalServices?: (registration: ServiceRegistration) => void;
}

/**
 * Creates a TestInstantiationService with all services needed for CodeEditorWidget.
 * Additional services can be registered via the options callback.
 */
export function createEditorServices(disposables: DisposableStore, options?: CreateServicesOptions): TestInstantiationService {
	const services = new ServiceCollection();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const serviceIdentifiers: ServiceIdentifier<any>[] = [];

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const define = <T>(id: ServiceIdentifier<T>, ctor: new (...args: any[]) => T) => {
		if (!services.has(id)) {
			services.set(id, new SyncDescriptor(ctor));
		}
		serviceIdentifiers.push(id);
	};

	const defineInstance = <T>(id: ServiceIdentifier<T>, instance: T) => {
		if (!services.has(id)) {
			services.set(id, instance);
		}
		serviceIdentifiers.push(id);
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
	} else {
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
	define(IEnvironmentService, class extends mock<IEnvironmentService>() {
		declare readonly _serviceBrand: undefined;
		override isBuilt: boolean = true;
		override isExtensionDevelopment: boolean = false;
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
		onDidChangeDefaultAccount: new Emitter<null>().event,
		onDidChangePolicyData: new Emitter<null>().event,
		policyData: null,
		getDefaultAccount: async () => null,
		getDefaultAccountAuthenticationProvider: () => ({ id: 'test', name: 'Test', scopes: [], enterprise: false }),
		setDefaultAccountProvider: () => { },
		refresh: async () => null,
		signIn: async () => null,
		signOut: async () => { },
	});

	// User interaction service with focus simulation enabled (all elements appear focused in fixtures)
	defineInstance(IUserInteractionService, new MockUserInteractionService(true, false));

	// Allow additional services to be registered
	options?.additionalServices?.({ define, defineInstance });

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
export function registerWorkbenchServices(registration: ServiceRegistration): void {
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
		getUriLabel: (uri: URI) => uri.path,
		getUriBasenameLabel: (uri: URI) => uri.path.split('/').pop() ?? '',
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
export function createTextModel(
	instantiationService: TestInstantiationService,
	text: string,
	uri: URI,
	languageId?: string
): ITextModel {
	const modelService = instantiationService.get(IModelService);
	const languageService = instantiationService.get(ILanguageService);
	const languageSelection = languageId ? languageService.createById(languageId) : null;
	return modelService.createModel(text, languageSelection, uri);
}


// ============================================================================
// Fixture Adapters
// ============================================================================

export interface ComponentFixtureContext {
	container: HTMLElement;
	disposableStore: DisposableStore;
	theme: ColorThemeData;
}

export interface ComponentFixtureOptions {
	render: (context: ComponentFixtureContext) => HTMLElement | Promise<HTMLElement>;
}

type ThemedFixtures = ReturnType<typeof defineFixtureVariants>;

/**
 * Creates Dark and Light fixture variants from a single render function.
 * The render function receives a context with container and disposableStore.
 */
export function defineComponentFixture(options: ComponentFixtureOptions): ThemedFixtures {
	const createFixture = (theme: typeof darkTheme | typeof lightTheme) => defineFixture({
		isolation: 'shadow-dom',
		displayMode: { type: 'component' },
		properties: [],
		background: theme === darkTheme ? 'dark' : 'light',
		render: (container: HTMLElement) => {
			const disposableStore = new DisposableStore();
			setupTheme(container, theme);
			options.render({ container, disposableStore, theme });
			return disposableStore;
		},
	});

	return defineFixtureVariants({
		Dark: createFixture(darkTheme),
		Light: createFixture(lightTheme),
	});
}

type ThemedFixtureGroupInput = Record<string, ThemedFixtures>;

/**
 * Creates a nested fixture group from themed fixtures.
 * E.g., { MergeEditor: { Dark: ..., Light: ... } } becomes a nested group: MergeEditor > Dark/Light
 */
export function defineThemedFixtureGroup(group: ThemedFixtureGroupInput): ReturnType<typeof defineFixtureGroup> {
	return defineFixtureGroup(group);
}
