/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineFixture, defineFixtureGroup, defineFixtureVariants } from '@vscode/component-explorer';
import { DisposableStore, toDisposable } from '../../../src/vs/base/common/lifecycle';
import { URI } from '../../../src/vs/base/common/uri';
import '../style.css';

// Theme
import { COLOR_THEME_DARK_INITIAL_COLORS, COLOR_THEME_LIGHT_INITIAL_COLORS } from '../../../src/vs/workbench/services/themes/common/workbenchThemeService';
import { ColorThemeData } from '../../../src/vs/workbench/services/themes/common/colorThemeData';
import { ColorScheme } from '../../../src/vs/platform/theme/common/theme';
import { generateColorThemeCSS } from '../../../src/vs/workbench/services/themes/browser/colorThemeCss';
import { Registry } from '../../../src/vs/platform/registry/common/platform';
import { Extensions as ThemingExtensions, IThemingRegistry } from '../../../src/vs/platform/theme/common/themeService';
import { IEnvironmentService } from '../../../src/vs/platform/environment/common/environment';
import { getIconsStyleSheet } from '../../../src/vs/platform/theme/browser/iconsStyleSheet';

// Instantiation
import { ServiceCollection } from '../../../src/vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from '../../../src/vs/platform/instantiation/common/descriptors';
import { ServiceIdentifier } from '../../../src/vs/platform/instantiation/common/instantiation';
import { TestInstantiationService } from '../../../src/vs/platform/instantiation/test/common/instantiationServiceMock';

// Test service implementations
import { TestAccessibilityService } from '../../../src/vs/platform/accessibility/test/common/testAccessibilityService';
import { MockKeybindingService, MockContextKeyService } from '../../../src/vs/platform/keybinding/test/common/mockKeybindingService';
import { TestClipboardService } from '../../../src/vs/platform/clipboard/test/common/testClipboardService';
import { TestEditorWorkerService } from '../../../src/vs/editor/test/common/services/testEditorWorkerService';
import { NullOpenerService } from '../../../src/vs/platform/opener/test/common/nullOpenerService';
import { TestNotificationService } from '../../../src/vs/platform/notification/test/common/testNotificationService';
import { TestDialogService } from '../../../src/vs/platform/dialogs/test/common/testDialogService';
import { TestConfigurationService } from '../../../src/vs/platform/configuration/test/common/testConfigurationService';
import { TestTextResourcePropertiesService } from '../../../src/vs/editor/test/common/services/testTextResourcePropertiesService';
import { TestThemeService } from '../../../src/vs/platform/theme/test/common/testThemeService';
import { TestLanguageConfigurationService } from '../../../src/vs/editor/test/common/modes/testLanguageConfigurationService';
import { TestCodeEditorService, TestCommandService } from '../../../src/vs/editor/test/browser/editorTestServices';
import { TestTreeSitterLibraryService } from '../../../src/vs/editor/test/common/services/testTreeSitterLibraryService';
import { TestMenuService } from '../../../src/vs/workbench/test/browser/workbenchTestServices';

// Service interfaces
import { IAccessibilityService } from '../../../src/vs/platform/accessibility/common/accessibility';
import { IKeybindingService } from '../../../src/vs/platform/keybinding/common/keybinding';
import { IClipboardService } from '../../../src/vs/platform/clipboard/common/clipboardService';
import { IEditorWorkerService } from '../../../src/vs/editor/common/services/editorWorker';
import { IOpenerService } from '../../../src/vs/platform/opener/common/opener';
import { INotificationService } from '../../../src/vs/platform/notification/common/notification';
import { IDialogService } from '../../../src/vs/platform/dialogs/common/dialogs';
import { IUndoRedoService } from '../../../src/vs/platform/undoRedo/common/undoRedo';
import { UndoRedoService } from '../../../src/vs/platform/undoRedo/common/undoRedoService';
import { ILanguageService } from '../../../src/vs/editor/common/languages/language';
import { LanguageService } from '../../../src/vs/editor/common/services/languageService';
import { ILanguageConfigurationService } from '../../../src/vs/editor/common/languages/languageConfigurationRegistry';
import { IConfigurationService } from '../../../src/vs/platform/configuration/common/configuration';
import { ITextResourcePropertiesService } from '../../../src/vs/editor/common/services/textResourceConfiguration';
import { IColorTheme, IThemeService } from '../../../src/vs/platform/theme/common/themeService';
import { ILogService, NullLogService, ILoggerService, NullLoggerService } from '../../../src/vs/platform/log/common/log';
import { IModelService } from '../../../src/vs/editor/common/services/model';
import { ModelService } from '../../../src/vs/editor/common/services/modelService';
import { ICodeEditorService } from '../../../src/vs/editor/browser/services/codeEditorService';
import { IContextKeyService } from '../../../src/vs/platform/contextkey/common/contextkey';
import { ICommandService } from '../../../src/vs/platform/commands/common/commands';
import { ITelemetryService } from '../../../src/vs/platform/telemetry/common/telemetry';
import { NullTelemetryServiceShape } from '../../../src/vs/platform/telemetry/common/telemetryUtils';
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from '../../../src/vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from '../../../src/vs/editor/common/services/languageFeatures';
import { LanguageFeaturesService } from '../../../src/vs/editor/common/services/languageFeaturesService';
import { ITreeSitterLibraryService } from '../../../src/vs/editor/common/services/treeSitter/treeSitterLibraryService';
import { IInlineCompletionsService, InlineCompletionsService } from '../../../src/vs/editor/browser/services/inlineCompletionsService';
import { ICodeLensCache } from '../../../src/vs/editor/contrib/codelens/browser/codeLensCache';
import { IHoverService } from '../../../src/vs/platform/hover/browser/hover';
import { IDataChannelService, NullDataChannelService } from '../../../src/vs/platform/dataChannel/common/dataChannel';
import { IContextMenuService, IContextViewService } from '../../../src/vs/platform/contextview/browser/contextView';
import { ILabelService } from '../../../src/vs/platform/label/common/label';
import { IMenuService } from '../../../src/vs/platform/actions/common/actions';
import { IActionViewItemService, NullActionViewItemService } from '../../../src/vs/platform/actions/browser/actionViewItemService';
import { IDefaultAccountService } from '../../../src/vs/platform/defaultAccount/common/defaultAccount';
import { IStorageService, IStorageValueChangeEvent, IWillSaveStateEvent, StorageScope, StorageTarget, IStorageTargetChangeEvent, IStorageEntry, WillSaveStateReason, IWorkspaceStorageValueChangeEvent, IProfileStorageValueChangeEvent, IApplicationStorageValueChangeEvent } from '../../../src/vs/platform/storage/common/storage';
import { Emitter, Event } from '../../../src/vs/base/common/event';
import { mock } from '../../../src/vs/base/test/common/mock';
import { IAnyWorkspaceIdentifier } from '../../../src/vs/platform/workspace/common/workspace';
import { IUserDataProfile } from '../../../src/vs/platform/userDataProfile/common/userDataProfile';
import { IUserInteractionService, MockUserInteractionService } from '../../../src/vs/platform/userInteraction/browser/userInteractionService';

// Editor
import { ITextModel } from '../../../src/vs/editor/common/model';



// Import color registrations to ensure colors are available
import '../../../src/vs/platform/theme/common/colors/baseColors';
import '../../../src/vs/platform/theme/common/colors/editorColors';
import '../../../src/vs/platform/theme/common/colors/listColors';
import '../../../src/vs/platform/theme/common/colors/miscColors';
import '../../../src/vs/workbench/common/theme';

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
	} as ICodeLensCache);
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
	} as IHoverService);
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
	} as IDefaultAccountService);

	// User interaction service with focus simulation enabled (all elements appear focused in fixtures)
	defineInstance(IUserInteractionService, new MockUserInteractionService(true, false));

	// Allow additional services to be registered
	options?.additionalServices?.({ define, defineInstance });

	const instantiationService = disposables.add(new TestInstantiationService(services, true));

	disposables.add(toDisposable(() => {
		for (const id of serviceIdentifiers) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const instanceOrDescriptor = services.get(id) as any;
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
	} as unknown as IContextMenuService);

	registration.defineInstance(IContextViewService, {
		showContextView: () => ({ dispose: () => { } }),
		hideContextView: () => { },
		getContextViewElement: () => null,
		layout: () => { },
	} as unknown as IContextViewService);

	registration.defineInstance(ILabelService, {
		getUriLabel: (uri: URI) => uri.path,
		getUriBasenameLabel: (uri: URI) => uri.path.split('/').pop() ?? '',
		getWorkspaceLabel: () => '',
		getHostLabel: () => '',
		getSeparator: () => '/',
		registerFormatter: () => ({ dispose: () => { } }),
		onDidChangeFormatters: () => ({ dispose: () => { } }),
		registerCachedFormatter: () => ({ dispose: () => { } }),
	} as unknown as ILabelService);

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
		render: async (container: HTMLElement) => {
			const disposableStore = new DisposableStore();
			setupTheme(container, theme);
			return options.render({ container, disposableStore, theme });
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
