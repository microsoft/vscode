/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ThrottledDelayer} from 'vs/base/common/async';
import {onUnexpectedError} from 'vs/base/common/errors';
import Event, {Emitter} from 'vs/base/common/event';
import {IDisposable, dispose, Disposable} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {EventType, ICommonCodeEditor, ICursorSelectionChangedEvent, IModeSupportChangedEvent} from 'vs/editor/common/editorCommon';
import {ParameterHintsRegistry, IParameterHints} from 'vs/editor/common/modes';
import {getParameterHints} from '../common/parameterHints';

export interface IHintEvent {
	hints: IParameterHints;
}

export class ParameterHintsModel extends Disposable {

	static DELAY = 120; // ms

	private _onHint = this._register(new Emitter<IHintEvent>());
	public onHint: Event<IHintEvent> = this._onHint.event;

	private _onCancel = this._register(new Emitter<void>());
	public onCancel: Event<void> = this._onCancel.event;

	private editor: ICommonCodeEditor;
	private triggerCharactersListeners: IDisposable[];

	private active: boolean;
	private throttledDelayer: ThrottledDelayer<boolean>;

	constructor(editor:ICommonCodeEditor) {
		super();

		this.editor = editor;
		this.triggerCharactersListeners = [];

		this.throttledDelayer = new ThrottledDelayer<boolean>(ParameterHintsModel.DELAY);

		this.active = false;

		this._register(this.editor.addListener2(EventType.ModelChanged, e => this.onModelChanged()));
		this._register(this.editor.addListener2(EventType.ModelModeChanged, _ => this.onModelChanged()));
		this._register(this.editor.addListener2(EventType.ModelModeSupportChanged, e => this.onModeChanged(e)));
		this._register(this.editor.addListener2(EventType.CursorSelectionChanged, e => this.onCursorChange(e)));
		this._register(ParameterHintsRegistry.onDidChange(this.onModelChanged, this));
		this.onModelChanged();
	}

	public cancel(silent: boolean = false): void {
		this.active = false;

		this.throttledDelayer.cancel();

		if (!silent) {
			this._onCancel.fire(void 0);
		}
	}

	public trigger(triggerCharacter?: string, delay: number = ParameterHintsModel.DELAY): TPromise<boolean> {
		if (!ParameterHintsRegistry.has(this.editor.getModel())) {
			return;
		}

		this.cancel(true);
		return this.throttledDelayer.trigger(() => this.doTrigger(triggerCharacter), delay);
	}

	private doTrigger(triggerCharacter: string): TPromise<boolean> {
		return getParameterHints(this.editor.getModel(), this.editor.getPosition(), triggerCharacter)
			.then<IParameterHints>(null, onUnexpectedError)
			.then(result => {
				if (!result || result.signatures.length === 0) {
					this.cancel();
					this._onCancel.fire(void 0);
					return false;
				}

				this.active = true;

				var event:IHintEvent = { hints: result };
				this._onHint.fire(event);
				return true;
			});
	}

	public isTriggered():boolean {
		return this.active || this.throttledDelayer.isTriggered();
	}

	private onModelChanged(): void {
		if (this.active) {
			this.cancel();
		}
		this.triggerCharactersListeners = dispose(this.triggerCharactersListeners);

		var model = this.editor.getModel();
		if (!model) {
			return;
		}

		let support = ParameterHintsRegistry.ordered(model)[0];
		if (!support) {
			return;
		}

		this.triggerCharactersListeners = support.getParameterHintsTriggerCharacters().map((ch) => {
			let listener = this.editor.addTypingListener(ch, () => {
				let position = this.editor.getPosition();
				let lineContext = model.getLineContext(position.lineNumber);

				if (!support.shouldTriggerParameterHints(lineContext, position.column - 1)) {
					return;
				}

				this.trigger(ch);
			});

			return { dispose: listener };
		});
	}

	private onModeChanged(e: IModeSupportChangedEvent): void {
		if (e.parameterHintsSupport) {
			this.onModelChanged();
		}
	}

	private onCursorChange(e: ICursorSelectionChangedEvent): void {
		if (e.source === 'mouse') {
			this.cancel();
		} else if (this.isTriggered()) {
			this.trigger();
		}
	}

	public dispose(): void {
		this.cancel(true);

		this.triggerCharactersListeners = dispose(this.triggerCharactersListeners);

		super.dispose();
	}
}
