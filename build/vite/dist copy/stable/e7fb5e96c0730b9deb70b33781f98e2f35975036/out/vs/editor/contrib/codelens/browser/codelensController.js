/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { createCancelablePromise, disposableTimeout, RunOnceScheduler } from '../../../../base/common/async.js';
import { onUnexpectedError, onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { StableEditorScrollState } from '../../../browser/stableEditorScroll.js';
import { EditorAction, registerEditorAction, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { EDITOR_FONT_DEFAULTS } from '../../../common/config/fontInfo.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { getCodeLensModel } from './codelens.js';
import { ICodeLensCache } from './codeLensCache.js';
import { CodeLensHelper, CodeLensWidget } from './codelensWidget.js';
import { localize, localize2 } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ILanguageFeatureDebounceService } from '../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
let CodeLensContribution = class CodeLensContribution {
    static { this.ID = 'css.editor.codeLens'; }
    constructor(_editor, _languageFeaturesService, debounceService, _commandService, _notificationService, _codeLensCache) {
        this._editor = _editor;
        this._languageFeaturesService = _languageFeaturesService;
        this._commandService = _commandService;
        this._notificationService = _notificationService;
        this._codeLensCache = _codeLensCache;
        this._disposables = new DisposableStore();
        this._localToDispose = new DisposableStore();
        this._lenses = [];
        this._oldCodeLensModels = new DisposableStore();
        this._provideCodeLensDebounce = debounceService.for(_languageFeaturesService.codeLensProvider, 'CodeLensProvide', { min: 250 });
        this._resolveCodeLensesDebounce = debounceService.for(_languageFeaturesService.codeLensProvider, 'CodeLensResolve', { min: 250, salt: 'resolve' });
        this._resolveCodeLensesScheduler = new RunOnceScheduler(() => this._resolveCodeLensesInViewport(), this._resolveCodeLensesDebounce.default());
        this._disposables.add(this._editor.onDidChangeModel(() => this._onModelChange()));
        this._disposables.add(this._editor.onDidChangeModelLanguage(() => this._onModelChange()));
        this._disposables.add(this._editor.onDidChangeConfiguration((e) => {
            if (e.hasChanged(59 /* EditorOption.fontInfo */) || e.hasChanged(25 /* EditorOption.codeLensFontSize */) || e.hasChanged(24 /* EditorOption.codeLensFontFamily */)) {
                this._updateLensStyle();
            }
            if (e.hasChanged(23 /* EditorOption.codeLens */)) {
                this._onModelChange();
            }
        }));
        this._disposables.add(_languageFeaturesService.codeLensProvider.onDidChange(this._onModelChange, this));
        this._onModelChange();
        this._updateLensStyle();
    }
    dispose() {
        this._localDispose();
        this._localToDispose.dispose();
        this._disposables.dispose();
        this._resolveCodeLensesScheduler.dispose();
        this._oldCodeLensModels.dispose();
        this._currentCodeLensModel?.dispose();
    }
    _getLayoutInfo() {
        const lineHeightFactor = Math.max(1.3, this._editor.getOption(75 /* EditorOption.lineHeight */) / this._editor.getOption(61 /* EditorOption.fontSize */));
        let fontSize = this._editor.getOption(25 /* EditorOption.codeLensFontSize */);
        if (!fontSize || fontSize < 5) {
            fontSize = (this._editor.getOption(61 /* EditorOption.fontSize */) * .9) | 0;
        }
        return {
            fontSize,
            codeLensHeight: (fontSize * lineHeightFactor) | 0,
        };
    }
    _updateLensStyle() {
        const { codeLensHeight, fontSize } = this._getLayoutInfo();
        const fontFamily = this._editor.getOption(24 /* EditorOption.codeLensFontFamily */);
        const editorFontInfo = this._editor.getOption(59 /* EditorOption.fontInfo */);
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
    _localDispose() {
        this._getCodeLensModelPromise?.cancel();
        this._getCodeLensModelPromise = undefined;
        this._resolveCodeLensesPromise?.cancel();
        this._resolveCodeLensesPromise = undefined;
        this._localToDispose.clear();
        this._oldCodeLensModels.clear();
        this._currentCodeLensModel?.dispose();
    }
    _onModelChange() {
        this._localDispose();
        const model = this._editor.getModel();
        if (!model) {
            return;
        }
        if (!this._editor.getOption(23 /* EditorOption.codeLens */) || model.isTooLargeForTokenization()) {
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
                disposableTimeout(() => {
                    const cachedLensesNow = this._codeLensCache.get(model);
                    if (cachedLenses === cachedLensesNow) {
                        this._codeLensCache.delete(model);
                        this._onModelChange();
                    }
                }, 30 * 1000, this._localToDispose);
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
                    const toDispose = [];
                    let lastLensLineNumber = -1;
                    this._lenses.forEach((lens) => {
                        if (!lens.isValid() || lastLensLineNumber === lens.getLineNumber()) {
                            // invalid -> lens collapsed, attach range doesn't exist anymore
                            // line_number -> lenses should never be on the same line
                            toDispose.push(lens);
                        }
                        else {
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
        this._localToDispose.add(this._editor.onDidFocusEditorText(() => {
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
            }
            else {
                // No accessors available
                this._disposeAllLenses(undefined, undefined);
            }
        }));
        this._localToDispose.add(this._editor.onMouseDown(e => {
            if (e.target.type !== 9 /* MouseTargetType.CONTENT_WIDGET */) {
                return;
            }
            let target = e.target.element;
            if (target?.tagName === 'SPAN') {
                target = target.parentElement;
            }
            if (target?.tagName === 'A') {
                for (const lens of this._lenses) {
                    const command = lens.getCommand(target);
                    if (command) {
                        this._commandService.executeCommand(command.id, ...(command.arguments || [])).catch(err => this._notificationService.error(err));
                        break;
                    }
                }
            }
        }));
        scheduler.schedule();
    }
    _disposeAllLenses(decChangeAccessor, viewZoneChangeAccessor) {
        const helper = new CodeLensHelper();
        for (const lens of this._lenses) {
            lens.dispose(helper, viewZoneChangeAccessor);
        }
        if (decChangeAccessor) {
            helper.commit(decChangeAccessor);
        }
        this._lenses.length = 0;
    }
    _renderCodeLensSymbols(symbols) {
        if (!this._editor.hasModel()) {
            return;
        }
        const maxLineNumber = this._editor.getModel().getLineCount();
        const groups = [];
        let lastGroup;
        for (const symbol of symbols.lenses) {
            const line = symbol.symbol.range.startLineNumber;
            if (line < 1 || line > maxLineNumber) {
                // invalid code lens
                continue;
            }
            else if (lastGroup && lastGroup[lastGroup.length - 1].symbol.range.startLineNumber === line) {
                // on same line as previous
                lastGroup.push(symbol);
            }
            else {
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
                    }
                    else if (codeLensLineNumber === symbolsLineNumber) {
                        this._lenses[codeLensIndex].updateCodeLensSymbols(groups[groupsIndex], helper);
                        groupsIndex++;
                        codeLensIndex++;
                    }
                    else {
                        this._lenses.splice(codeLensIndex, 0, new CodeLensWidget(groups[groupsIndex], this._editor, helper, viewZoneAccessor, layoutInfo.codeLensHeight, () => this._resolveCodeLensesInViewportSoon()));
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
                    this._lenses.push(new CodeLensWidget(groups[groupsIndex], this._editor, helper, viewZoneAccessor, layoutInfo.codeLensHeight, () => this._resolveCodeLensesInViewportSoon()));
                    groupsIndex++;
                }
                helper.commit(decorationsAccessor);
            });
        });
        scrollState.restore(this._editor);
    }
    _resolveCodeLensesInViewportSoon() {
        const model = this._editor.getModel();
        if (model) {
            this._resolveCodeLensesScheduler.schedule();
        }
    }
    _resolveCodeLensesInViewport() {
        this._resolveCodeLensesPromise?.cancel();
        this._resolveCodeLensesPromise = undefined;
        const model = this._editor.getModel();
        if (!model) {
            return;
        }
        const toResolve = [];
        const lenses = [];
        this._lenses.forEach((lens) => {
            const request = lens.computeIfNecessary(model);
            if (request) {
                toResolve.push(request);
                lenses.push(lens);
            }
        });
        if (toResolve.length === 0) {
            this._oldCodeLensModels.clear();
            return;
        }
        const t1 = Date.now();
        const resolvePromise = createCancelablePromise(token => {
            const promises = toResolve.map((request, i) => {
                const resolvedSymbols = new Array(request.length);
                const promises = request.map((request, i) => {
                    if (!request.symbol.command && typeof request.provider.resolveCodeLens === 'function') {
                        return Promise.resolve(request.provider.resolveCodeLens(model, request.symbol, token)).then(symbol => {
                            resolvedSymbols[i] = symbol;
                        }, onUnexpectedExternalError);
                    }
                    else {
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
    async getModel() {
        await this._getCodeLensModelPromise;
        await this._resolveCodeLensesPromise;
        return !this._currentCodeLensModel?.isDisposed
            ? this._currentCodeLensModel
            : undefined;
    }
};
CodeLensContribution = __decorate([
    __param(1, ILanguageFeaturesService),
    __param(2, ILanguageFeatureDebounceService),
    __param(3, ICommandService),
    __param(4, INotificationService),
    __param(5, ICodeLensCache)
], CodeLensContribution);
export { CodeLensContribution };
registerEditorContribution(CodeLensContribution.ID, CodeLensContribution, 1 /* EditorContributionInstantiation.AfterFirstRender */);
registerEditorAction(class ShowLensesInCurrentLine extends EditorAction {
    constructor() {
        super({
            id: 'codelens.showLensesInCurrentLine',
            precondition: EditorContextKeys.hasCodeLensProvider,
            label: localize2('showLensOnLine', "Show CodeLens Commands for Current Line"),
        });
    }
    async run(accessor, editor) {
        if (!editor.hasModel()) {
            return;
        }
        const quickInputService = accessor.get(IQuickInputService);
        const commandService = accessor.get(ICommandService);
        const notificationService = accessor.get(INotificationService);
        const lineNumber = editor.getSelection().positionLineNumber;
        const codelensController = editor.getContribution(CodeLensContribution.ID);
        if (!codelensController) {
            return;
        }
        const model = await codelensController.getModel();
        if (!model) {
            // nothing
            return;
        }
        const items = [];
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
        }
        catch (err) {
            notificationService.error(err);
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZWxlbnNDb250cm9sbGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvY29kZWxlbnMvYnJvd3Nlci9jb2RlbGVuc0NvbnRyb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ25JLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFakYsT0FBTyxFQUFFLFlBQVksRUFBbUMsb0JBQW9CLEVBQUUsMEJBQTBCLEVBQW9CLE1BQU0sc0NBQXNDLENBQUM7QUFFekssT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFMUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFHekUsT0FBTyxFQUErQixnQkFBZ0IsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUM5RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDcEQsT0FBTyxFQUFFLGNBQWMsRUFBRSxjQUFjLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNyRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsa0JB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