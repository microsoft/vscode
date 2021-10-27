/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, IActiveCodeEditor, IEditorConstructionOptions } from 'vs/editor/browser/editorBrowser';
import { IEditorContributionCtor } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { View } from 'vs/editor/browser/view/viewImpl';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import * as editorOptions from 'vs/editor/common/config/editorOptions';
import { IConfiguration, IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextBufferFactory, ITextModel } from 'vs/editor/common/model';
import { ILanguageConfigurationService } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/textResourceConfigurationService';
import { ViewModel } from 'vs/editor/common/viewModel/viewModelImpl';
import { TestCodeEditorService, TestCommandService } from 'vs/editor/test/browser/editorTestServices';
import { createTextModel2 } from 'vs/editor/test/common/editorTestUtils';
import { TestConfiguration } from 'vs/editor/test/common/mocks/testConfiguration';
import { TestLanguageConfigurationService } from 'vs/editor/test/common/modes/testLanguageConfigurationService';
import { TestTextResourcePropertiesService } from 'vs/editor/test/common/services/testTextResourcePropertiesService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IContextKeyService, IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { TestDialogService } from 'vs/platform/dialogs/test/common/testDialogService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { BrandedService, IInstantiationService, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryServiceShape } from 'vs/platform/telemetry/common/telemetryUtils';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { UndoRedoService } from 'vs/platform/undoRedo/common/undoRedoService';

export interface ITestCodeEditor extends IActiveCodeEditor {
	getViewModel(): ViewModel | undefined;
	registerAndInstantiateContribution<T extends IEditorContribution, Services extends BrandedService[]>(id: string, ctor: new (editor: ICodeEditor, ...services: Services) => T): T;
	registerDisposable(disposable: IDisposable): void;
}

export class TestCodeEditor extends CodeEditorWidget implements ICodeEditor {

	//#region testing overrides
	protected override _createConfiguration(options: Readonly<IEditorConstructionOptions>): IConfiguration {
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
	public registerAndInstantiateContribution<T extends IEditorContribution, Services extends BrandedService[]>(id: string, ctor: new (editor: ICodeEditor, ...services: Services) => T): T {
		const r: T = this._instantiationService.createInstance(ctor as IEditorContributionCtor, this);
		this._contributions[id] = r;
		return r;
	}
	public registerDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

class TestCodeEditorWithAutoModelDisposal extends TestCodeEditor {
	public override dispose() {
		super.dispose();
		if (this._modelData) {
			this._modelData.model.dispose();
		}
	}
}

class TestEditorDomElement {
	parentElement: IContextKeyServiceTarget | null = null;
	setAttribute(attr: string, value: string): void { }
	removeAttribute(attr: string): void { }
	hasAttribute(attr: string): boolean { return false; }
	getAttribute(attr: string): string | undefined { return undefined; }
	addEventListener(event: string): void { }
	removeEventListener(event: string): void { }
}

export interface TestCodeEditorCreationOptions extends editorOptions.IEditorOptions {
	/**
	 * The initial model associated with this code editor.
	 */
	model?: ITextModel;
	serviceCollection?: ServiceCollection;
	/**
	 * If the editor has text focus.
	 * Defaults to true.
	 */
	hasTextFocus?: boolean;
}

export function withTestCodeEditor(text: string | string[] | ITextBufferFactory | null, options: TestCodeEditorCreationOptions, callback: (editor: ITestCodeEditor, viewModel: ViewModel) => void): void {
	const [instantiationService, disposables] = createTestCodeEditorServices(options.serviceCollection);
	delete options.serviceCollection;

	// create a model if necessary
	if (!options.model) {
		if (Array.isArray(text)) {
			options.model = disposables.add(createTextModel2(instantiationService, text.join('\n')));
		} else if (text !== null) {
			options.model = disposables.add(createTextModel2(instantiationService, text));
		}
	}

	const editor = disposables.add(doCreateTestCodeEditor(instantiationService, options));
	const viewModel = editor.getViewModel()!;
	viewModel.setHasFocus(true);
	callback(<ITestCodeEditor>editor, editor.getViewModel()!);

	disposables.dispose();
}

export async function withAsyncTestCodeEditor(text: string | string[] | ITextBufferFactory | null, options: TestCodeEditorCreationOptions, callback: (editor: ITestCodeEditor, viewModel: ViewModel, instantiationService: IInstantiationService) => Promise<void>): Promise<void> {
	const [instantiationService, disposables] = createTestCodeEditorServices(options.serviceCollection);
	delete options.serviceCollection;

	// create a model if necessary
	if (!options.model) {
		if (Array.isArray(text)) {
			options.model = disposables.add(createTextModel2(instantiationService, text.join('\n')));
		} else if (text !== null) {
			options.model = disposables.add(createTextModel2(instantiationService, text));
		}
	}

	const editor = disposables.add(doCreateTestCodeEditor(instantiationService, options));
	const viewModel = editor.getViewModel()!;
	viewModel.setHasFocus(true);
	await callback(<ITestCodeEditor>editor, editor.getViewModel()!, instantiationService);

	disposables.dispose();
}

export function createTestCodeEditor(options: TestCodeEditorCreationOptions): ITestCodeEditor {
	const [instantiationService, disposables] = createTestCodeEditorServices(options.serviceCollection);
	delete options.serviceCollection;

	const editor = doCreateTestCodeEditor(instantiationService, options);
	editor.registerDisposable(disposables);
	return editor;
}

export function createTestCodeEditorServices(services: ServiceCollection = new ServiceCollection()): [IInstantiationService, DisposableStore] {
	const serviceIdentifiers: ServiceIdentifier<any>[] = [];
	const define = <T>(id: ServiceIdentifier<T>, ctor: new (...args: any[]) => T) => {
		if (!services.has(id)) {
			services.set(id, new SyncDescriptor(ctor));
		}
		serviceIdentifiers.push(id);
	};

	define(INotificationService, TestNotificationService);
	define(IDialogService, TestDialogService);
	define(IUndoRedoService, UndoRedoService);
	define(IModeService, ModeServiceImpl);
	define(ILanguageConfigurationService, TestLanguageConfigurationService);
	define(IConfigurationService, TestConfigurationService);
	define(ITextResourcePropertiesService, TestTextResourcePropertiesService);
	define(IThemeService, TestThemeService);
	define(ILogService, NullLogService);
	define(IModelService, ModelServiceImpl);
	define(ICodeEditorService, TestCodeEditorService);
	define(IContextKeyService, MockContextKeyService);
	define(ICommandService, TestCommandService);
	define(ITelemetryService, NullTelemetryServiceShape);

	const instantiationService: IInstantiationService = new InstantiationService(services);
	const disposables = new DisposableStore();
	disposables.add(toDisposable(() => {
		for (const id of serviceIdentifiers) {
			const instanceOrDescriptor = services.get(id);
			if (typeof instanceOrDescriptor.dispose === 'function') {
				instanceOrDescriptor.dispose();
			}
		}
	}));
	return [instantiationService, disposables];
}

function doCreateTestCodeEditor(instantiationService: IInstantiationService, options: TestCodeEditorCreationOptions): ITestCodeEditor {
	const model = options.model;
	delete options.model;

	const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
		contributions: []
	};
	const editor = instantiationService.createInstance(
		TestCodeEditorWithAutoModelDisposal,
		<HTMLElement><any>new TestEditorDomElement(),
		options,
		codeEditorWidgetOptions
	);
	if (typeof options.hasTextFocus === 'undefined') {
		options.hasTextFocus = true;
	}
	editor.setHasTextFocus(options.hasTextFocus);
	editor.setModel(model);
	return <ITestCodeEditor>editor;
}

export interface TestCodeEditorCreationOptions2 extends editorOptions.IEditorOptions {
	/**
	 * If the editor has text focus.
	 * Defaults to true.
	 */
	hasTextFocus?: boolean;
}

export function createTestCodeEditor2(instantiationService: IInstantiationService, model: ITextModel, options: TestCodeEditorCreationOptions2): TestCodeEditor {
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
	editor.getViewModel()!.setHasFocus(true);
	return editor;
}
