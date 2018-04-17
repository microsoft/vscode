/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { RunOnceScheduler, asWinJsPromise } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Position } from 'vs/editor/common/core/position';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { CodeLensProviderRegistry, ICodeLensSymbol } from 'vs/editor/common/modes';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeLensData, getCodeLensData } from './codelens';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';
import { CodeLens, CodeLensHelper } from 'vs/editor/contrib/codelens/codelensWidget';
import { IModelDecorationsChangeAccessor } from 'vs/editor/common/model';
import { INotificationService } from 'vs/platform/notification/common/notification';

export class CodeLensContribution implements editorCommon.IEditorContribution {

	private static readonly ID: string = 'css.editor.codeLens';

	private _isEnabled: boolean;

	private _globalToDispose: IDisposable[];
	private _localToDispose: IDisposable[];
	private _lenses: CodeLens[];
	private _currentFindCodeLensSymbolsPromise: TPromise<ICodeLensData[]>;
	private _modelChangeCounter: number;
	private _currentFindOccPromise: TPromise<any>;
	private _detectVisibleLenses: RunOnceScheduler;

	constructor(
		private _editor: editorBrowser.ICodeEditor,
		@ICommandService private readonly _commandService: ICommandService,
		@INotificationService private readonly _notificationService: INotificationService
	) {
		this._isEnabled = this._editor.getConfiguration().contribInfo.codeLens;

		this._globalToDispose = [];
		this._localToDispose = [];
		this._lenses = [];
		this._currentFindCodeLensSymbolsPromise = null;
		this._modelChangeCounter = 0;

		this._globalToDispose.push(this._editor.onDidChangeModel(() => this._onModelChange()));
		this._globalToDispose.push(this._editor.onDidChangeModelLanguage(() => this._onModelChange()));
		this._globalToDispose.push(this._editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			let prevIsEnabled = this._isEnabled;
			this._isEnabled = this._editor.getConfiguration().contribInfo.codeLens;
			if (prevIsEnabled !== this._isEnabled) {
				this._onModelChange();
			}
		}));
		this._globalToDispose.push(CodeLensProviderRegistry.onDidChange(this._onModelChange, this));
		this._onModelChange();
	}

	dispose(): void {
		this._localDispose();
		this._globalToDispose = dispose(this._globalToDispose);
	}

	private _localDispose(): void {
		if (this._currentFindCodeLensSymbolsPromise) {
			this._currentFindCodeLensSymbolsPromise.cancel();
			this._currentFindCodeLensSymbolsPromise = null;
			this._modelChangeCounter++;
		}
		if (this._currentFindOccPromise) {
			this._currentFindOccPromise.cancel();
			this._currentFindOccPromise = null;
		}
		this._localToDispose = dispose(this._localToDispose);
	}

	getId(): string {
		return CodeLensContribution.ID;
	}

	private _onModelChange(): void {

		this._localDispose();

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		if (!this._isEnabled) {
			return;
		}

		if (!CodeLensProviderRegistry.has(model)) {
			return;
		}

		for (const provider of CodeLensProviderRegistry.all(model)) {
			if (typeof provider.onDidChange === 'function') {
				let registration = provider.onDidChange(() => scheduler.schedule());
				this._localToDispose.push(registration);
			}
		}

		this._detectVisibleLenses = new RunOnceScheduler(() => {
			this._onViewportChanged();
		}, 500);

		const scheduler = new RunOnceScheduler(() => {
			const counterValue = ++this._modelChangeCounter;
			if (this._currentFindCodeLensSymbolsPromise) {
				this._currentFindCodeLensSymbolsPromise.cancel();
			}

			this._currentFindCodeLensSymbolsPromise = getCodeLensData(model);

			this._currentFindCodeLensSymbolsPromise.then((result) => {
				if (counterValue === this._modelChangeCounter) { // only the last one wins
					this._renderCodeLensSymbols(result);
					this._detectVisibleLenses.schedule();
				}
			}, onUnexpectedError);
		}, 250);
		this._localToDispose.push(scheduler);
		this._localToDispose.push(this._detectVisibleLenses);
		this._localToDispose.push(this._editor.onDidChangeModelContent((e) => {
			this._editor.changeDecorations((changeAccessor) => {
				this._editor.changeViewZones((viewAccessor) => {
					let toDispose: CodeLens[] = [];
					let lastLensLineNumber: number = -1;

					this._lenses.forEach((lens) => {
						if (!lens.isValid() || lastLensLineNumber === lens.getLineNumber()) {
							// invalid -> lens collapsed, attach range doesn't exist anymore
							// line_number -> lenses should never be on the same line
							toDispose.push(lens);

						} else {
							lens.update(viewAccessor);
							lastLensLineNumber = lens.getLineNumber();
						}
					});

					let helper = new CodeLensHelper();
					toDispose.forEach((l) => {
						l.dispose(helper, viewAccessor);
						this._lenses.splice(this._lenses.indexOf(l), 1);
					});
					helper.commit(changeAccessor);
				});
			});

			// Compute new `visible` code lenses
			this._detectVisibleLenses.schedule();
			// Ask for all references again
			scheduler.schedule();
		}));
		this._localToDispose.push(this._editor.onDidScrollChange(e => {
			if (e.scrollTopChanged && this._lenses.length > 0) {
				this._detectVisibleLenses.schedule();
			}
		}));
		this._localToDispose.push(this._editor.onDidLayoutChange(e => {
			this._detectVisibleLenses.schedule();
		}));
		this._localToDispose.push({
			dispose: () => {
				if (this._editor.getModel()) {
					this._editor.changeDecorations((changeAccessor) => {
						this._editor.changeViewZones((accessor) => {
							this._disposeAllLenses(changeAccessor, accessor);
						});
					});
				} else {
					// No accessors available
					this._disposeAllLenses(null, null);
				}
			}
		});

		scheduler.schedule();
	}

	private _disposeAllLenses(decChangeAccessor: IModelDecorationsChangeAccessor, viewZoneChangeAccessor: editorBrowser.IViewZoneChangeAccessor): void {
		let helper = new CodeLensHelper();
		this._lenses.forEach((lens) => lens.dispose(helper, viewZoneChangeAccessor));
		if (decChangeAccessor) {
			helper.commit(decChangeAccessor);
		}
		this._lenses = [];
	}

	private _renderCodeLensSymbols(symbols: ICodeLensData[]): void {
		if (!this._editor.getModel()) {
			return;
		}

		let maxLineNumber = this._editor.getModel().getLineCount();
		let groups: ICodeLensData[][] = [];
		let lastGroup: ICodeLensData[];

		for (let symbol of symbols) {
			let line = symbol.symbol.range.startLineNumber;
			if (line < 1 || line > maxLineNumber) {
				// invalid code lens
				continue;
			} else if (lastGroup && lastGroup[lastGroup.length - 1].symbol.range.startLineNumber === line) {
				// on same line as previous
				lastGroup.push(symbol);
			} else {
				// on later line as previous
				lastGroup = [symbol];
				groups.push(lastGroup);
			}
		}

		let visiblePosition: Position = null;
		let visiblePositionScrollDelta = 0;
		if (this._editor.getScrollTop() !== 0) {
			const visibleRanges = this._editor.getVisibleRanges();
			if (visibleRanges.length > 0) {
				visiblePosition = visibleRanges[0].getStartPosition();
				const visiblePositionScrollTop = this._editor.getTopForPosition(visiblePosition.lineNumber, visiblePosition.column);
				visiblePositionScrollDelta = this._editor.getScrollTop() - visiblePositionScrollTop;
			}
		}

		this._editor.changeDecorations((changeAccessor) => {
			this._editor.changeViewZones((accessor) => {

				let codeLensIndex = 0, groupsIndex = 0, helper = new CodeLensHelper();

				while (groupsIndex < groups.length && codeLensIndex < this._lenses.length) {

					let symbolsLineNumber = groups[groupsIndex][0].symbol.range.startLineNumber;
					let codeLensLineNumber = this._lenses[codeLensIndex].getLineNumber();

					if (codeLensLineNumber < symbolsLineNumber) {
						this._lenses[codeLensIndex].dispose(helper, accessor);
						this._lenses.splice(codeLensIndex, 1);
					} else if (codeLensLineNumber === symbolsLineNumber) {
						this._lenses[codeLensIndex].updateCodeLensSymbols(groups[groupsIndex], helper);
						groupsIndex++;
						codeLensIndex++;
					} else {
						this._lenses.splice(codeLensIndex, 0, new CodeLens(groups[groupsIndex], this._editor, helper, accessor, this._commandService, this._notificationService, () => this._detectVisibleLenses.schedule()));
						codeLensIndex++;
						groupsIndex++;
					}
				}

				// Delete extra code lenses
				while (codeLensIndex < this._lenses.length) {
					this._lenses[codeLensIndex].dispose(helper, accessor);
					this._lenses.splice(codeLensIndex, 1);
				}

				// Create extra symbols
				while (groupsIndex < groups.length) {
					this._lenses.push(new CodeLens(groups[groupsIndex], this._editor, helper, accessor, this._commandService, this._notificationService, () => this._detectVisibleLenses.schedule()));
					groupsIndex++;
				}

				helper.commit(changeAccessor);
			});
		});

		if (visiblePosition) {
			const visiblePositionScrollTop = this._editor.getTopForPosition(visiblePosition.lineNumber, visiblePosition.column);
			this._editor.setScrollTop(visiblePositionScrollTop + visiblePositionScrollDelta);
		}
	}

	private _onViewportChanged(): void {
		if (this._currentFindOccPromise) {
			this._currentFindOccPromise.cancel();
			this._currentFindOccPromise = null;
		}

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const toResolve: ICodeLensData[][] = [];
		const lenses: CodeLens[] = [];
		this._lenses.forEach((lens) => {
			const request = lens.computeIfNecessary(model);
			if (request) {
				toResolve.push(request);
				lenses.push(lens);
			}
		});

		if (toResolve.length === 0) {
			return;
		}

		const promises = toResolve.map((request, i) => {

			const resolvedSymbols = new Array<ICodeLensSymbol>(request.length);
			const promises = request.map((request, i) => {
				return asWinJsPromise((token) => {
					return request.provider.resolveCodeLens(model, request.symbol, token);
				}).then(symbol => {
					resolvedSymbols[i] = symbol;
				});
			});

			return TPromise.join(promises).then(() => {
				lenses[i].updateCommands(resolvedSymbols);
			});
		});

		this._currentFindOccPromise = TPromise.join(promises).then(() => {
			this._currentFindOccPromise = null;
		});
	}
}

registerEditorContribution(CodeLensContribution);
