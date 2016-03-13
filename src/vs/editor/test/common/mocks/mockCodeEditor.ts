/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EventEmitter, IEventEmitter} from 'vs/base/common/eventEmitter';
import {createInstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {IKeybindingScopeLocation} from 'vs/platform/keybinding/common/keybindingService';
import {MockKeybindingService} from 'vs/platform/keybinding/test/common/mockKeybindingService';
import {MockTelemetryService} from 'vs/platform/telemetry/test/common/mockTelemetryService';
import {CommonCodeEditor} from 'vs/editor/common/commonCodeEditor';
import {CommonEditorConfiguration} from 'vs/editor/common/config/commonEditorConfig';
import {Cursor} from 'vs/editor/common/controller/cursor';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {Model} from 'vs/editor/common/model/model';
import {MockCodeEditorService} from 'vs/editor/test/common/mocks/mockCodeEditorService';
import {MockConfiguration} from 'vs/editor/test/common/mocks/mockConfiguration';

export class MockCodeEditor extends CommonCodeEditor {
	protected _createConfiguration(options:editorCommon.ICodeEditorWidgetCreationOptions): CommonEditorConfiguration {
		return new MockConfiguration(options);
	}
	public getCenteredRangeInViewport(): editorCommon.IEditorRange { return null; }
	public setScrollTop(newScrollTop:number): void { }
	public getScrollTop(): number { return 0; }
	public setScrollLeft(newScrollLeft:number): void { }
	public getScrollLeft(): number { return 0; }
	public getScrollWidth(): number { return 0; }
	public getScrollHeight(): number { return 0; }
	public saveViewState(): editorCommon.ICodeEditorViewState { return null; }
	public restoreViewState(state:editorCommon.IEditorViewState): void { }
	public layout(dimension?:editorCommon.IDimension): void { }
	public focus(): void { }
	public isFocused(): boolean { return true; }
	protected _enableEmptySelectionClipboard(): boolean { return false; }
	protected _createView(): void { }
	protected _getViewInternalEventBus(): IEventEmitter { return new EventEmitter(); }

	// --- test utils
	getCursor(): Cursor {
		return this.cursor;
	}

	public registerAndInstantiateContribution<T extends editorCommon.IEditorContribution>(ctor:any): T {
		let r = <T>this._instantiationService.createInstance(ctor, this);
		this.contributions[r.getId()] = r;
		return r;
	}
}

export class MockScopeLocation implements IKeybindingScopeLocation {
	setAttribute(attr:string, value:string): void { }
	removeAttribute(attr:string): void { }
}

export function withMockCodeEditor(text:string[], options:editorCommon.ICodeEditorWidgetCreationOptions, callback:(editor:MockCodeEditor, cursor:Cursor)=>void): void {

	let codeEditorService = new MockCodeEditorService();
	let keybindingService = new MockKeybindingService();
	let telemetryService = new MockTelemetryService();

	let instantiationService = createInstantiationService({
		codeEditorService: codeEditorService,
		keybindingService: keybindingService,
		telemetryService: telemetryService
	});

	let model = new Model(text.join('\n'), Model.DEFAULT_CREATION_OPTIONS, null);
	let editor = new MockCodeEditor(new MockScopeLocation(), options, instantiationService, codeEditorService, keybindingService, telemetryService);
	editor.setModel(model);

	callback(editor, editor.getCursor());

	editor.dispose();
	model.dispose();
	keybindingService.dispose();
	telemetryService.dispose();
}
