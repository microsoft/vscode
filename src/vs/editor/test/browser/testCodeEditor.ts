/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle';
import { mock } from '../../../base/test/common/mock';
import { EditorConfiguration } from '../../browser/config/editorConfiguration';
import { IActiveCodeEditor, ICodeEditor } from '../../browser/editorBrowser';
import { ICodeEditorService } from '../../browser/services/codeEditorService';
import { View } from '../../browser/view';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../browser/widget/codeEditor/codeEditorWidget';
import * as editorOptions from '../../common/config/editorOptions';
import { IEditorContribution } from '../../common/editorCommon';
import { ILanguageService } from '../../common/languages/language';
import { ILanguageConfigurationService } from '../../common/languages/languageConfigurationRegistry';
import { ITextBufferFactory, ITextModel } from '../../common/model';
import { IEditorWorkerService } from '../../common/services/editorWorker';
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from '../../common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from '../../common/services/languageFeatures';
import { LanguageFeaturesService } from '../../common/services/languageFeaturesService';
import { LanguageService } from '../../common/services/languageService';
import { IModelService } from '../../common/services/model';
import { ModelService } from '../../common/services/modelService';
import { ITextResourcePropertiesService } from '../../common/services/textResourceConfiguration';
import { ITreeSitterParserService } from '../../common/services/treeSitterParserService';
import { ViewModel } from '../../common/viewModel/viewModelImpl';
import { TestConfiguration } from './config/testConfiguration';
import { TestCodeEditorService, TestCommandService } from './editorTestServices';
import { TestTreeSitterParserService } from '../common/services/testTreeSitterService';
import { TestLanguageConfigurationService } from '../common/modes/testLanguageConfigurationService';
import { TestEditorWorkerService } from '../common/services/testEditorWorkerService';
import { TestTextResourcePropertiesService } from '../common/services/testTextResourcePropertiesService';
import { instantiateTextModel } from '../common/testTextModel';
import { AccessibilitySupport, IAccessibilityService } from '../../../platform/accessibility/common/accessibility';
import { TestAccessibilityService } from '../../../platform/accessibility/test/common/testAccessibilityService';
import { MenuId } from '../../../platform/actions/common/actions';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService';
import { TestClipboardService } from '../../../platform/clipboard/test/common/testClipboardService';
import { ICommandService } from '../../../platform/commands/common/commands';
import { IConfigurationService } from '../../../platform/configuration/common/configuration';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService';
import { IContextKeyService, IContextKeyServiceTarget } from '../../../platform/contextkey/common/contextkey';
import { IDialogService } from '../../../platform/dialogs/common/dialogs';
import { TestDialogService } from '../../../platform/dialogs/test/common/testDialogService';
import { IEnvironmentService } from '../../../platform/environment/common/environment';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors';
import { BrandedService, IInstantiationService, ServiceIdentifier } from '../../../platform/instantiation/common/instantiation';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding';
import { MockContextKeyService, MockKeybindingService } from '../../../platform/keybinding/test/common/mockKeybindingService';
import { ILogService, NullLogService } from '../../../platform/log/common/log';
import { INotificationService } from '../../../platform/notification/common/notification';
import { TestNotificationService } from '../../../platform/notification/test/common/testNotificationService';
import { IOpenerService } from '../../../platform/opener/common/opener';
import { NullOpenerService } from '../../../platform/opener/test/common/nullOpenerService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { NullTelemetryServiceShape } from '../../../platform/telemetry/common/telemetryUtils';
import { IThemeService } from '../../../platform/theme/common/themeService';
import { TestThemeService } from '../../../platform/theme/test/common/testThemeService';
import { IUndoRedoService } from '../../../platform/undoRedo/common/undoRedo';
import { UndoRedoService } from '../../../platform/undoRedo/common/undoRedoService';

export interface ITestCodeEditor extends IActiveCodeEditor {
	getViewModel(): ViewModel | undefined;
	registerAndInstantiateContribution<T extends IEditorContribution, Services extends BrandedService[]>(id: string, ctor: new (editor: ICodeEditor, ...services: Services) => T): T;
	registerDisposable(disposable: IDisposable): void;
}

export class TestCodeEditor extends CodeEditorWidget implements ICodeEditor {

	//#region testing overrides
	protected override _createConfiguration(isSimpleWidget: boolean, contextMenuId: MenuId, options: Readonly<TestCodeEditorCreationOptions>): EditorConfiguration {
		return new TestConfiguration(options);
	}
	protected override _createView(viewModel: ViewModel): [View, boolean] {
		// Never create a view
		return [null! as View, false];
	}
	private _hasTextFocus = false;
	public setHasTextFocus(hasTextFocus: boolean): void {
		this._hasTextFocus = hasTextFocus;
	}
	public override hasTextFocus(): boolean {
		return this._hasTextFocus;
	}
	//#endregion

	//#region Testing utils
	public getViewModel(): ViewModel | undefined {
		return this._modelData ? this._modelData.viewModel : undefined;
	}
	public registerAndInstantiateContribution<T extends IEditorContribution>(id: string, ctor: new (editor: ICodeEditor, ...services: BrandedService[]) => T): T {
		const r: T = this._instantiationService.createInstance(ctor, this);
		this._contributions.set(id, r);
		return r;
	}
	public registerDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

class TestEditorDomElement {
	parentElement: IContextKeyServiceTarget | null = null;
	ownerDocument = document;
	document = document;
	setAttribute(attr: string, value: string): void { }
	removeAttribute(attr: string): void { }
	hasAttribute(attr: string): boolean { return false; }
	getAttribute(attr: string): string | undefined { return undefined; }
	addEventListener(event: string): void { }
	removeEventListener(event: string): void { }
}

export interface TestCodeEditorCreationOptions extends editorOptions.IEditorOptions {
	/**
	 * If the editor has text focus.
	 * Defaults to true.
	 */
	hasTextFocus?: boolean;
	/**
	 * Env configuration
	 */
	envConfig?: ITestEnvConfiguration;
}

export interface TestCodeEditorInstantiationOptions extends TestCodeEditorCreationOptions {
	/**
	 * Services to use.
	 */
	serviceCollection?: ServiceCollection;
}

export interface ITestEnvConfiguration {
	extraEditorClassName?: string;
	outerWidth?: number;
	outerHeight?: number;
	emptySelectionClipboard?: boolean;
	pixelRatio?: number;
	accessibilitySupport?: AccessibilitySupport;
}

export function withTestCodeEditor(text: ITextModel | string | string[] | ITextBufferFactory, options: TestCodeEditorInstantiationOptions, callback: (editor: ITestCodeEditor, viewModel: ViewModel, instantiationService: TestInstantiationService) => void): void {
	return _withTestCodeEditor(text, options, callback);
}

export async function withAsyncTestCodeEditor(text: ITextModel | string | string[] | ITextBufferFactory, options: TestCodeEditorInstantiationOptions, callback: (editor: ITestCodeEditor, viewModel: ViewModel, instantiationService: TestInstantiationService) => Promise<void>): Promise<void> {
	return _withTestCodeEditor(text, options, callback);
}

function isTextModel(arg: ITextModel | string | string[] | ITextBufferFactory): arg is ITextModel {
	return Boolean(arg && (arg as ITextModel).uri);
}

function _withTestCodeEditor(arg: ITextModel | string | string[] | ITextBufferFactory, options: TestCodeEditorInstantiationOptions, callback: (editor: ITestCodeEditor, viewModel: ViewModel, instantiationService: TestInstantiationService) => void): void;
function _withTestCodeEditor(arg: ITextModel | string | string[] | ITextBufferFactory, options: TestCodeEditorInstantiationOptions, callback: (editor: ITestCodeEditor, viewModel: ViewModel, instantiationService: TestInstantiationService) => Promise<void>): Promise<void>;
function _withTestCodeEditor(arg: ITextModel | string | string[] | ITextBufferFactory, options: TestCodeEditorInstantiationOptions, callback: (editor: ITestCodeEditor, viewModel: ViewModel, instantiationService: TestInstantiationService) => Promise<void> | void): Promise<void> | void {
	const disposables = new DisposableStore();
	const instantiationService = createCodeEditorServices(disposables, options.serviceCollection);
	delete options.serviceCollection;

	// create a model if necessary
	let model: ITextModel;
	if (isTextModel(arg)) {
		model = arg;
	} else {
		model = disposables.add(instantiateTextModel(instantiationService, Array.isArray(arg) ? arg.join('\n') : arg));
	}

	const editor = disposables.add(instantiateTestCodeEditor(instantiationService, model, options));
	const viewModel = editor.getViewModel()!;
	viewModel.setHasFocus(true);
	const result = callback(<ITestCodeEditor>editor, editor.getViewModel()!, instantiationService);
	if (result) {
		return result.then(() => disposables.dispose());
	}

	disposables.dispose();
}

export function createCodeEditorServices(disposables: DisposableStore, services: ServiceCollection = new ServiceCollection()): TestInstantiationService {
	const serviceIdentifiers: ServiceIdentifier<any>[] = [];
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
	define(IThemeService, TestThemeService);
	define(ILogService, NullLogService);
	define(IModelService, ModelService);
	define(ICodeEditorService, TestCodeEditorService);
	define(IContextKeyService, MockContextKeyService);
	define(ICommandService, TestCommandService);
	define(ITelemetryService, NullTelemetryServiceShape);
	define(IEnvironmentService, class extends mock<IEnvironmentService>() {
		declare readonly _serviceBrand: undefined;
		override isBuilt: boolean = true;
		override isExtensionDevelopment: boolean = false;
	});
	define(ILanguageFeatureDebounceService, LanguageFeatureDebounceService);
	define(ILanguageFeaturesService, LanguageFeaturesService);
	define(ITreeSitterParserService, TestTreeSitterParserService);

	const instantiationService = disposables.add(new TestInstantiationService(services, true));
	disposables.add(toDisposable(() => {
		for (const id of serviceIdentifiers) {
			const instanceOrDescriptor = services.get(id);
			if (typeof instanceOrDescriptor.dispose === 'function') {
				instanceOrDescriptor.dispose();
			}
		}
	}));
	return instantiationService;
}

export function createTestCodeEditor(model: ITextModel | undefined, options: TestCodeEditorInstantiationOptions = {}): ITestCodeEditor {
	const disposables = new DisposableStore();
	const instantiationService = createCodeEditorServices(disposables, options.serviceCollection);
	delete options.serviceCollection;

	const editor = instantiateTestCodeEditor(instantiationService, model || null, options);
	editor.registerDisposable(disposables);
	return editor;
}

export function instantiateTestCodeEditor(instantiationService: IInstantiationService, model: ITextModel | null, options: TestCodeEditorCreationOptions = {}): ITestCodeEditor {
	const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
		contributions: []
	};
	const editor = instantiationService.createInstance(
		TestCodeEditor,
		<HTMLElement><any>new TestEditorDomElement(),
		options,
		codeEditorWidgetOptions
	);
	if (typeof options.hasTextFocus === 'undefined') {
		options.hasTextFocus = true;
	}
	editor.setHasTextFocus(options.hasTextFocus);
	editor.setModel(model);
	const viewModel = editor.getViewModel();
	viewModel?.setHasFocus(options.hasTextFocus);
	return <ITestCodeEditor>editor;
}
