/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { createCancelablePromise, CancelablePromise, Delayer } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Event, Emitter } from 'vs/base/common/event';
import { provideSignatureHelp } from 'vs/editor/contrib/parameterHints/provideSignatureHelp';
import { CharacterSet } from 'vs/editor/common/core/characterClassifier';
import { ICursorSelectionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import * as modes from 'vs/editor/common/modes';

export interface TriggerContext {
	readonly triggerKind: modes.SignatureHelpTriggerKind;
	readonly triggerCharacter?: string;
}

export interface IHintEvent {
	hints: modes.SignatureHelp;
}

export class ParameterHintsModel extends Disposable {

	private static readonly DEFAULT_DELAY = 120; // ms

	private readonly _onHint = this._register(new Emitter<IHintEvent>());
	public readonly onHint: Event<IHintEvent> = this._onHint.event;

	private readonly _onCancel = this._register(new Emitter<void>());
	public readonly onCancel: Event<void> = this._onCancel.event;

	private editor: ICodeEditor;
	private enabled: boolean;
	private triggerCharactersListeners: IDisposable[];
	private active: boolean = false;
	private pending: boolean = false;
	private triggerChars = new CharacterSet();
	private retriggerChars = new CharacterSet();

	private throttledDelayer: Delayer<boolean>;
	private provideSignatureHelpRequest?: CancelablePromise<modes.SignatureHelp | null | undefined>;

	constructor(
		editor: ICodeEditor,
		delay: number = ParameterHintsModel.DEFAULT_DELAY
	) {
		super();

		this.editor = editor;
		this.enabled = false;
		this.triggerCharactersListeners = [];

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

	cancel(silent: boolean = false): void {
		this.active = false;
		this.pending = false;

		this.throttledDelayer.cancel();

		if (!silent) {
			this._onCancel.fire(void 0);
		}

		if (this.provideSignatureHelpRequest) {
			this.provideSignatureHelpRequest.cancel();
			this.provideSignatureHelpRequest = undefined;
		}
	}

	trigger(context: TriggerContext, delay?: number): void {

		const model = this.editor.getModel();
		if (model === null || !modes.SignatureHelpProviderRegistry.has(model)) {
			return;
		}

		this.throttledDelayer.trigger(
			() => this.doTrigger({
				triggerKind: context.triggerKind,
				triggerCharacter: context.triggerCharacter,
				isRetrigger: this.isTriggered,
			}), delay).then(undefined, onUnexpectedError);
	}

	private doTrigger(triggerContext: modes.SignatureHelpContext): Promise<boolean> {
		this.cancel(true);

		if (!this.editor.hasModel()) {
			return Promise.resolve(false);
		}

		const model = this.editor.getModel();
		const position = this.editor.getPosition();

		this.pending = true;

		this.provideSignatureHelpRequest = createCancelablePromise(token =>
			provideSignatureHelp(model, position, triggerContext, token));

		return this.provideSignatureHelpRequest.then(result => {
			this.pending = false;

			if (!result || !result.signatures || result.signatures.length === 0) {
				this.cancel();
				this._onCancel.fire(void 0);
				return false;
			}

			this.active = true;
			const event: IHintEvent = { hints: result };
			this._onHint.fire(event);
			return true;

		}).catch(error => {
			this.pending = false;
			onUnexpectedError(error);
			return false;
		});
	}

	private get isTriggered(): boolean {
		return this.active || this.pending || this.throttledDelayer.isTriggered();
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
		this.triggerCharactersListeners = dispose(this.triggerCharactersListeners);

		super.dispose();
	}
}