/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IContextKeyService, IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { Cursor } from 'vs/editor/common/controller/cursor';
import * as editorCommon from 'vs/editor/common/editorCommon';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { TextModel } from 'vs/editor/common/model/textModel';
import { TestConfiguration } from 'vs/editor/test/common/mocks/testConfiguration';
import * as editorOptions from 'vs/editor/common/config/editorOptions';
import { ITextModel } from 'vs/editor/common/model';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { CodeEditorWidget, ICodeEditorWidgetOptions, } from 'vs/editor/browser/widget/codeEditorWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TestCodeEditorService, TestCommandService } from 'vs/editor/test/browser/editorTestServices';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class TestCodeEditor extends CodeEditorWidget implements editorBrowser.ICodeEditor {

	//#region testing overrides
	protected _createConfiguration(options: editorOptions.IEditorOptions): editorCommon.IConfiguration {
		return new TestConfiguration(options);
	}
	protected _createView(): void {
		// Never create a view
	}
	//#endregion

	//#region Testing utils
	public getCursor(): Cursor {
		return this.cursor;
	}
	public registerAndInstantiateContribution<T extends editorCommon.IEditorContribution>(ctor: any): T {
		let r = <T>this._instantiationService.createInstance(ctor, this);
		this._contributions[r.getId()] = r;
		return r;
	}
	public dispose() {
		super.dispose();
		if (this.model) {
			this.model.dispose();
			this.model = null;
		}
	}
}

class TestEditorDomElement {
	parentElement: IContextKeyServiceTarget = null;
	setAttribute(attr: string, value: string): void { }
	removeAttribute(attr: string): void { }
	hasAttribute(attr: string): boolean { return false; }
	getAttribute(attr: string): string { return undefined; }
	addEventListener(event: string): void { }
	removeEventListener(event: string): void { }
}

export interface TestCodeEditorCreationOptions extends editorOptions.IEditorOptions {
	/**
	 * The initial model associated with this code editor.
	 */
	model?: ITextModel;
	serviceCollection?: ServiceCollection;
}

export function withTestCodeEditor(text: string | string[], options: TestCodeEditorCreationOptions, callback: (editor: TestCodeEditor, cursor: Cursor) => void): void {
	// create a model if necessary and remember it in order to dispose it.
	if (!options.model) {
		if (typeof text === 'string') {
			options.model = TextModel.createFromString(text);
		} else {
			options.model = TextModel.createFromString(text.join('\n'));
		}
	}

	let editor = <TestCodeEditor>createTestCodeEditor(options);
	callback(editor, editor.getCursor());

	editor.dispose();
}

export function createTestCodeEditor(options: TestCodeEditorCreationOptions): TestCodeEditor {

	const services: ServiceCollection = options.serviceCollection || new ServiceCollection();
	const instantiationService: IInstantiationService = new InstantiationService(services);

	if (!services.has(ICodeEditorService)) {
		services.set(ICodeEditorService, new TestCodeEditorService());
	}
	if (!services.has(IContextKeyService)) {
		services.set(IContextKeyService, new MockContextKeyService());
	}
	if (!services.has(INotificationService)) {
		services.set(INotificationService, new TestNotificationService());
	}
	if (!services.has(ICommandService)) {
		services.set(ICommandService, new TestCommandService(instantiationService));
	}
	if (!services.has(IThemeService)) {
		services.set(IThemeService, new TestThemeService());
	}

	const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
		contributions: []
	};
	const editor = instantiationService.createInstance(
		TestCodeEditor,
		<HTMLElement><any>new TestEditorDomElement(),
		options,
		codeEditorWidgetOptions
	);
	editor.setModel(options.model);
	return editor;
}
