/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Panel } from 'vs/workbench/browser/panel';
import { EditorInput, EditorOptions, IEditor } from 'vs/workbench/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { INextEditorGroup } from 'vs/workbench/services/group/common/nextEditorGroupsService';

/**
 * The base class of editors in the workbench. Editors register themselves for specific editor inputs.
 * Editors are layed out in the editor part of the workbench in editor groups. Multiple editors can be
 * open at the same time. Each editor has a minimized representation that is good enough to provide some
 * information about the state of the editor data.
 *
 * The workbench will keep an editor alive after it has been created and show/hide it based on
 * user interaction. The lifecycle of a editor goes in the order create(), setVisible(true|false),
 * layout(), setInput(), focus(), dispose(). During use of the workbench, a editor will often receive a
 * clearInput, setVisible, layout and focus call, but only one create and dispose call.
 *
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseEditor extends Panel implements IEditor {

	protected _input: EditorInput;

	private _options: EditorOptions;
	private _group: INextEditorGroup;

	constructor(
		id: string,
		telemetryService: ITelemetryService,
		themeService: IThemeService
	) {
		super(id, telemetryService, themeService);
	}

	get input(): EditorInput {
		return this._input;
	}

	get options(): EditorOptions {
		return this._options;
	}

	get group(): INextEditorGroup {
		return this._group;
	}

	/**
	 * Note: Clients should not call this method, the workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Sets the given input with the options to the editor. The input is guaranteed
	 * to be different from the previous input that was set using the input.matches()
	 * method.
	 *
	 * The provided cancellation token should be used to test if the operation
	 * was cancelled.
	 */
	setInput(input: EditorInput, options: EditorOptions, token: CancellationToken): Thenable<void> {
		this._input = input;
		this._options = options;

		return TPromise.wrap<void>(null);
	}

	/**
	 * Called to indicate to the editor that the input should be cleared and
	 * resources associated with the input should be freed.
	 */
	clearInput(): void {
		this._input = null;
		this._options = null;
	}

	/**
	 * Note: Clients should not call this method, the workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Sets the given options to the editor. Clients should apply the options
	 * to the current input.
	 */
	setOptions(options: EditorOptions): void {
		this._options = options;
	}

	create(parent: HTMLElement): void; // create is sync for editors
	create(parent: HTMLElement): TPromise<void>;
	create(parent: HTMLElement): TPromise<void> {
		const res = super.create(parent);

		// Create Editor
		this.createEditor(parent);

		return res;
	}

	/**
	 * Called to create the editor in the parent HTMLElement.
	 */
	protected abstract createEditor(parent: HTMLElement): void;

	setVisible(visible: boolean, group?: INextEditorGroup): void; // setVisible is sync for editors
	setVisible(visible: boolean, group?: INextEditorGroup): TPromise<void>;
	setVisible(visible: boolean, group?: INextEditorGroup): TPromise<void> {
		const promise = super.setVisible(visible);

		// Propagate to Editor
		this.setEditorVisible(visible, group);

		return promise;
	}

	/**
	 * Indicates that the editor control got visible or hidden in a specific group. A
	 * editor instance will only ever be visible in one editor group.
	 *
	 * @param visible the state of visibility of this editor
	 * @param group the editor group this editor is in.
	 */
	protected setEditorVisible(visible: boolean, group: INextEditorGroup): void {
		this._group = group;
	}

	/**
	 * Subclasses can set this to false if it does not make sense to center editor input.
	 */
	supportsCenteredLayout(): boolean {
		return true;
	}

	dispose(): void {
		this._input = null;
		this._options = null;

		// Super Dispose
		super.dispose();
	}
}
