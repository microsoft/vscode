/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, Delayer } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICursorSelectionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { CharacterSet } from 'vs/editor/common/core/characterClassifier';
import * as modes from 'vs/editor/common/modes';
import { provideSignatureHelp } from 'vs/editor/contrib/parameterHints/provideSignatureHelp';

export interface TriggerContext {
	readonly triggerKind: modes.SignatureHelpTriggerKind;
	readonly triggerCharacter?: string;
}

namespace ParameterHintState {
	export const enum Type {
		Default,
		Active,
		Pending,
	}

	export const Default = new class { readonly type = Type.Default; };

	export class Pending {
		readonly type = Type.Pending;
		constructor(
			readonly request: CancelablePromise<modes.SignatureHelpResult | undefined | null>
		) { }
	}

	export class Active {
		readonly type = Type.Active;
		constructor(
			readonly hints: modes.SignatureHelp
		) { }
	}

	export type State = typeof Default | Pending | Active;
}

export class ParameterHintsModel extends Disposable {

	private static readonly DEFAULT_DELAY = 120; // ms

	private readonly _onChangedHints = this._register(new Emitter<modes.SignatureHelp | undefined>());
	public readonly onChangedHints = this._onChangedHints.event;

	private readonly editor: ICodeEditor;
	private enabled: boolean;
	private _state: ParameterHintState.State = ParameterHintState.Default;
	private readonly _lastSignatureHelpResult = this._register(new MutableDisposable<modes.SignatureHelpResult>());
	private triggerChars = new CharacterSet();
	private retriggerChars = new CharacterSet();

	private readonly throttledDelayer: Delayer<boolean>;
	private triggerId = 0;

	constructor(
		editor: ICodeEditor,
		delay: number = ParameterHintsModel.DEFAULT_DELAY
	) {
		super();

		this.editor = editor;
		this.enabled = false;

		this.throttledDelayer = new Delayer(delay);

		this._register(this.editor.onDidChangeConfiguration(() => this.onEditorConfigurationChange()));
		this._register(this.editor.onDidChangeModel(e => this.onModelChanged()));
		this._register(this.editor.onDidChangeModelLanguage(_ => this.onModelChanged()));
		this._register(this.editor.onDidChangeCursorSelection(e => this.onCursorChange(e)));
		this._register(this.editor.onDidChangeModelContent(e => this.onModelContentChange()));
		this._register(modes.SignatureHelpProviderRegistry.onDidChange(this.onModelChanged, this));
		this._register(this.editor.onDidType(text => this.onDidType(text)));

		this.onEditorConfigurationChange();
		this.onModelChanged();
	}

	private get state() { return this._state; }
	private set state(value: ParameterHintState.State) {
		if (this._state.type === ParameterHintState.Type.Pending) {
			this._state.request.cancel();
		}
		this._state = value;
	}

	cancel(silent: boolean = false): void {
		this.state = ParameterHintState.Default;

		this.throttledDelayer.cancel();

		if (!silent) {
			this._onChangedHints.fire(undefined);
		}
	}

	trigger(context: TriggerContext, delay?: number): void {
		const model = this.editor.getModel();
		if (!model || !modes.SignatureHelpProviderRegistry.has(model)) {
			return;
		}

		const triggerId = ++this.triggerId;
		this.throttledDelayer.trigger(
			() => this.doTrigger({
				triggerKind: context.triggerKind,
				triggerCharacter: context.triggerCharacter,
				isRetrigger: this.state.type === ParameterHintState.Type.Active || this.state.type === ParameterHintState.Type.Pending,
				activeSignatureHelp: this.state.type === ParameterHintState.Type.Active ? this.state.hints : undefined
			}, triggerId), delay).then(undefined, onUnexpectedError);
	}

	public next(): void {
		if (this.state.type !== ParameterHintState.Type.Active) {
			return;
		}

		const length = this.state.hints.signatures.length;
		const activeSignature = this.state.hints.activeSignature;
		const last = (activeSignature % length) === (length - 1);
		const cycle = this.editor.getConfiguration().contribInfo.parameterHints.cycle;

		// If there is only one signature, or we're on last signature of list
		if ((length < 2 || last) && !cycle) {
			this.cancel();
			return;
		}

		this.updateActiveSignature(last && cycle ? 0 : activeSignature + 1);
	}

	public previous(): void {
		if (this.state.type !== ParameterHintState.Type.Active) {
			return;
		}

		const length = this.state.hints.signatures.length;
		const activeSignature = this.state.hints.activeSignature;
		const first = activeSignature === 0;
		const cycle = this.editor.getConfiguration().contribInfo.parameterHints.cycle;

		// If there is only one signature, or we're on first signature of list
		if ((length < 2 || first) && !cycle) {
			this.cancel();
			return;
		}

		this.updateActiveSignature(first && cycle ? length - 1 : activeSignature - 1);
	}

	private updateActiveSignature(activeSignature: number) {
		if (this.state.type !== ParameterHintState.Type.Active) {
			return;
		}

		this.state = new ParameterHintState.Active({ ...this.state.hints, activeSignature });
		this._onChangedHints.fire(this.state.hints);
	}

	private doTrigger(triggerContext: modes.SignatureHelpContext, triggerId: number): Promise<boolean> {
		this.cancel(true);

		if (!this.editor.hasModel()) {
			return Promise.resolve(false);
		}

		const model = this.editor.getModel();
		const position = this.editor.getPosition();

		this.state = new ParameterHintState.Pending(createCancelablePromise(token =>
			provideSignatureHelp(model, position, triggerContext, token)));

		return this.state.request.then(result => {
			// Check that we are still resolving the correct signature help
			if (triggerId !== this.triggerId) {
				if (result) {
					result.dispose();
				}
				return false;
			}

			if (!result || !result.value.signatures || result.value.signatures.length === 0) {
				if (result) {
					result.dispose();
				}
				this._lastSignatureHelpResult.clear();
				this.cancel();
				return false;
			} else {
				this.state = new ParameterHintState.Active(result.value);
				this._lastSignatureHelpResult.value = result;
				this._onChangedHints.fire(this.state.hints);
				return true;
			}
		}).catch(error => {
			if (triggerId === this.triggerId) {
				this.state = ParameterHintState.Default;
			}
			onUnexpectedError(error);
			return false;
		});
	}

	private get isTriggered(): boolean {
		return this.state.type === ParameterHintState.Type.Active
			|| this.state.type === ParameterHintState.Type.Pending
			|| this.throttledDelayer.isTriggered();
	}

	private onModelChanged(): void {
		this.cancel();

		// Update trigger characters
		this.triggerChars = new CharacterSet();
		this.retriggerChars = new CharacterSet();

		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		for (const support of modes.SignatureHelpProviderRegistry.ordered(model)) {
			for (const ch of support.signatureHelpTriggerCharacters || []) {
				this.triggerChars.add(ch.charCodeAt(0));

				// All trigger characters are also considered retrigger characters
				this.retriggerChars.add(ch.charCodeAt(0));
			}

			for (const ch of support.signatureHelpRetriggerCharacters || []) {
				this.retriggerChars.add(ch.charCodeAt(0));
			}
		}
	}

	private onDidType(text: string) {
		if (!this.enabled) {
			return;
		}

		const lastCharIndex = text.length - 1;
		const triggerCharCode = text.charCodeAt(lastCharIndex);

		if (this.triggerChars.has(triggerCharCode) || this.isTriggered && this.retriggerChars.has(triggerCharCode)) {
			this.trigger({
				triggerKind: modes.SignatureHelpTriggerKind.TriggerCharacter,
				triggerCharacter: text.charAt(lastCharIndex),
			});
		}
	}

	private onCursorChange(e: ICursorSelectionChangedEvent): void {
		if (e.source === 'mouse') {
			this.cancel();
		} else if (this.isTriggered) {
			this.trigger({ triggerKind: modes.SignatureHelpTriggerKind.ContentChange });
		}
	}

	private onModelContentChange(): void {
		if (this.isTriggered) {
			this.trigger({ triggerKind: modes.SignatureHelpTriggerKind.ContentChange });
		}
	}

	private onEditorConfigurationChange(): void {
		this.enabled = this.editor.getConfiguration().contribInfo.parameterHints.enabled;

		if (!this.enabled) {
			this.cancel();
		}
	}

	dispose(): void {
		this.cancel(true);
		super.dispose();
	}
}