/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event, debounceEvent } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { CodeAction, CodeActionProviderRegistry } from 'vs/editor/common/modes';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { getCodeActions } from './codeAction';
import { CodeActionTrigger } from './codeActionTrigger';

export const SUPPORTED_CODE_ACTIONS = new RawContextKey<string>('supportedCodeAction', '');

export class CodeActionOracle {

	private _disposables: IDisposable[] = [];

	constructor(
		private _editor: ICodeEditor,
		private _markerService: IMarkerService,
		private _signalChange: (e: CodeActionsComputeEvent) => any,
		delay: number = 250
	) {
		this._disposables.push(
			debounceEvent(this._markerService.onMarkerChanged, (last, cur) => last ? last.concat(cur) : cur, delay / 2)(e => this._onMarkerChanges(e)),
			debounceEvent(this._editor.onDidChangeCursorPosition, (last, cur) => cur, delay)(e => this._onCursorChange())
		);
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
	}

	trigger(trigger: CodeActionTrigger) {
		const selection = this._getRangeOfSelectionUnlessWhitespaceEnclosed(trigger);
		return this._createEventAndSignalChange(trigger, selection);
	}

	private _onMarkerChanges(resources: URI[]): void {
		const { uri } = this._editor.getModel();
		for (const resource of resources) {
			if (resource.toString() === uri.toString()) {
				this.trigger({ type: 'auto' });
				return;
			}
		}
	}

	private _onCursorChange(): void {
		this.trigger({ type: 'auto' });
	}

	private _getRangeOfMarker(selection: Selection): Range {
		const model = this._editor.getModel();
		for (const marker of this._markerService.read({ resource: model.uri })) {
			if (Range.intersectRanges(marker, selection)) {
				return Range.lift(marker);
			}
		}
		return undefined;
	}

	private _getRangeOfSelectionUnlessWhitespaceEnclosed(trigger: CodeActionTrigger): Selection | undefined {
		const model = this._editor.getModel();
		const selection = this._editor.getSelection();
		if (selection.isEmpty() && !(trigger.filter && trigger.filter.includeSourceActions)) {
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

	private _createEventAndSignalChange(trigger: CodeActionTrigger, selection: Selection | undefined): TPromise<CodeAction[] | undefined> {
		if (!selection) {
			// cancel
			this._signalChange({
				trigger,
				rangeOrSelection: undefined,
				position: undefined,
				actions: undefined,
			});
			return TPromise.as(undefined);
		} else {
			const model = this._editor.getModel();
			const markerRange = this._getRangeOfMarker(selection);
			const position = markerRange ? markerRange.getStartPosition() : selection.getStartPosition();
			const actions = getCodeActions(model, selection, trigger && trigger.filter);

			this._signalChange({
				trigger,
				rangeOrSelection: selection,
				position,
				actions
			});
			return actions;
		}
	}
}

export interface CodeActionsComputeEvent {
	trigger: CodeActionTrigger;
	rangeOrSelection: Range | Selection;
	position: Position;
	actions: TPromise<CodeAction[]>;
}

export class CodeActionModel {

	private _editor: ICodeEditor;
	private _markerService: IMarkerService;
	private _codeActionOracle: CodeActionOracle;
	private _onDidChangeFixes = new Emitter<CodeActionsComputeEvent>();
	private _disposables: IDisposable[] = [];
	private readonly _supportedCodeActions: IContextKey<string>;

	constructor(editor: ICodeEditor, markerService: IMarkerService, contextKeyService: IContextKeyService) {
		this._editor = editor;
		this._markerService = markerService;

		this._supportedCodeActions = SUPPORTED_CODE_ACTIONS.bindTo(contextKeyService);

		this._disposables.push(this._editor.onDidChangeModel(() => this._update()));
		this._disposables.push(this._editor.onDidChangeModelLanguage(() => this._update()));
		this._disposables.push(CodeActionProviderRegistry.onDidChange(this._update, this));

		this._update();
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
		dispose(this._codeActionOracle);
	}

	get onDidChangeFixes(): Event<CodeActionsComputeEvent> {
		return this._onDidChangeFixes.event;
	}

	private _update(): void {

		if (this._codeActionOracle) {
			this._codeActionOracle.dispose();
			this._codeActionOracle = undefined;
			this._onDidChangeFixes.fire(undefined);
		}

		if (this._editor.getModel()
			&& CodeActionProviderRegistry.has(this._editor.getModel())
			&& !this._editor.getConfiguration().readOnly) {

			const supportedActions: string[] = [];
			for (const provider of CodeActionProviderRegistry.all(this._editor.getModel())) {
				if (Array.isArray(provider.providedCodeActionKinds)) {
					supportedActions.push(...provider.providedCodeActionKinds);
				}
			}

			this._supportedCodeActions.set(supportedActions.join(' '));

			this._codeActionOracle = new CodeActionOracle(this._editor, this._markerService, p => this._onDidChangeFixes.fire(p));
			this._codeActionOracle.trigger({ type: 'auto' });
		} else {
			this._supportedCodeActions.reset();
		}
	}

	trigger(trigger: CodeActionTrigger): TPromise<CodeAction[] | undefined> {
		if (this._codeActionOracle) {
			return this._codeActionOracle.trigger(trigger);
		}
		return TPromise.as(undefined);
	}
}
