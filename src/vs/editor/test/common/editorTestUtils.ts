/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { BracketPairColorizationOptions, DefaultEndOfLine, ITextBufferFactory, ITextModelCreationOptions } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { ILanguageConfigurationService } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/textResourceConfigurationService';
import { TestLanguageConfigurationService } from 'vs/editor/test/common/modes/testLanguageConfigurationService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { TestDialogService } from 'vs/platform/dialogs/test/common/testDialogService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { UndoRedoService } from 'vs/platform/undoRedo/common/undoRedoService';
import { TestTextResourcePropertiesService } from 'vs/editor/test/common/services/testTextResourcePropertiesService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';

class TestTextModel extends TextModel {
	public registerDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

export function withEditorModel(text: string[], callback: (model: TextModel) => void): void {
	let model = createTextModel(text.join('\n'));
	callback(model);
	model.dispose();
}

export interface IRelaxedTextModelCreationOptions {
	tabSize?: number;
	indentSize?: number;
	insertSpaces?: boolean;
	detectIndentation?: boolean;
	trimAutoWhitespace?: boolean;
	defaultEOL?: DefaultEndOfLine;
	isForSimpleWidget?: boolean;
	largeFileOptimizations?: boolean;
	bracketColorizationOptions?: BracketPairColorizationOptions;
}

function resolveOptions(_options: IRelaxedTextModelCreationOptions): ITextModelCreationOptions {
	return {
		tabSize: (typeof _options.tabSize === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.tabSize : _options.tabSize),
		indentSize: (typeof _options.indentSize === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.indentSize : _options.indentSize),
		insertSpaces: (typeof _options.insertSpaces === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.insertSpaces : _options.insertSpaces),
		detectIndentation: (typeof _options.detectIndentation === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.detectIndentation : _options.detectIndentation),
		trimAutoWhitespace: (typeof _options.trimAutoWhitespace === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.trimAutoWhitespace : _options.trimAutoWhitespace),
		defaultEOL: (typeof _options.defaultEOL === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.defaultEOL : _options.defaultEOL),
		isForSimpleWidget: (typeof _options.isForSimpleWidget === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.isForSimpleWidget : _options.isForSimpleWidget),
		largeFileOptimizations: (typeof _options.largeFileOptimizations === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.largeFileOptimizations : _options.largeFileOptimizations),
		bracketPairColorizationOptions: (typeof _options.bracketColorizationOptions === 'undefined' ? TextModel.DEFAULT_CREATION_OPTIONS.bracketPairColorizationOptions : _options.bracketColorizationOptions),
	};
}

export function createTextModel(text: string | ITextBufferFactory, _options: IRelaxedTextModelCreationOptions = TextModel.DEFAULT_CREATION_OPTIONS, languageId: string | null = null, uri: URI | null = null): TextModel {
	const disposables = new DisposableStore();
	const instantiationService = createModelServices(disposables);
	const model = createTextModel2(instantiationService, text, _options, languageId, uri);
	model.registerDisposable(disposables);
	return model;
}

export function createTextModel2(instantiationService: IInstantiationService, text: string | ITextBufferFactory, _options: IRelaxedTextModelCreationOptions = TextModel.DEFAULT_CREATION_OPTIONS, languageId: string | null = null, uri: URI | null = null): TestTextModel {
	const options = resolveOptions(_options);
	return instantiationService.createInstance(TestTextModel, text, options, languageId, uri);
}

export function createModelServices(disposables: DisposableStore, services: ServiceCollection = new ServiceCollection()): TestInstantiationService {
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

	const instantiationService = new TestInstantiationService(services);
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
