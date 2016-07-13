/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EventEmitter, IEventEmitter} from 'vs/base/common/eventEmitter';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {ICommandService, NullCommandService} from 'vs/platform/commands/common/commands';
import {IKeybindingService, IKeybindingScopeLocation} from 'vs/platform/keybinding/common/keybinding';
import {MockKeybindingService} from 'vs/platform/keybinding/test/common/mockKeybindingService';
import {ITelemetryService, NullTelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {CommonCodeEditor} from 'vs/editor/common/commonCodeEditor';
import {CommonEditorConfiguration} from 'vs/editor/common/config/commonEditorConfig';
import {Cursor} from 'vs/editor/common/controller/cursor';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {Model} from 'vs/editor/common/model/model';
import {MockCodeEditorService} from 'vs/editor/test/common/mocks/mockCodeEditorService';
import {MockConfiguration} from 'vs/editor/test/common/mocks/mockConfiguration';
import {Range} from 'vs/editor/common/core/range';

export class MockCodeEditor extends CommonCodeEditor {
	protected _createConfiguration(options:editorCommon.ICodeEditorWidgetCreationOptions): CommonEditorConfiguration {
		return new MockConfiguration(options);
	}
	public getCenteredRangeInViewport(): Range { return null; }

	public getScrollWidth(): number { return 0; }
	public getScrollLeft(): number { return 0; }

	public getScrollHeight(): number { return 0; }
	public getScrollTop(): number { return 0; }

	public setScrollLeft(newScrollLeft:number): void { }
	public setScrollTop(newScrollTop:number): void { }
	public setScrollPosition(position: editorCommon.INewScrollPosition): void { }

	public saveViewState(): editorCommon.ICodeEditorViewState { return null; }
	public restoreViewState(state:editorCommon.IEditorViewState): void { }

	public layout(dimension?:editorCommon.IDimension): void { }

	public focus(): void { }
	public beginForcedWidgetFocus(): void { }
	public endForcedWidgetFocus(): void { }
	public isFocused(): boolean { return true; }
	public hasWidgetFocus(): boolean { return true; };

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
	hasAttribute(attr: string): boolean { return false; }
	getAttribute(attr: string): string { return; }
}

export function withMockCodeEditor(text:string[], options:editorCommon.ICodeEditorWidgetCreationOptions, callback:(editor:MockCodeEditor, cursor:Cursor)=>void): void {

	let codeEditorService = new MockCodeEditorService();
	let keybindingService = new MockKeybindingService();
	let telemetryService = NullTelemetryService;
	let commandService = NullCommandService;

	let services = new ServiceCollection();
	services.set(ICodeEditorService, codeEditorService);
	services.set(IKeybindingService, keybindingService);
	services.set(ITelemetryService, telemetryService);
	services.set(ICommandService, commandService);
	let instantiationService = new InstantiationService(services);

	let model = Model.createFromString(text.join('\n'));
	let editor = new MockCodeEditor(new MockScopeLocation(), options, instantiationService, codeEditorService, commandService, keybindingService, telemetryService);
	editor.setModel(model);

	callback(editor, editor.getCursor());

	editor.dispose();
	model.dispose();
	keybindingService.dispose();
}
