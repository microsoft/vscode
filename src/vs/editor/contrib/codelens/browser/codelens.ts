/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./codelens';
import { RunOnceScheduler, asWinJsPromise } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposables, IDisposable, dispose } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { format, escape } from 'vs/base/common/strings';
import { TPromise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IMessageService } from 'vs/platform/message/common/message';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { CodeLensProviderRegistry, CodeLensProvider, ICodeLensSymbol, Command } from 'vs/editor/common/modes';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { ICodeLensData, getCodeLensData } from '../common/codelens';


class CodeLensViewZone implements editorBrowser.IViewZone {

	public afterLineNumber: number;
	public heightInLines: number;
	public suppressMouseDown: boolean;

	public domNode: HTMLElement;

	constructor(afterLineNumber: number) {

		this.afterLineNumber = afterLineNumber;
		this.heightInLines = 1;
		this.suppressMouseDown = true;

		this.domNode = document.createElement('div');
	}

	public setAfterLineNumber(afterLineNumber: number): void {
		this.afterLineNumber = afterLineNumber;
	}
}

class CodeLensContentWidget implements editorBrowser.IContentWidget {

	private static ID: number = 0;

	public suppressMouseDown: boolean;

	private _id: string;

	private _domNode: HTMLElement;
	private _subscription: IDisposable;
	private _symbolRange: Range;
	private _widgetPosition: editorBrowser.IContentWidgetPosition;
	private _editor: editorBrowser.ICodeEditor;
	private _commands: { [id: string]: Command } = Object.create(null);

	public constructor(editor: editorBrowser.ICodeEditor, symbolRange: Range,
		commandService: ICommandService, messageService: IMessageService) {

		this._id = 'codeLensWidget' + (++CodeLensContentWidget.ID);
		this._editor = editor;

		this.suppressMouseDown = true;

		this.setSymbolRange(symbolRange);

		this._domNode = document.createElement('span');
		this._domNode.style.height = `${editor.getConfiguration().lineHeight}px`;
		this._domNode.innerHTML = '&nbsp;';
		dom.addClass(this._domNode, 'codelens-decoration');
		dom.addClass(this._domNode, 'invisible-cl');
		this._subscription = dom.addDisposableListener(this._domNode, 'click', e => {
			let element = <HTMLElement>e.target;
			if (element.tagName === 'A' && element.id) {
				let command = this._commands[element.id];
				if (command) {
					editor.focus();
					commandService.executeCommand(command.id, ...command.arguments).done(undefined, err => {
						messageService.show(Severity.Error, err);
					});
				}
			}
		});

		this.updateVisibility();
	}

	public dispose(): void {
		this._subscription.dispose();
		this._symbolRange = null;
	}

	public updateVisibility(): void {
		if (this.isVisible()) {
			dom.removeClass(this._domNode, 'invisible-cl');
			dom.addClass(this._domNode, 'fadein');
		}
	}

	public withCommands(symbols: ICodeLensSymbol[]): void {
		this._commands = Object.create(null);
		if (!symbols || !symbols.length) {
			this._domNode.innerHTML = 'no commands';
			return;
		}

		let html: string[] = [];
		for (let i = 0; i < symbols.length; i++) {
			let command = symbols[i].command;
			let title = escape(command.title);
			let part: string;
			if (command.id) {
				part = format('<a id={0}>{1}</a>', i, title);
				this._commands[i] = command;
			} else {
				part = format('<span>{0}</span>', title);
			}
			html.push(part);
		}

		this._domNode.innerHTML = html.join('<span>&nbsp;|&nbsp;</span>');
		this._editor.layoutContentWidget(this);
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public setSymbolRange(range: Range): void {
		this._symbolRange = range;

		const lineNumber = range.startLineNumber;
		const column = this._editor.getModel().getLineFirstNonWhitespaceColumn(lineNumber);
		this._widgetPosition = {
			position: { lineNumber: lineNumber, column: column },
			preference: [editorBrowser.ContentWidgetPositionPreference.ABOVE]
		};
	}

	public getPosition(): editorBrowser.IContentWidgetPosition {
		return this._widgetPosition;
	}

	public isVisible(): boolean {
		return this._domNode.hasAttribute('monaco-visible-content-widget');
	}
}

interface IDecorationIdCallback {
	(decorationId: string): void;
}

class CodeLensHelper {

	private _removeDecorations: string[];
	private _addDecorations: editorCommon.IModelDeltaDecoration[];
	private _addDecorationsCallbacks: IDecorationIdCallback[];

	constructor() {
		this._removeDecorations = [];
		this._addDecorations = [];
		this._addDecorationsCallbacks = [];
	}

	public addDecoration(decoration: editorCommon.IModelDeltaDecoration, callback: IDecorationIdCallback): void {
		this._addDecorations.push(decoration);
		this._addDecorationsCallbacks.push(callback);
	}

	public removeDecoration(decorationId: string): void {
		this._removeDecorations.push(decorationId);
	}

	public commit(changeAccessor: editorCommon.IModelDecorationsChangeAccessor): void {
		var resultingDecorations = changeAccessor.deltaDecorations(this._removeDecorations, this._addDecorations);
		for (let i = 0, len = resultingDecorations.length; i < len; i++) {
			this._addDecorationsCallbacks[i](resultingDecorations[i]);
		}
	}
}

class CodeLens {

	private _viewZone: CodeLensViewZone;
	private _viewZoneId: number;
	private _contentWidget: CodeLensContentWidget;
	private _decorationIds: string[];
	private _data: ICodeLensData[];
	private _editor: editorBrowser.ICodeEditor;

	public constructor(data: ICodeLensData[], editor: editorBrowser.ICodeEditor,
		helper: CodeLensHelper,
		viewZoneChangeAccessor: editorBrowser.IViewZoneChangeAccessor,
		commandService: ICommandService, messageService: IMessageService) {

		this._editor = editor;
		this._data = data;
		this._decorationIds = new Array<string>(this._data.length);

		let range: editorCommon.IRange;
		this._data.forEach((codeLensData, i) => {

			helper.addDecoration({
				range: codeLensData.symbol.range,
				options: {}
			}, id => this._decorationIds[i] = id);

			// the range contains all lenses on this line
			if (!range) {
				range = codeLensData.symbol.range;
			} else {
				range = Range.plusRange(range, codeLensData.symbol.range);
			}
		});

		this._viewZone = new CodeLensViewZone(range.startLineNumber - 1);
		this._contentWidget = new CodeLensContentWidget(editor, Range.lift(range), commandService, messageService);

		this._viewZoneId = viewZoneChangeAccessor.addZone(this._viewZone);
		this._editor.addContentWidget(this._contentWidget);
	}

	public dispose(helper: CodeLensHelper, viewZoneChangeAccessor: editorBrowser.IViewZoneChangeAccessor): void {
		while (this._decorationIds.length) {
			helper.removeDecoration(this._decorationIds.pop());
		}
		if (viewZoneChangeAccessor) {
			viewZoneChangeAccessor.removeZone(this._viewZoneId);
		}
		this._editor.removeContentWidget(this._contentWidget);

		this._contentWidget.dispose();
	}

	public isValid(): boolean {
		return this._decorationIds.some((id, i) => {
			const range = this._editor.getModel().getDecorationRange(id);
			const symbol = this._data[i].symbol;
			return range && Range.isEmpty(symbol.range) === range.isEmpty();
		});
	}

	public updateCodeLensSymbols(data: ICodeLensData[], helper: CodeLensHelper): void {
		while (this._decorationIds.length) {
			helper.removeDecoration(this._decorationIds.pop());
		}
		this._data = data;
		this._decorationIds = new Array<string>(this._data.length);
		this._data.forEach((codeLensData, i) => {
			helper.addDecoration({
				range: codeLensData.symbol.range,
				options: {}
			}, id => this._decorationIds[i] = id);
		});
	}

	public computeIfNecessary(model: editorCommon.IModel): ICodeLensData[] {
		this._contentWidget.updateVisibility(); // trigger the fade in
		if (!this._contentWidget.isVisible()) {
			return null;
		}

		// Read editor current state
		for (let i = 0; i < this._decorationIds.length; i++) {
			this._data[i].symbol.range = model.getDecorationRange(this._decorationIds[i]);
		}
		return this._data;
	}

	public updateCommands(symbols: ICodeLensSymbol[]): void {
		this._contentWidget.withCommands(symbols);
	}

	public getLineNumber(): number {
		const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);
		if (range) {
			return range.startLineNumber;
		}
		return -1;
	}

	public update(viewZoneChangeAccessor: editorBrowser.IViewZoneChangeAccessor): void {
		if (this.isValid()) {
			const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);

			this._viewZone.setAfterLineNumber(range.startLineNumber - 1);
			viewZoneChangeAccessor.layoutZone(this._viewZoneId);

			this._contentWidget.setSymbolRange(range);
			this._editor.layoutContentWidget(this._contentWidget);
		}
	}
}

@editorContribution
export class CodeLensContribution implements editorCommon.IEditorContribution {

	private static ID: string = 'css.editor.codeLens';

	private _isEnabled: boolean;

	private _globalToDispose: IDisposable[];
	private _localToDispose: IDisposable[];
	private _lenses: CodeLens[];
	private _currentFindCodeLensSymbolsPromise: TPromise<ICodeLensData[]>;
	private _modelChangeCounter: number;
	private _currentFindOccPromise: TPromise<any>;

	constructor(
		private _editor: editorBrowser.ICodeEditor,
		@ICommandService private _commandService: ICommandService,
		@IMessageService private _messageService: IMessageService
	) {
		this._isEnabled = this._editor.getConfiguration().contribInfo.codeLens;

		this._globalToDispose = [];
		this._localToDispose = [];
		this._lenses = [];
		this._currentFindCodeLensSymbolsPromise = null;
		this._modelChangeCounter = 0;

		this._globalToDispose.push(this._editor.onDidChangeModel(() => this.onModelChange()));
		this._globalToDispose.push(this._editor.onDidChangeModelLanguage(() => this.onModelChange()));
		this._globalToDispose.push(this._editor.onDidChangeConfiguration((e: editorCommon.IConfigurationChangedEvent) => {
			let prevIsEnabled = this._isEnabled;
			this._isEnabled = this._editor.getConfiguration().contribInfo.codeLens;
			if (prevIsEnabled !== this._isEnabled) {
				this.onModelChange();
			}
		}));
		this._globalToDispose.push(CodeLensProviderRegistry.onDidChange(this.onModelChange, this));
		this.onModelChange();
	}

	public dispose(): void {
		this.localDispose();
		this._globalToDispose = dispose(this._globalToDispose);
	}

	private localDispose(): void {
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

	public getId(): string {
		return CodeLensContribution.ID;
	}

	private onModelChange(): void {

		this.localDispose();

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

		const providerSubscriptions = new Disposables();
		this._localToDispose.push(providerSubscriptions);

		const onEvent = () => {
			providerSubscriptions.dispose();
			scheduler.schedule();
		};

		const subscribeToProviders = (result: ICodeLensData[]) => {
			const seen = new Set<CodeLensProvider>();

			for (const {provider} of result) {
				if (provider.onDidChange && !seen.has(provider)) {
					providerSubscriptions.add(provider.onDidChange(onEvent));
					seen.add(provider);
				}
			}
		};

		const detectVisible = new RunOnceScheduler(() => {
			this._onViewportChanged(model.getLanguageIdentifier().language);
		}, 500);

		const scheduler = new RunOnceScheduler(() => {
			if (this._currentFindCodeLensSymbolsPromise) {
				this._currentFindCodeLensSymbolsPromise.cancel();
			}

			this._currentFindCodeLensSymbolsPromise = getCodeLensData(model);

			const counterValue = ++this._modelChangeCounter;
			this._currentFindCodeLensSymbolsPromise.then((result) => {
				if (counterValue === this._modelChangeCounter) { // only the last one wins
					this.renderCodeLensSymbols(result);
					subscribeToProviders(result);
					detectVisible.schedule();
				}
			}, (error) => {
				onUnexpectedError(error);
			});
		}, 250);
		this._localToDispose.push(scheduler);
		this._localToDispose.push(detectVisible);
		this._localToDispose.push(model.addBulkListener((events) => {
			let hadChange = false;
			for (let i = 0; i < events.length; i++) {
				const eventType = events[i].getType();
				if (eventType === editorCommon.EventType.ModelRawContentChanged) {
					hadChange = true;
					break;
				}
			}
			if (hadChange) {
				this._editor.changeDecorations((changeAccessor) => {
					this._editor.changeViewZones((viewAccessor) => {
						const toDispose: CodeLens[] = [];
						this._lenses.forEach((lens) => {
							if (lens.isValid()) {
								lens.update(viewAccessor);
							} else {
								toDispose.push(lens);
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
				detectVisible.schedule();
				// Ask for all references again
				scheduler.schedule();
			}
		}));
		this._localToDispose.push(this._editor.onDidScrollChange((e) => {
			if (e.scrollTopChanged) {
				detectVisible.schedule();
			}
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

	private _disposeAllLenses(decChangeAccessor: editorCommon.IModelDecorationsChangeAccessor, viewZoneChangeAccessor: editorBrowser.IViewZoneChangeAccessor): void {
		let helper = new CodeLensHelper();
		this._lenses.forEach((lens) => lens.dispose(helper, viewZoneChangeAccessor));
		if (decChangeAccessor) {
			helper.commit(decChangeAccessor);
		}
		this._lenses = [];
	}

	private renderCodeLensSymbols(symbols: ICodeLensData[]): void {
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

		let centeredRange = this._editor.getCenteredRangeInViewport();
		let shouldRestoreCenteredRange = (groups.length !== this._lenses.length && this._editor.getScrollTop() !== 0);
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
						this._lenses.splice(codeLensIndex, 0, new CodeLens(groups[groupsIndex], this._editor, helper, accessor, this._commandService, this._messageService));
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
					this._lenses.push(new CodeLens(groups[groupsIndex], this._editor, helper, accessor, this._commandService, this._messageService));
					groupsIndex++;
				}

				helper.commit(changeAccessor);
			});
		});
		if (shouldRestoreCenteredRange) {
			this._editor.revealRangeInCenter(centeredRange);
		}
	}

	private _onViewportChanged(modeId: string): void {
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
