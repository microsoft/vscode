/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Panel } from 'vs/workbench/browser/panel';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { IEditor, Position } from 'vs/platform/editor/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';

/**
 * The base class of editors in the workbench. Editors register themselves for specific editor inputs.
 * Editors are layed out in the editor part of the workbench. Only one editor can be open at a time.
 * Each editor has a minimized representation that is good enough to provide some information about the
 * state of the editor data.
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
	private _position: Position;

	constructor(id: string, telemetryService: ITelemetryService, themeService: IThemeService) {
		super(id, telemetryService, themeService);
	}

	public get input(): EditorInput {
		return this._input;
	}

	public get options(): EditorOptions {
		return this._options;
	}

	/**
	 * Note: Clients should not call this method, the workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Sets the given input with the options to the part. An editor has to deal with the
	 * situation that the same input is being set with different options.
	 */
	public setInput(input: EditorInput, options?: EditorOptions): TPromise<void> {
		this._input = input;
		this._options = options;

		return TPromise.wrap<void>(null);
	}

	/**
	 * Called to indicate to the editor that the input should be cleared and resources associated with the
	 * input should be freed.
	 */
	public clearInput(): void {
		this._input = null;
		this._options = null;
	}

	public create(parent: HTMLElement): void; // create is sync for editors
	public create(parent: HTMLElement): TPromise<void>;
	public create(parent: HTMLElement): TPromise<void> {
		const res = super.create(parent);

		// Create Editor
		this.createEditor(parent);

		return res;
	}

	/**
	 * Called to create the editor in the parent HTMLElement.
	 */
	protected abstract createEditor(parent: HTMLElement): void;

	/**
	 * Subclasses can set this to false if it does not make sense to center editor input.
	 */
	public supportsCenteredLayout(): boolean {
		return true;
	}

	/**
	 * Overload this function to allow for passing in a position argument.
	 */
	public setVisible(visible: boolean, position?: Position): void; // setVisible is sync for editors
	public setVisible(visible: boolean, position?: Position): TPromise<void>;
	public setVisible(visible: boolean, position: Position = null): TPromise<void> {
		const promise = super.setVisible(visible);

		// Propagate to Editor
		this.setEditorVisible(visible, position);

		return promise;
	}

	protected setEditorVisible(visible: boolean, position: Position = null): void {
		this._position = position;
	}

	/**
	 * Called when the position of the editor changes while it is visible.
	 */
	public changePosition(position: Position): void {
		this._position = position;
	}

	/**
	 * The position this editor is showing in or null if none.
	 */
	public get position(): Position {
		return this._position;
	}

	public dispose(): void {
		this._input = null;
		this._options = null;

		// Super Dispose
		super.dispose();
	}
}
