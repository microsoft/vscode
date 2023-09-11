/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { CancelablePromise, createCancelablePromise, disposableTimeout, RunOnceScheduler } from 'vs/base/common/async';
import { onUnexpectedError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { StableEditorScrollState } from 'vs/editor/browser/stableEditorScroll';
import { IActiveCodeEditor, ICodeEditor, IViewZoneChangeAccessor, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorOption, EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IModelDecorationsChangeAccessor } from 'vs/editor/common/model';
import { CodeLens, Command } from 'vs/editor/common/languages';
import { CodeLensItem, CodeLensModel, getCodeLensModel } from 'vs/editor/contrib/codelens/browser/codelens';
import { ICodeLensCache } from 'vs/editor/contrib/codelens/browser/codeLensCache';
import { CodeLensHelper, CodeLensWidget } from 'vs/editor/contrib/codelens/browser/codelensWidget';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';

export class CodeLensContribution implements IEditorContribution {

	static readonly ID: string = 'css.editor.codeLens';

	private readonly _disposables = new DisposableStore();
	private readonly _localToDispose = new DisposableStore();

	private readonly _lenses: CodeLensWidget[] = [];

	private readonly _provideCodeLensDebounce: IFeatureDebounceInformation;
	private readonly _resolveCodeLensesDebounce: IFeatureDebounceInformation;
	private readonly _resolveCodeLensesScheduler: RunOnceScheduler;

	private _getCodeLensModelPromise: CancelablePromise<CodeLensModel> | undefined;
	private _oldCodeLensModels = new DisposableStore();
	private _currentCodeLensModel: CodeLensModel | undefined;
	private _resolveCodeLensesPromise: CancelablePromise<any> | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageFeatureDebounceService debounceService: ILanguageFeatureDebounceService,
		@ICommandService private readonly _commandService: ICommandService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ICodeLensCache private readonly _codeLensCache: ICodeLensCache
	) {
		this._provideCodeLensDebounce = debounceService.for(_languageFeaturesService.codeLensProvider, 'CodeLensProvide', { min: 250 });
		this._resolveCodeLensesDebounce = debounceService.for(_languageFeaturesService.codeLensProvider, 'CodeLensResolve', { min: 250, salt: 'resolve' });
		this._resolveCodeLensesScheduler = new RunOnceScheduler(() => this._resolveCodeLensesInViewport(), this._resolveCodeLensesDebounce.default());

		this._disposables.add(this._editor.onDidChangeModel(() => this._onModelChange()));
		this._disposables.add(this._editor.onDidChangeModelLanguage(() => this._onModelChange()));
		this._disposables.add(this._editor.onDidChangeConfiguration((e) => {
			if (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.codeLensFontSize) || e.hasChanged(EditorOption.codeLensFontFamily)) {
				this._updateLensStyle();
			}
			if (e.hasChanged(EditorOption.codeLens)) {
				this._onModelChange();
			}
		}));
		this._disposables.add(_languageFeaturesService.codeLensProvider.onDidChange(this._onModelChange, this));
		this._onModelChange();

		this._updateLensStyle();
	}

	dispose(): void {
		this._localDispose();
		this._disposables.dispose();
		this._oldCodeLensModels.dispose();
		this._currentCodeLensModel?.dispose();
	}

	private _getLayoutInfo() {
		const lineHeightFactor = Math.max(1.3, this._editor.getOption(EditorOption.lineHeight) / this._editor.getOption(EditorOption.fontSize));
		let fontSize = this._editor.getOption(EditorOption.codeLensFontSize);
		if (!fontSize || fontSize < 5) {
			fontSize = (this._editor.getOption(EditorOption.fontSize) * .9) | 0;
		}
		return {
			fontSize,
			codeLensHeight: (fontSize * lineHeightFactor) | 0,
		};
	}

	private _updateLensStyle(): void {

		const { codeLensHeight, fontSize } = this._getLayoutInfo();
		const fontFamily = this._editor.getOption(EditorOption.codeLensFontFamily);
		const editorFontInfo = this._editor.getOption(EditorOption.fontInfo);

		const { style } = this._editor.getContainerDomNode();

		style.setProperty('--vscode-editorCodeLens-lineHeight', `${codeLensHeight}px`);
		style.setProperty('--vscode-editorCodeLens-fontSize', `${fontSize}px`);
		style.setProperty('--vscode-editorCodeLens-fontFeatureSettings', editorFontInfo.fontFeatureSettings);

		if (fontFamily) {
			style.setProperty('--vscode-editorCodeLens-fontFamily', fontFamily);
			style.setProperty('--vscode-editorCodeLens-fontFamilyDefault', EDITOR_FONT_DEFAULTS.fontFamily);
		}

		//
		this._editor.changeViewZones(accessor => {
			for (const lens of this._lenses) {
				lens.updateHeight(codeLensHeight, accessor);
			}
		});
	}

	private _localDispose(): void {
		this._getCodeLensModelPromise?.cancel();
		this._getCodeLensModelPromise = undefined;
		this._resolveCodeLensesPromise?.cancel();
		this._resolveCodeLensesPromise = undefined;
		this._localToDispose.clear();
		this._oldCodeLensModels.clear();
		this._currentCodeLensModel?.dispose();
	}

	private _onModelChange(): void {

		this._localDispose();

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		if (!this._editor.getOption(EditorOption.codeLens)) {
			return;
		}

		const cachedLenses = this._codeLensCache.get(model);
		if (cachedLenses) {
			this._renderCodeLensSymbols(cachedLenses);
		}

		if (!this._languageFeaturesService.codeLensProvider.has(model)) {
			// no provider -> return but check with
			// cached lenses. they expire after 30 seconds
			if (cachedLenses) {
				this._localToDispose.add(disposableTimeout(() => {
					const cachedLensesNow = this._codeLensCache.get(model);
					if (cachedLenses === cachedLensesNow) {
						this._codeLensCache.delete(model);
						this._onModelChange();
					}
				}, 30 * 1000));
			}
			return;
		}

		for (const provider of this._languageFeaturesService.codeLensProvider.all(model)) {
			if (typeof provider.onDidChange === 'function') {
				const registration = provider.onDidChange(() => scheduler.schedule());
				this._localToDispose.add(registration);
			}
		}

		const scheduler = new RunOnceScheduler(() => {
			const t1 = Date.now();

			this._getCodeLensModelPromise?.cancel();
			this._getCodeLensModelPromise = createCancelablePromise(token => getCodeLensModel(this._languageFeaturesService.codeLensProvider, model, token));

			this._getCodeLensModelPromise.then(result => {
				if (this._currentCodeLensModel) {
					this._oldCodeLensModels.add(this._currentCodeLensModel);
				}
				this._currentCodeLensModel = result;

				// cache model to reduce flicker
				this._codeLensCache.put(model, result);

				// update moving average
				const newDelay = this._provideCodeLensDebounce.update(model, Date.now() - t1);
				scheduler.delay = newDelay;

				// render lenses
				this._renderCodeLensSymbols(result);
				// dom.scheduleAtNextAnimationFrame(() => this._resolveCodeLensesInViewport());
				this._resolveCodeLensesInViewportSoon();
			}, onUnexpectedError);

		}, this._provideCodeLensDebounce.get(model));

		this._localToDispose.add(scheduler);
		this._localToDispose.add(toDisposable(() => this._resolveCodeLensesScheduler.cancel()));
		this._localToDispose.add(this._editor.onDidChangeModelContent(() => {
			this._editor.changeDecorations(decorationsAccessor => {
				this._editor.changeViewZones(viewZonesAccessor => {
					const toDispose: CodeLensWidget[] = [];
					let lastLensLineNumber: number = -1;

					this._lenses.forEach((lens) => {
						if (!lens.isValid() || lastLensLineNumber === lens.getLineNumber()) {
							// invalid -> lens collapsed, attach range doesn't exist anymore
							// line_number -> lenses should never be on the same line
							toDispose.push(lens);

						} else {
							lens.update(viewZonesAccessor);
							lastLensLineNumber = lens.getLineNumber();
						}
					});

					const helper = new CodeLensHelper();
					toDispose.forEach((l) => {
						l.dispose(helper, viewZonesAccessor);
						this._lenses.splice(this._lenses.indexOf(l), 1);
					});
					helper.commit(decorationsAccessor);
				});
			});

			// Ask for all references again
			scheduler.schedule();

			// Cancel pending and active resolve requests
			this._resolveCodeLensesScheduler.cancel();
			this._resolveCodeLensesPromise?.cancel();
			this._resolveCodeLensesPromise = undefined;
		}));
		this._localToDispose.add(this._editor.onDidFocusEditorWidget(() => {
			scheduler.schedule();
		}));
		this._localToDispose.add(this._editor.onDidBlurEditorText(() => {
			scheduler.cancel();
		}));
		this._localToDispose.add(this._editor.onDidScrollChange(e => {
			if (e.scrollTopChanged && this._lenses.length > 0) {
				this._resolveCodeLensesInViewportSoon();
			}
		}));
		this._localToDispose.add(this._editor.onDidLayoutChange(() => {
			this._resolveCodeLensesInViewportSoon();
		}));
		this._localToDispose.add(toDisposable(() => {
			if (this._editor.getModel()) {
				const scrollState = StableEditorScrollState.capture(this._editor);
				this._editor.changeDecorations(decorationsAccessor => {
					this._editor.changeViewZones(viewZonesAccessor => {
						this._disposeAllLenses(decorationsAccessor, viewZonesAccessor);
					});
				});
				scrollState.restore(this._editor);
			} else {
				// No accessors available
				this._disposeAllLenses(undefined, undefined);
			}
		}));
		this._localToDispose.add(this._editor.onMouseDown(e => {
			if (e.target.type !== MouseTargetType.CONTENT_WIDGET) {
				return;
			}
			let target = e.target.element;
			if (target?.tagName === 'SPAN') {
				target = target.parentElement;
			}
			if (target?.tagName === 'A') {
				for (const lens of this._lenses) {
					const command = lens.getCommand(target as HTMLLinkElement);
					if (command) {
						this._commandService.executeCommand(command.id, ...(command.arguments || [])).catch(err => this._notificationService.error(err));
						break;
					}
				}
			}
		}));
		scheduler.schedule();
	}

	private _disposeAllLenses(decChangeAccessor: IModelDecorationsChangeAccessor | undefined, viewZoneChangeAccessor: IViewZoneChangeAccessor | undefined): void {
		const helper = new CodeLensHelper();
		for (const lens of this._lenses) {
			lens.dispose(helper, viewZoneChangeAccessor);
		}
		if (decChangeAccessor) {
			helper.commit(decChangeAccessor);
		}
		this._lenses.length = 0;
	}

	private _renderCodeLensSymbols(symbols: CodeLensModel): void {
		if (!this._editor.hasModel()) {
			return;
		}

		const maxLineNumber = this._editor.getModel().getLineCount();
		const groups: CodeLensItem[][] = [];
		let lastGroup: CodeLensItem[] | undefined;

		for (const symbol of symbols.lenses) {
			const line = symbol.symbol.range.startLineNumber;
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

		if (!groups.length && !this._lenses.length) {
			// Nothing to change
			return;
		}

		const scrollState = StableEditorScrollState.capture(this._editor);
		const layoutInfo = this._getLayoutInfo();

		this._editor.changeDecorations(decorationsAccessor => {
			this._editor.changeViewZones(viewZoneAccessor => {

				const helper = new CodeLensHelper();
				let codeLensIndex = 0;
				let groupsIndex = 0;

				while (groupsIndex < groups.length && codeLensIndex < this._lenses.length) {

					const symbolsLineNumber = groups[groupsIndex][0].symbol.range.startLineNumber;
					const codeLensLineNumber = this._lenses[codeLensIndex].getLineNumber();

					if (codeLensLineNumber < symbolsLineNumber) {
						this._lenses[codeLensIndex].dispose(helper, viewZoneAccessor);
						this._lenses.splice(codeLensIndex, 1);
					} else if (codeLensLineNumber === symbolsLineNumber) {
						this._lenses[codeLensIndex].updateCodeLensSymbols(groups[groupsIndex], helper);
						groupsIndex++;
						codeLensIndex++;
					} else {
						this._lenses.splice(codeLensIndex, 0, new CodeLensWidget(groups[groupsIndex], <IActiveCodeEditor>this._editor, helper, viewZoneAccessor, layoutInfo.codeLensHeight, () => this._resolveCodeLensesInViewportSoon()));
						codeLensIndex++;
						groupsIndex++;
					}
				}

				// Delete extra code lenses
				while (codeLensIndex < this._lenses.length) {
					this._lenses[codeLensIndex].dispose(helper, viewZoneAccessor);
					this._lenses.splice(codeLensIndex, 1);
				}

				// Create extra symbols
				while (groupsIndex < groups.length) {
					this._lenses.push(new CodeLensWidget(groups[groupsIndex], <IActiveCodeEditor>this._editor, helper, viewZoneAccessor, layoutInfo.codeLensHeight, () => this._resolveCodeLensesInViewportSoon()));
					groupsIndex++;
				}

				helper.commit(decorationsAccessor);
			});
		});

		scrollState.restore(this._editor);
	}

	private _resolveCodeLensesInViewportSoon(): void {
		const model = this._editor.getModel();
		if (model) {
			this._resolveCodeLensesScheduler.schedule();
		}
	}

	private _resolveCodeLensesInViewport(): void {

		this._resolveCodeLensesPromise?.cancel();
		this._resolveCodeLensesPromise = undefined;

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const toResolve: CodeLensItem[][] = [];
		const lenses: CodeLensWidget[] = [];
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

		const t1 = Date.now();

		const resolvePromise = createCancelablePromise(token => {

			const promises = toResolve.map((request, i) => {

				const resolvedSymbols = new Array<CodeLens | undefined | null>(request.length);
				const promises = request.map((request, i) => {
					if (!request.symbol.command && typeof request.provider.resolveCodeLens === 'function') {
						return Promise.resolve(request.provider.resolveCodeLens(model, request.symbol, token)).then(symbol => {
							resolvedSymbols[i] = symbol;
						}, onUnexpectedExternalError);
					} else {
						resolvedSymbols[i] = request.symbol;
						return Promise.resolve(undefined);
					}
				});

				return Promise.all(promises).then(() => {
					if (!token.isCancellationRequested && !lenses[i].isDisposed()) {
						lenses[i].updateCommands(resolvedSymbols);
					}
				});
			});

			return Promise.all(promises);
		});
		this._resolveCodeLensesPromise = resolvePromise;

		this._resolveCodeLensesPromise.then(() => {

			// update moving average
			const newDelay = this._resolveCodeLensesDebounce.update(model, Date.now() - t1);
			this._resolveCodeLensesScheduler.delay = newDelay;

			if (this._currentCodeLensModel) { // update the cached state with new resolved items
				this._codeLensCache.put(model, this._currentCodeLensModel);
			}
			this._oldCodeLensModels.clear(); // dispose old models once we have updated the UI with the current model
			if (resolvePromise === this._resolveCodeLensesPromise) {
				this._resolveCodeLensesPromise = undefined;
			}
		}, err => {
			onUnexpectedError(err); // can also be cancellation!
			if (resolvePromise === this._resolveCodeLensesPromise) {
				this._resolveCodeLensesPromise = undefined;
			}
		});
	}

	async getModel(): Promise<CodeLensModel | undefined> {
		await this._getCodeLensModelPromise;
		await this._resolveCodeLensesPromise;
		return !this._currentCodeLensModel?.isDisposed
			? this._currentCodeLensModel
			: undefined;
	}
}

registerEditorContribution(CodeLensContribution.ID, CodeLensContribution, EditorContributionInstantiation.AfterFirstRender);

registerEditorAction(class ShowLensesInCurrentLine extends EditorAction {

	constructor() {
		super({
			id: 'codelens.showLensesInCurrentLine',
			precondition: EditorContextKeys.hasCodeLensProvider,
			label: localize('showLensOnLine', "Show CodeLens Commands For Current Line"),
			alias: 'Show CodeLens Commands For Current Line',
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {

		if (!editor.hasModel()) {
			return;
		}

		const quickInputService = accessor.get(IQuickInputService);
		const commandService = accessor.get(ICommandService);
		const notificationService = accessor.get(INotificationService);

		const lineNumber = editor.getSelection().positionLineNumber;
		const codelensController = editor.getContribution<CodeLensContribution>(CodeLensContribution.ID);
		if (!codelensController) {
			return;
		}

		const model = await codelensController.getModel();
		if (!model) {
			// nothing
			return;
		}

		const items: { label: string; command: Command }[] = [];
		for (const lens of model.lenses) {
			if (lens.symbol.command && lens.symbol.range.startLineNumber === lineNumber) {
				items.push({
					label: lens.symbol.command.title,
					command: lens.symbol.command
				});
			}
		}

		if (items.length === 0) {
			// We dont want an empty picker
			return;
		}

		const item = await quickInputService.pick(items, {
			canPickMany: false,
			placeHolder: localize('placeHolder', "Select a command")
		});
		if (!item) {
			// Nothing picked
			return;
		}

		let command = item.command;

		if (model.isDisposed) {
			// try to find the same command again in-case the model has been re-created in the meantime
			// this is a best attempt approach which shouldn't be needed because eager model re-creates
			// shouldn't happen due to focus in/out anymore
			const newModel = await codelensController.getModel();
			const newLens = newModel?.lenses.find(lens => lens.symbol.range.startLineNumber === lineNumber && lens.symbol.command?.title === command.title);
			if (!newLens || !newLens.symbol.command) {
				return;
			}
			command = newLens.symbol.command;
		}

		try {
			await commandService.executeCommand(command.id, ...(command.arguments || []));
		} catch (err) {
			notificationService.error(err);
		}
	}
});
