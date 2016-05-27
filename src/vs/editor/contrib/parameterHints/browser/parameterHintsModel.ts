/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {RunOnceScheduler} from 'vs/base/common/async';
import {onUnexpectedError} from 'vs/base/common/errors';
import Event, {Emitter} from 'vs/base/common/event';
import {IDisposable, dispose, Disposable} from 'vs/base/common/lifecycle';
import {ICommonCodeEditor, ICursorSelectionChangedEvent} from 'vs/editor/common/editorCommon';
import {SignatureHelpProviderRegistry, SignatureHelp} from 'vs/editor/common/modes';
import {provideSignatureHelp} from '../common/parameterHints';

export interface IHintEvent {
	hints: SignatureHelp;
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
	private throttledDelayer: RunOnceScheduler;

	constructor(editor:ICommonCodeEditor) {
		super();

		this.editor = editor;
		this.triggerCharactersListeners = [];

		this.throttledDelayer = new RunOnceScheduler(() => this.doTrigger(), ParameterHintsModel.DELAY);

		this.active = false;

		this._register(this.editor.onDidChangeModel(e => this.onModelChanged()));
		this._register(this.editor.onDidChangeModelMode(_ => this.onModelChanged()));
		this._register(this.editor.onDidChangeCursorSelection(e => this.onCursorChange(e)));
		this._register(SignatureHelpProviderRegistry.onDidChange(this.onModelChanged, this));
		this.onModelChanged();
	}

	public cancel(silent: boolean = false): void {
		this.active = false;

		this.throttledDelayer.cancel();

		if (!silent) {
			this._onCancel.fire(void 0);
		}
	}

	public trigger(delay = ParameterHintsModel.DELAY): void {
		if (!SignatureHelpProviderRegistry.has(this.editor.getModel())) {
			return;
		}

		this.cancel(true);
		return this.throttledDelayer.schedule(delay);
	}

	private doTrigger(): void {
		provideSignatureHelp(this.editor.getModel(), this.editor.getPosition())
			.then<SignatureHelp>(null, onUnexpectedError)
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
		return this.active || this.throttledDelayer.isScheduled();
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

		let support = SignatureHelpProviderRegistry.ordered(model)[0];
		if (!support) {
			return;
		}

		this.triggerCharactersListeners = support.signatureHelpTriggerCharacters.map((ch) => {
			return this.editor.addTypingListener(ch, () => {
				this.trigger();
			});
		});
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
