/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ThrottledDelayer} from 'vs/base/common/async';
import {EventEmitter, IEventEmitter, ListenerCallback} from 'vs/base/common/eventEmitter';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {EventType, ICommonCodeEditor, ICursorSelectionChangedEvent, IModeSupportChangedEvent} from 'vs/editor/common/editorCommon';
import {IParameter, IParameterHints, ISignature} from 'vs/editor/common/modes';
import {ParameterHintsRegistry, getParameterHints} from '../common/parameterHints';

function equalsArr<T>(a: T[], b:T[], equalsFn:(a:T,b:T)=>boolean): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0, len = a.length; i < len; i++) {
		if (!equalsFn(a[i], b[i])) {
			return false;
		}
	}
	return true;
}

function equalsParameter(a: IParameter, b: IParameter): boolean {
	return (
		a.documentation === b.documentation
		&& a.label === b.label
		&& a.signatureLabelEnd === b.signatureLabelEnd
		&& a.signatureLabelOffset === b.signatureLabelOffset
	);
}

function equalsSignature(a: ISignature, b: ISignature): boolean {
	return (
		a.documentation === b.documentation
		&& a.label === b.label
		&& equalsArr(a.parameters, b.parameters, equalsParameter)
	);
}

function equalsParameterHints(a: IParameterHints, b: IParameterHints): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return (
		equalsArr(a.signatures, b.signatures, equalsSignature)
	);
}

export interface IHintEvent {
	hints: IParameterHints;
}

export class ParameterHintsModel extends EventEmitter {

	static DELAY = 120; // ms

	private editor: ICommonCodeEditor;
	private toDispose: IDisposable[];
	private triggerCharactersListeners: IDisposable[];

	private active: boolean;
	private prevResult: IParameterHints;
	private throttledDelayer: ThrottledDelayer<boolean>;

	constructor(editor:ICommonCodeEditor) {
		super(['cancel', 'hint', 'destroy']);

		this.editor = editor;
		this.toDispose = [];
		this.triggerCharactersListeners = [];

		this.throttledDelayer = new ThrottledDelayer<boolean>(ParameterHintsModel.DELAY);

		this.active = false;
		this.prevResult = null;

		this.event(this.editor, EventType.ModelChanged, e => this.onModelChanged());
		this.event(this.editor, EventType.ModelModeChanged, encodeURI => this.onModelChanged());
		this.event(this.editor, EventType.ModelModeSupportChanged, e => this.onModeChanged(e));
		this.event(this.editor, EventType.CursorSelectionChanged, e => this.onCursorChange(e));
		this.toDispose.push(ParameterHintsRegistry.onDidChange(this.onModelChanged, this));
		this.onModelChanged();
	}

	public cancel(silent: boolean = false, refresh: boolean = false): void {
		this.active = false;

		if (!refresh) {
			this.prevResult = null;
		}

		this.throttledDelayer.cancel();

		if (!silent) {
			this.emit('cancel');
		}
	}

	public trigger(triggerCharacter?: string, delay: number = ParameterHintsModel.DELAY): TPromise<boolean> {
		if (!ParameterHintsRegistry.has(this.editor.getModel())) {
			return;
		}

		this.cancel(true, true);
		return this.throttledDelayer.trigger(() => this.doTrigger(triggerCharacter), delay);
	}

	public doTrigger(triggerCharacter: string): TPromise<boolean> {
		return getParameterHints(this.editor.getModel(), this.editor.getPosition(), triggerCharacter).then(result => {

			let equalsPrevResult = equalsParameterHints(this.prevResult, result);

			if (!result || result.signatures.length === 0 || (this.prevResult && !equalsPrevResult)) {
				this.cancel();
				this.emit('cancel');
				return false;
			}

			this.active = true;
			this.prevResult = result;

			var event:IHintEvent = { hints: result };
			this.emit('hint', event);
			return true;
		});
	}

	public isTriggered():boolean {
		return this.active || this.throttledDelayer.isTriggered();
	}

	private onModelChanged(): void {
		this.triggerCharactersListeners = disposeAll(this.triggerCharactersListeners);

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

	private event(emitter: IEventEmitter, eventType: string, cb: ListenerCallback): void {
		this.toDispose.push(emitter.addListener2(eventType, cb));
	}

	public dispose(): void {
		this.cancel(true);

		this.triggerCharactersListeners = disposeAll(this.triggerCharactersListeners);
		this.toDispose = disposeAll(this.toDispose);

		this.emit('destroy', null);

		super.dispose();
	}
}
