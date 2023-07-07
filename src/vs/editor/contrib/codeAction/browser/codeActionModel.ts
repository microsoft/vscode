/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-native-private */

import { CancelablePromise, createCancelablePromise, TimeoutTimer } from 'vs/base/common/async';
import { isCancellationError } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { CodeActionProvider, CodeActionTriggerType } from 'vs/editor/common/languages';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IEditorProgressService, Progress } from 'vs/platform/progress/common/progress';
import { CodeActionSet, CodeActionTrigger, CodeActionTriggerSource } from '../common/types';
import { getCodeActions } from './codeAction';

export const SUPPORTED_CODE_ACTIONS = new RawContextKey<string>('supportedCodeAction', '');

type TriggeredCodeAction = {
	readonly selection: Selection;
	readonly trigger: CodeActionTrigger;
};

class CodeActionOracle extends Disposable {

	private readonly _autoTriggerTimer = this._register(new TimeoutTimer());

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _markerService: IMarkerService,
		private readonly _signalChange: (triggered: TriggeredCodeAction | undefined) => void,
		private readonly _delay: number = 250,
	) {
		super();
		this._register(this._markerService.onMarkerChanged(e => this._onMarkerChanges(e)));
		this._register(this._editor.onDidChangeCursorPosition(() => this._tryAutoTrigger()));
	}

	public trigger(trigger: CodeActionTrigger): void {
		const selection = this._getRangeOfSelectionUnlessWhitespaceEnclosed(trigger);
		this._signalChange(selection ? { trigger, selection } : undefined);
	}

	private _onMarkerChanges(resources: readonly URI[]): void {
		const model = this._editor.getModel();
		if (model && resources.some(resource => isEqual(resource, model.uri))) {
			this._tryAutoTrigger();
		}
	}

	private _tryAutoTrigger() {
		this._autoTriggerTimer.cancelAndSet(() => {
			this.trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default });
		}, this._delay);
	}

	private _getRangeOfSelectionUnlessWhitespaceEnclosed(trigger: CodeActionTrigger): Selection | undefined {
		if (!this._editor.hasModel()) {
			return undefined;
		}

		const model = this._editor.getModel();
		const selection = this._editor.getSelection();
		if (selection.isEmpty() && trigger.type === CodeActionTriggerType.Auto) {
			const { lineNumber, column } = selection.getPosition();
			const line = model.getLineContent(lineNumber);
			if (line.length === 0) {
				// empty line
				return undefined;
			} else if (column === 1) {
				// look only right
				if (/\s/.test(line[0])) {
					return undefined;
				}
			} else if (column === model.getLineMaxColumn(lineNumber)) {
				// look only left
				if (/\s/.test(line[line.length - 1])) {
					return undefined;
				}
			} else {
				// look left and right
				if (/\s/.test(line[column - 2]) && /\s/.test(line[column - 1])) {
					return undefined;
				}
			}
		}
		return selection;
	}
}

export namespace CodeActionsState {

	export const enum Type { Empty, Triggered }

	export const Empty = { type: Type.Empty } as const;

	export class Triggered {
		readonly type = Type.Triggered;

		public readonly actions: Promise<CodeActionSet>;

		constructor(
			public readonly trigger: CodeActionTrigger,
			public readonly position: Position,
			private readonly _cancellablePromise: CancelablePromise<CodeActionSet>,
		) {
			this.actions = _cancellablePromise.catch((e): CodeActionSet => {
				if (isCancellationError(e)) {
					return emptyCodeActionSet;
				}
				throw e;
			});
		}

		public cancel() {
			this._cancellablePromise.cancel();
		}
	}

	export type State = typeof Empty | Triggered;
}

const emptyCodeActionSet = Object.freeze<CodeActionSet>({
	allActions: [],
	validActions: [],
	dispose: () => { },
	documentation: [],
	hasAutoFix: false
});

export class CodeActionModel extends Disposable {

	private readonly _codeActionOracle = this._register(new MutableDisposable<CodeActionOracle>());
	private _state: CodeActionsState.State = CodeActionsState.Empty;

	private readonly _supportedCodeActions: IContextKey<string>;

	private readonly _onDidChangeState = this._register(new Emitter<CodeActionsState.State>());
	public readonly onDidChangeState = this._onDidChangeState.event;

	#isDisposed = false;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _registry: LanguageFeatureRegistry<CodeActionProvider>,
		private readonly _markerService: IMarkerService,
		contextKeyService: IContextKeyService,
		private readonly _progressService?: IEditorProgressService
	) {
		super();
		this._supportedCodeActions = SUPPORTED_CODE_ACTIONS.bindTo(contextKeyService);

		this._register(this._editor.onDidChangeModel(() => this._update()));
		this._register(this._editor.onDidChangeModelLanguage(() => this._update()));
		this._register(this._registry.onDidChange(() => this._update()));

		this._update();
	}

	override dispose(): void {
		if (this.#isDisposed) {
			return;
		}
		this.#isDisposed = true;

		super.dispose();
		this.setState(CodeActionsState.Empty, true);
	}

	private _update(): void {
		if (this.#isDisposed) {
			return;
		}

		this._codeActionOracle.value = undefined;

		this.setState(CodeActionsState.Empty);

		const model = this._editor.getModel();
		if (model
			&& this._registry.has(model)
			&& !this._editor.getOption(EditorOption.readOnly)
		) {
			const supportedActions: string[] = this._registry.all(model).flatMap(provider => provider.providedCodeActionKinds ?? []);
			this._supportedCodeActions.set(supportedActions.join(' '));

			this._codeActionOracle.value = new CodeActionOracle(this._editor, this._markerService, trigger => {
				if (!trigger) {
					this.setState(CodeActionsState.Empty);
					return;
				}

				const actions = createCancelablePromise(token => getCodeActions(this._registry, model, trigger.selection, trigger.trigger, Progress.None, token));
				if (trigger.trigger.type === CodeActionTriggerType.Invoke) {
					this._progressService?.showWhile(actions, 250);
				}

				this.setState(new CodeActionsState.Triggered(trigger.trigger, trigger.selection.getStartPosition(), actions));
			}, undefined);
			this._codeActionOracle.value.trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default });
		} else {
			this._supportedCodeActions.reset();
		}
	}

	public trigger(trigger: CodeActionTrigger) {
		this._codeActionOracle.value?.trigger(trigger);
	}

	private setState(newState: CodeActionsState.State, skipNotify?: boolean) {
		if (newState === this._state) {
			return;
		}

		// Cancel old request
		if (this._state.type === CodeActionsState.Type.Triggered) {
			this._state.cancel();
		}

		this._state = newState;

		if (!skipNotify && !this.#isDisposed) {
			this._onDidChangeState.fire(newState);
		}
	}
}
