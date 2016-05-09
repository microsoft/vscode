/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

/* tslint:disable:no-unused-variable */
import 'vs/css!./media/editorpart';
import 'vs/workbench/browser/parts/editor/editor.contribution';
import {TPromise} from 'vs/base/common/winjs.base';
import {Registry} from 'vs/platform/platform';
import timer = require('vs/base/common/timer');
import {EventType} from 'vs/base/common/events';
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import nls = require('vs/nls');
import strings = require('vs/base/common/strings');
import assert = require('vs/base/common/assert');
import arrays = require('vs/base/common/arrays');
import types = require('vs/base/common/types');
import {IEditorViewState, IEditor} from 'vs/editor/common/editorCommon';
import errors = require('vs/base/common/errors');
import {Scope as MementoScope} from 'vs/workbench/common/memento';
import {Scope, IActionBarRegistry, Extensions as ActionBarExtensions, prepareActions} from 'vs/workbench/browser/actionBarRegistry';
import {IAction} from 'vs/base/common/actions';
import {Part} from 'vs/workbench/browser/part';
import {EventType as WorkbenchEventType, EditorEvent} from 'vs/workbench/common/events';
import {IEditorRegistry, Extensions as EditorExtensions, BaseEditor, IEditorInputActionContext, EditorDescriptor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput, EditorOptions, TextEditorOptions} from 'vs/workbench/common/editor';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {EventType as SideBySideEventType, SideBySideEditorControl, Rochade} from 'vs/workbench/browser/parts/editor/sideBySideEditorControl';
import {WorkbenchProgressService} from 'vs/workbench/services/progress/browser/progressService';
import {EditorArrangement} from 'vs/workbench/services/editor/common/editorService';
import {IEditorPart} from 'vs/workbench/services/editor/browser/editorService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {Position, POSITIONS} from 'vs/platform/editor/common/editor';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {IMessageService, IMessageWithAction, Severity} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IProgressService} from 'vs/platform/progress/common/progress';
import {EditorStacksModel, IEditorStacksModel, EditorGroup} from 'vs/workbench/common/editor/editorStacksModel';

export class EditorPart extends Part implements IEditorPart {
	private stacksModel: EditorStacksModel;
	private groupsToEditor: { [groupId: number]: BaseEditor; };
	private sideBySideControl: SideBySideEditorControl;
	private memento: any;

	constructor(
		id: string,
		@IMessageService private messageService: IMessageService,
		@IEventService private eventService: IEventService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IStorageService private storageService: IStorageService,
		@IPartService private partService: IPartService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id);

		this.groupsToEditor = Object.create(null);

		this.stacksModel = this.instantiationService.createInstance(EditorStacksModel);
	}

	public getStacksModel(): IEditorStacksModel {
		return this.stacksModel;
	}

	public getActiveEditorInput(): EditorInput {
		const group = this.stacksModel.activeGroup;

		return group ? group.activeEditor : null;
	}

	public getActiveEditor(): BaseEditor {
		const activeGroup = this.stacksModel.activeGroup;

		if (activeGroup) {
			return this.groupsToEditor[activeGroup.id];
		}

		return null;
	}

	public getVisibleEditors(): BaseEditor[] {
		return this.stacksModel.groups.map(g => this.groupsToEditor[g.id]);
	}

	public openEditor(input?: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<BaseEditor>;
	public openEditor(input?: EditorInput, options?: EditorOptions, position?: Position, widthRatios?: number[]): TPromise<BaseEditor>;
	public openEditor(input?: EditorInput, options?: EditorOptions, arg3?: any, widthRatios?: number[]): TPromise<BaseEditor> {
		return TPromise.as(null);
	}

	public activateEditor(editor: BaseEditor): void {
		const group = this.groupOfEditor(editor);

		// Activate group of editor
		this.stacksModel.setActive(group);

		// Activate input of editor
		group.setActive(editor.input);
	}

	public moveEditor(from: Position, to: Position): void { // TODO@stacks method should be removed and the stacks model be used directly
		this.stacksModel.moveGroup(this.stacksModel.groups[from], to);
	}

	public closeEditors(othersOnly?: boolean): TPromise<void> { // TODO@stacks method should be removed and the stacks model be used directly
		this.stacksModel.closeGroups(othersOnly ? this.stacksModel.activeGroup : void 0);

		return TPromise.as(null);
	}

	public arrangeEditors(arrangement: EditorArrangement): void {
		this.sideBySideControl.arrangeEditors(arrangement);
	}

	public createContentArea(parent: Builder): Builder {

		// Content Container
		let contentArea = $(parent)
			.div()
			.addClass('content');

		// Stacks Control
		this.sideBySideControl = this.instantiationService.createInstance(SideBySideEditorControl, contentArea);
		// TODO@stacks this.toUnbind.push(this.sideBySideControl.addListener(SideBySideEventType.EDITOR_FOCUS_CHANGED, () => { this.onEditorFocusChanged(); }));

		// settings
		this.memento = this.getMemento(this.storageService, MementoScope.WORKSPACE);

		return contentArea;
	}

	public layout(dimension: Dimension): Dimension[] {

		// Pass to super
		let sizes = super.layout(dimension);

		// Pass to Stacks Control
		const size = sizes[1];
		this.sideBySideControl.layout(size);

		return sizes;
	}

	public shutdown(): void {

		// TODO@stacks persist side by side width ratios
		// TODO@stacks shutdown instantiated editors

		// Pass to super
		super.shutdown();
	}

	public dispose(): void {

		// TODO@stacks dispose instantiated editors

		// Pass to stacks control
		this.sideBySideControl.dispose();

		// Pass to super
		super.dispose();
	}

	private groupOfEditor(editor: BaseEditor): EditorGroup {
		for (let groupId of Object.keys(this.groupsToEditor)) {
			let groupEditor = this.groupsToEditor[groupId];
			if (groupEditor === editor) {
				return this.stacksModel.getGroup(Number(groupId));
			}
		}

		return null;
	}


	/// --- NOT IMPLEMENTED YET

	public setEditors(inputs: EditorInput[], options?: EditorOptions[]): TPromise<BaseEditor[]> {
		return TPromise.as([]);
	}

	public restoreEditorState(inputsToOpen?: EditorInput[], options?: EditorOptions[]): TPromise<BaseEditor[]> {
		return TPromise.as([]);
	}
}