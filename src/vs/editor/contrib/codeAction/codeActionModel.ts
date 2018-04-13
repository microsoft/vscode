/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

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
import { CodeActionKind, CodeActionTrigger } from './codeActionTrigger';
import { getCodeActions } from './codeAction';

export const HAS_REFACTOR_PROVIDER = new RawContextKey<boolean>('hasRefactorProvider', false);
export const HAS_SOURCE_ACTION_PROVIDER = new RawContextKey<boolean>('hasSourceActionProvider', false);

export class QuickFixOracle {

	private _disposables: IDisposable[] = [];

	constructor(
		private _editor: ICodeEditor,
		private _markerService: IMarkerService,
		private _signalChange: (e: QuickFixComputeEvent) => any,
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
		let rangeOrSelection = this._getRangeOfMarker() || this._getRangeOfSelectionUnlessWhitespaceEnclosed();
		if (!rangeOrSelection && trigger.type === 'manual') {
			rangeOrSelection = this._editor.getSelection();
		}
		return this._createEventAndSignalChange(trigger, rangeOrSelection);
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

	private _getRangeOfMarker(): Range {
		const selection = this._editor.getSelection();
		const model = this._editor.getModel();
		for (const marker of this._markerService.read({ resource: model.uri })) {
			if (Range.intersectRanges(marker, selection)) {
				return Range.lift(marker);
			}
		}
		return undefined;
	}

	private _getRangeOfSelectionUnlessWhitespaceEnclosed(): Selection {
		const model = this._editor.getModel();
		const selection = this._editor.getSelection();
		if (selection.isEmpty()) {
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

	private _createEventAndSignalChange(trigger: CodeActionTrigger, rangeOrSelection: Range | Selection): TPromise<CodeAction[] | undefined> {
		if (!rangeOrSelection) {
			// cancel
			this._signalChange({
				trigger,
				range: undefined,
				position: undefined,
				fixes: undefined,
			});
			return TPromise.as(undefined);
		} else {
			// actual
			const model = this._editor.getModel();
			const range = model.validateRange(rangeOrSelection);
			const position = rangeOrSelection instanceof Selection ? rangeOrSelection.getPosition() : rangeOrSelection.getStartPosition();
			const fixes = getCodeActions(model, range, trigger && trigger.filter);

			this._signalChange({
				trigger,
				range,
				position,
				fixes
			});
			return fixes;
		}
	}
}

export interface QuickFixComputeEvent {
	trigger: CodeActionTrigger;
	range: Range;
	position: Position;
	fixes: TPromise<CodeAction[]>;
}

export class QuickFixModel {

	private _editor: ICodeEditor;
	private _markerService: IMarkerService;
	private _quickFixOracle: QuickFixOracle;
	private _onDidChangeFixes = new Emitter<QuickFixComputeEvent>();
	private _disposables: IDisposable[] = [];
	private readonly _hasRefactorProvider: IContextKey<boolean>;
	private readonly _hasSourceProvider: IContextKey<boolean>;

	constructor(editor: ICodeEditor, markerService: IMarkerService, contextKeyService: IContextKeyService) {
		this._editor = editor;
		this._markerService = markerService;

		this._hasRefactorProvider = HAS_REFACTOR_PROVIDER.bindTo(contextKeyService);
		this._hasSourceProvider = HAS_SOURCE_ACTION_PROVIDER.bindTo(contextKeyService);

		this._disposables.push(this._editor.onDidChangeModel(() => this._update()));
		this._disposables.push(this._editor.onDidChangeModelLanguage(() => this._update()));
		this._disposables.push(CodeActionProviderRegistry.onDidChange(this._update, this));

		this._update();
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
		dispose(this._quickFixOracle);
	}

	get onDidChangeFixes(): Event<QuickFixComputeEvent> {
		return this._onDidChangeFixes.event;
	}

	private _update(): void {

		if (this._quickFixOracle) {
			this._quickFixOracle.dispose();
			this._quickFixOracle = undefined;
			this._onDidChangeFixes.fire(undefined);
		}

		if (this._editor.getModel()
			&& CodeActionProviderRegistry.has(this._editor.getModel())
			&& !this._editor.getConfiguration().readOnly) {

			let hasRefactorProvider = false;
			let hasSourceProvider = false;
			outer: for (const provider of CodeActionProviderRegistry.all(this._editor.getModel())) {
				if (!provider.providedCodeActionKinds) {
					continue;
				}
				for (const providedKind of provider.providedCodeActionKinds) {
					hasRefactorProvider = hasRefactorProvider || CodeActionKind.Refactor.contains(providedKind);
					hasSourceProvider = hasSourceProvider || CodeActionKind.Source.contains(providedKind);
					if (hasRefactorProvider && hasSourceProvider) {
						break outer;
					}
				}
			}

			this._hasRefactorProvider.set(hasRefactorProvider);
			this._hasSourceProvider.set(hasSourceProvider);

			this._quickFixOracle = new QuickFixOracle(this._editor, this._markerService, p => this._onDidChangeFixes.fire(p));
			this._quickFixOracle.trigger({ type: 'auto' });
		} else {
			this._hasRefactorProvider.reset();
		}
	}

	trigger(trigger: CodeActionTrigger): TPromise<CodeAction[] | undefined> {
		if (this._quickFixOracle) {
			return this._quickFixOracle.trigger(trigger);
		}
		return TPromise.as(undefined);
	}
}
