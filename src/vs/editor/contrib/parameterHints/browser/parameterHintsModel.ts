/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, Delayer } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { CharacterSet } from '../../../common/core/characterClassifier.js';
import { ICursorSelectionChangedEvent } from '../../../common/cursorEvents.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import * as languages from '../../../common/languages.js';
import { provideSignatureHelp } from './provideSignatureHelp.js';

export interface TriggerContext {
	readonly triggerKind: languages.SignatureHelpTriggerKind;
	readonly triggerCharacter?: string;
}

namespace ParameterHintState {
	export const enum Type {
		Default,
		Active,
		Pending,
	}

	export const Default = { type: Type.Default } as const;

	export class Pending {
		readonly type = Type.Pending;
		constructor(
			readonly request: CancelablePromise<languages.SignatureHelpResult | undefined | null>,
			readonly previouslyActiveHints: languages.SignatureHelp | undefined,
		) { }
	}

	export class Active {
		readonly type = Type.Active;
		constructor(
			readonly hints: languages.SignatureHelp
		) { }
	}

	export type State = typeof Default | Pending | Active;
}

export class ParameterHintsModel extends Disposable {

	private static readonly DEFAULT_DELAY = 120; // ms

	private readonly _onChangedHints = this._register(new Emitter<languages.SignatureHelp | undefined>());
	public readonly onChangedHints = this._onChangedHints.event;

	private readonly editor: ICodeEditor;
	private readonly providers: LanguageFeatureRegistry<languages.SignatureHelpProvider>;

	private triggerOnType = false;
	private _state: ParameterHintState.State = ParameterHintState.Default;
	private _pendingTriggers: TriggerContext[] = [];

	private readonly _lastSignatureHelpResult = this._register(new MutableDisposable<languages.SignatureHelpResult>());
	private readonly triggerChars = new CharacterSet();
	private readonly retriggerChars = new CharacterSet();

	private readonly throttledDelayer: Delayer<boolean>;
	private triggerId = 0;

	constructor(
		editor: ICodeEditor,
		providers: LanguageFeatureRegistry<languages.SignatureHelpProvider>,
		delay: number = ParameterHintsModel.DEFAULT_DELAY
	) {
		super();

		this.editor = editor;
		this.providers = providers;

		this.throttledDelayer = new Delayer(delay);

		this._register(this.editor.onDidBlurEditorWidget(() => this.cancel()));
		this._register(this.editor.onDidChangeConfiguration(() => this.onEditorConfigurationChange()));
		this._register(this.editor.onDidChangeModel(e => this.onModelChanged()));
		this._register(this.editor.onDidChangeModelLanguage(_ => this.onModelChanged()));
		this._register(this.editor.onDidChangeCursorSelection(e => this.onCursorChange(e)));
		this._register(this.editor.onDidChangeModelContent(e => this.onModelContentChange()));
		this._register(this.providers.onDidChange(this.onModelChanged, this));
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
		if (!model || !this.providers.has(model)) {
			return;
		}

		const triggerId = ++this.triggerId;

		this._pendingTriggers.push(context);
		this.throttledDelayer.trigger(() => {
			return this.doTrigger(triggerId);
		}, delay)
			.catch(onUnexpectedError);
	}

	public next(): void {
		if (this.state.type !== ParameterHintState.Type.Active) {
			return;
		}

		const length = this.state.hints.signatures.length;
		const activeSignature = this.state.hints.activeSignature;
		const last = (activeSignature % length) === (length - 1);
		const cycle = this.editor.getOption(EditorOption.parameterHints).cycle;

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
		const cycle = this.editor.getOption(EditorOption.parameterHints).cycle;

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

	private async doTrigger(triggerId: number): Promise<boolean> {
		const isRetrigger = this.state.type === ParameterHintState.Type.Active || this.state.type === ParameterHintState.Type.Pending;
		const activeSignatureHelp = this.getLastActiveHints();
		this.cancel(true);

		if (this._pendingTriggers.length === 0) {
			return false;
		}

		const context: TriggerContext = this._pendingTriggers.reduce(mergeTriggerContexts);
		this._pendingTriggers = [];

		const triggerContext = {
			triggerKind: context.triggerKind,
			triggerCharacter: context.triggerCharacter,
			isRetrigger: isRetrigger,
			activeSignatureHelp: activeSignatureHelp
		};

		if (!this.editor.hasModel()) {
			return false;
		}

		const model = this.editor.getModel();
		const position = this.editor.getPosition();

		this.state = new ParameterHintState.Pending(
			createCancelablePromise(token => provideSignatureHelp(this.providers, model, position, triggerContext, token)),
			activeSignatureHelp);

		try {
			const result = await this.state.request;

			// Check that we are still resolving the correct signature help
			if (triggerId !== this.triggerId) {
				result?.dispose();

				return false;
			}

			if (!result || !result.value.signatures || result.value.signatures.length === 0) {
				result?.dispose();
				this._lastSignatureHelpResult.clear();
				this.cancel();
				return false;
			} else {
				this.state = new ParameterHintState.Active(result.value);
				this._lastSignatureHelpResult.value = result;
				this._onChangedHints.fire(this.state.hints);
				return true;
			}
		} catch (error) {
			if (triggerId === this.triggerId) {
				this.state = ParameterHintState.Default;
			}
			onUnexpectedError(error);
			return false;
		}
	}

	private getLastActiveHints(): languages.SignatureHelp | undefined {
		switch (this.state.type) {
			case ParameterHintState.Type.Active: return this.state.hints;
			case ParameterHintState.Type.Pending: return this.state.previouslyActiveHints;
			default: return undefined;
		}
	}

	private get isTriggered(): boolean {
		return this.state.type === ParameterHintState.Type.Active
			|| this.state.type === ParameterHintState.Type.Pending
			|| this.throttledDelayer.isTriggered();
	}

	private onModelChanged(): void {
		this.cancel();

		this.triggerChars.clear();
		this.retriggerChars.clear();

		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		for (const support of this.providers.ordered(model)) {
			for (const ch of support.signatureHelpTriggerCharacters || []) {
				if (ch.length) {
					const charCode = ch.charCodeAt(0);
					this.triggerChars.add(charCode);

					// All trigger characters are also considered retrigger characters
					this.retriggerChars.add(charCode);
				}
			}

			for (const ch of support.signatureHelpRetriggerCharacters || []) {
				if (ch.length) {
					this.retriggerChars.add(ch.charCodeAt(0));
				}
			}
		}
	}

	private onDidType(text: string) {
		if (!this.triggerOnType) {
			return;
		}

		const lastCharIndex = text.length - 1;
		const triggerCharCode = text.charCodeAt(lastCharIndex);

		if (this.triggerChars.has(triggerCharCode) || this.isTriggered && this.retriggerChars.has(triggerCharCode)) {
			this.trigger({
				triggerKind: languages.SignatureHelpTriggerKind.TriggerCharacter,
				triggerCharacter: text.charAt(lastCharIndex),
			});
		}
	}

	private onCursorChange(e: ICursorSelectionChangedEvent): void {
		if (e.source === 'mouse') {
			this.cancel();
		} else if (this.isTriggered) {
			this.trigger({ triggerKind: languages.SignatureHelpTriggerKind.ContentChange });
		}
	}

	private onModelContentChange(): void {
		if (this.isTriggered) {
			this.trigger({ triggerKind: languages.SignatureHelpTriggerKind.ContentChange });
		}
	}

	private onEditorConfigurationChange(): void {
		this.triggerOnType = this.editor.getOption(EditorOption.parameterHints).enabled;

		if (!this.triggerOnType) {
			this.cancel();
		}
	}

	override dispose(): void {
		this.cancel(true);
		super.dispose();
	}
}

function mergeTriggerContexts(previous: TriggerContext, current: TriggerContext) {
	switch (current.triggerKind) {
		case languages.SignatureHelpTriggerKind.Invoke:
			// Invoke overrides previous triggers.
			return current;

		case languages.SignatureHelpTriggerKind.ContentChange:
			// Ignore content changes triggers
			return previous;

		case languages.SignatureHelpTriggerKind.TriggerCharacter:
		default:
			return current;
	}
}
