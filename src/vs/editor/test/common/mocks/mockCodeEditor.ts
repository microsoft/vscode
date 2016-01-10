/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {CommonCodeEditor} from 'vs/editor/common/commonCodeEditor';
import {Cursor} from 'vs/editor/common/controller/cursor';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import {EventEmitter, IEventEmitter} from 'vs/base/common/eventEmitter';
import {CommonEditorConfiguration, IIndentationGuesser} from 'vs/editor/common/config/commonEditorConfig';
import {MockConfiguration} from 'vs/editor/test/common/mocks/mockConfiguration';
import {MockKeybindingService} from 'vs/platform/keybinding/test/common/mockKeybindingService';
import {MockCodeEditorService} from 'vs/editor/test/common/mocks/mockCodeEditorService';
import {MockTelemetryService} from 'vs/platform/telemetry/test/common/mockTelemetryService';
import * as InstantiationService from 'vs/platform/instantiation/common/instantiationService';
import {IKeybindingScopeLocation} from 'vs/platform/keybinding/common/keybindingService';
import {Model} from 'vs/editor/common/model/model';

export class MockCodeEditor extends CommonCodeEditor {
	protected _createConfiguration(options:EditorCommon.ICodeEditorWidgetCreationOptions, indentationGuesser:IIndentationGuesser): CommonEditorConfiguration {
		return new MockConfiguration(options);
	}
	public getCenteredRangeInViewport(): EditorCommon.IEditorRange { return null; }
	public setScrollTop(newScrollTop:number): void { }
	public getScrollTop(): number { return 0; }
	public setScrollLeft(newScrollLeft:number): void { }
	public getScrollLeft(): number { return 0; }
	public getScrollWidth(): number { return 0; }
	public getScrollHeight(): number { return 0; }
	public saveViewState(): EditorCommon.ICodeEditorViewState { return null; }
	public restoreViewState(state:EditorCommon.IEditorViewState): void { }
	public layout(dimension?:EditorCommon.IDimension): void { }
	public focus(): void { }
	public isFocused(): boolean { return true; }
	protected _enableEmptySelectionClipboard(): boolean { return false; }
	protected _createView(): void { }
	protected _getViewInternalEventBus(): IEventEmitter { return new EventEmitter(); }

	// --- test utils
	getCursor(): Cursor {
		return this.cursor;
	}

	public registerAndInstantiateContribution<T extends EditorCommon.IEditorContribution>(ctor:any): T {
		let r = <T>this._instantiationService.createInstance(ctor, this);
		this.contributions[r.getId()] = r;
		return r;
	}
}

export class MockScopeLocation implements IKeybindingScopeLocation {
	setAttribute(attr:string, value:string): void { }
	removeAttribute(attr:string): void { }
}

export function withMockCodeEditor(text:string[], options:EditorCommon.ICodeEditorWidgetCreationOptions, callback:(editor:MockCodeEditor, cursor:Cursor)=>void): void {

	let codeEditorService = new MockCodeEditorService();
	let keybindingService = new MockKeybindingService();
	let telemetryService = new MockTelemetryService();

	let instantiationService = InstantiationService.create({
		codeEditorService: codeEditorService,
		keybindingService: keybindingService,
		telemetryService: telemetryService
	});

	let model = new Model(text.join('\n'), null);
	let editor = new MockCodeEditor(new MockScopeLocation(), options, instantiationService, codeEditorService, keybindingService, telemetryService);
	editor.setModel(model);

	callback(editor, editor.getCursor());

	editor.dispose();
	model.dispose();
	keybindingService.dispose();
	telemetryService.dispose();
}
