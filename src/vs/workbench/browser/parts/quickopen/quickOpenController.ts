/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/quickopen';
import * as nls from 'vs/nls';
import * as browser from 'vs/base/browser/browser';
import * as strings from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import * as types from 'vs/base/common/types';
import { Action } from 'vs/base/common/actions';
import { IIconLabelValueOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { Mode, IEntryRunContext, IAutoFocus, IQuickNavigateConfiguration, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, QuickOpenModel, QuickOpenEntryGroup, QuickOpenItemAccessorClass } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenWidget, HideReason } from 'vs/base/parts/quickopen/browser/quickOpenWidget';
import { ContributableActionProvider } from 'vs/workbench/browser/actions';
import { ITextFileService, AutoSaveMode } from 'vs/workbench/services/textfile/common/textfiles';
import { Registry } from 'vs/platform/registry/common/platform';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IModeService } from 'vs/editor/common/services/modeService';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/modelService';
import { EditorInput, IWorkbenchEditorConfiguration, IEditorInput } from 'vs/workbench/common/editor';
import { Component } from 'vs/workbench/common/component';
import { Event, Emitter } from 'vs/base/common/event';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { QuickOpenHandler, QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions, EditorQuickOpenEntry, CLOSE_ON_FOCUS_LOST_CONFIG, SEARCH_EDITOR_HISTORY, PRESERVE_INPUT_CONFIG } from 'vs/workbench/browser/quickopen';
import * as errors from 'vs/base/common/errors';
import { IQuickOpenService, IShowOptions } from 'vs/platform/quickOpen/common/quickOpen';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { QUICK_INPUT_BACKGROUND, QUICK_INPUT_FOREGROUND } from 'vs/workbench/common/theme';
import { attachQuickOpenStyler } from 'vs/platform/theme/common/styler';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { scoreItem, ScorerCache, compareItemsByScore, prepareQuery } from 'vs/base/parts/quickopen/common/quickOpenScorer';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { Schemas } from 'vs/base/common/network';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Dimension, addClass } from 'vs/base/browser/dom';
import { IEditorService, ACTIVE_GROUP, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ILabelService } from 'vs/platform/label/common/label';
import { timeout } from 'vs/base/common/async';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { CancellationTokenSource, CancellationToken } from 'vs/base/common/cancellation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

const HELP_PREFIX = '?';

type ValueCallback<T = any> = (value: T | Promise<T>) => void;

export class QuickOpenController extends Component implements IQuickOpenService {

	private static readonly MAX_SHORT_RESPONSE_TIME = 500;
	private static readonly ID = 'workbench.component.quickopen';

	_serviceBrand!: ServiceIdentifier<any>;

	private readonly _onShow: Emitter<void> = this._register(new Emitter<void>());
	readonly onShow: Event<void> = this._onShow.event;

	private readonly _onHide: Emitter<void> = this._register(new Emitter<void>());
	readonly onHide: Event<void> = this._onHide.event;

	private preserveInput: boolean;
	private isQuickOpen: boolean;
	private lastInputValue: string;
	private lastSubmittedInputValue: string;
	private quickOpenWidget: QuickOpenWidget;
	private mapResolvedHandlersToPrefix: Map<string, Promise<QuickOpenHandler>> = new Map();
	private mapContextKeyToContext: Map<string, IContextKey<boolean>> = new Map();
	private handlerOnOpenCalled: Set<string> = new Set();
	private promisesToCompleteOnHide: ValueCallback[] = [];
	private previousActiveHandlerDescriptor: QuickOpenHandlerDescriptor | null;
	private actionProvider = new ContributableActionProvider();
	private closeOnFocusLost: boolean;
	private searchInEditorHistory: boolean;
	private editorHistoryHandler: EditorHistoryHandler;
	private pendingGetResultsInvocation: CancellationTokenSource | null;

	constructor(
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@INotificationService private readonly notificationService: INotificationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(QuickOpenController.ID, themeService, storageService);

		this.editorHistoryHandler = this.instantiationService.createInstance(EditorHistoryHandler);

		this.updateConfiguration();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(() => this.updateConfiguration()));
		this._register(this.layoutService.onTitleBarVisibilityChange(() => this.positionQuickOpenWidget()));
		this._register(browser.onDidChangeZoomLevel(() => this.positionQuickOpenWidget()));
		this._register(this.layoutService.onLayout(dimension => this.layout(dimension)));
	}

	private updateConfiguration(): void {
		if (this.environmentService.args['sticky-quickopen']) {
			this.closeOnFocusLost = false;
		} else {
			this.closeOnFocusLost = this.configurationService.getValue(CLOSE_ON_FOCUS_LOST_CONFIG);
		}
		this.preserveInput = this.configurationService.getValue(PRESERVE_INPUT_CONFIG);

		this.searchInEditorHistory = this.configurationService.getValue(SEARCH_EDITOR_HISTORY);
	}

	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration): void {
		if (this.quickOpenWidget) {
			this.quickOpenWidget.navigate(next, quickNavigate);
		}
	}

	accept(): void {
		if (this.quickOpenWidget && this.quickOpenWidget.isVisible()) {
			this.quickOpenWidget.accept();
		}
	}

	focus(): void {
		if (this.quickOpenWidget && this.quickOpenWidget.isVisible()) {
			this.quickOpenWidget.focus();
		}
	}

	close(): void {
		if (this.quickOpenWidget && this.quickOpenWidget.isVisible()) {
			this.quickOpenWidget.hide(HideReason.CANCELED);
		}
	}

	private emitQuickOpenVisibilityChange(isVisible: boolean): void {
		if (isVisible) {
			this._onShow.fire();
		} else {
			this._onHide.fire();
		}
	}

	show(prefix?: string, options?: IShowOptions): Promise<void> {
		let quickNavigateConfiguration = options ? options.quickNavigateConfiguration : undefined;
		let inputSelection = options ? options.inputSelection : undefined;
		let autoFocus = options ? options.autoFocus : undefined;

		const promiseCompletedOnHide = new Promise<void>(c => {
			this.promisesToCompleteOnHide.push(c);
		});

		// Telemetry: log that quick open is shown and log the mode
		const registry = Registry.as<IQuickOpenRegistry>(Extensions.Quickopen);
		const handlerDescriptor = (prefix ? registry.getQuickOpenHandler(prefix) : undefined) || registry.getDefaultQuickOpenHandler();

		// Trigger onOpen
		this.resolveHandler(handlerDescriptor);

		// Create upon first open
		if (!this.quickOpenWidget) {
			this.quickOpenWidget = this._register(new QuickOpenWidget(
				this.layoutService.getWorkbenchElement(),
				{
					onOk: () => this.onOk(),
					onCancel: () => { /* ignore */ },
					onType: (value: string) => this.onType(value || ''),
					onShow: () => this.handleOnShow(),
					onHide: (reason) => this.handleOnHide(reason),
					onFocusLost: () => !this.closeOnFocusLost
				}, {
					inputPlaceHolder: this.hasHandler(HELP_PREFIX) ? nls.localize('quickOpenInput', "Type '?' to get help on the actions you can take from here") : '',
					keyboardSupport: false,
					treeCreator: (container, config, opts) => this.instantiationService.createInstance(WorkbenchTree, container, config, opts)
				}
			));
			this._register(attachQuickOpenStyler(this.quickOpenWidget, this.themeService, { background: QUICK_INPUT_BACKGROUND, foreground: QUICK_INPUT_FOREGROUND }));

			const quickOpenContainer = this.quickOpenWidget.create();
			addClass(quickOpenContainer, 'show-file-icons');
			this.positionQuickOpenWidget();
		}

		// Layout
		this.quickOpenWidget.layout(this.layoutService.dimension);

		// Show quick open with prefix or editor history
		if (!this.quickOpenWidget.isVisible() || quickNavigateConfiguration) {
			if (prefix) {
				this.quickOpenWidget.show(prefix, { quickNavigateConfiguration, inputSelection, autoFocus });
			} else {
				const editorHistory = this.getEditorHistoryWithGroupLabel();
				if (editorHistory.getEntries().length < 2) {
					quickNavigateConfiguration = undefined; // If no entries can be shown, default to normal quick open mode
				}

				// Compute auto focus
				if (!autoFocus) {
					if (!quickNavigateConfiguration) {
						autoFocus = { autoFocusFirstEntry: true };
					} else {
						const autoFocusFirstEntry = this.editorGroupService.activeGroup.count === 0;
						autoFocus = { autoFocusFirstEntry, autoFocusSecondEntry: !autoFocusFirstEntry };
					}
				}

				// Update context
				const registry = Registry.as<IQuickOpenRegistry>(Extensions.Quickopen);
				this.setQuickOpenContextKey(registry.getDefaultQuickOpenHandler().contextKey);
				if (this.preserveInput) {
					this.quickOpenWidget.show(editorHistory, { value: this.lastSubmittedInputValue, quickNavigateConfiguration, autoFocus, inputSelection });
				} else {
					this.quickOpenWidget.show(editorHistory, { quickNavigateConfiguration, autoFocus, inputSelection });
				}
			}
		}

		// Otherwise reset the widget to the prefix that is passed in
		else {
			this.quickOpenWidget.show(prefix || '', { inputSelection });
		}

		return promiseCompletedOnHide;
	}

	private positionQuickOpenWidget(): void {
		const titlebarOffset = this.layoutService.getTitleBarOffset();

		if (this.quickOpenWidget) {
			this.quickOpenWidget.getElement().style.top = `${titlebarOffset}px`;
		}
	}

	private handleOnShow(): void {
		this.emitQuickOpenVisibilityChange(true);
	}

	private handleOnHide(reason: HideReason): void {

		// Clear state
		this.previousActiveHandlerDescriptor = null;

		// Cancel pending results calls
		this.cancelPendingGetResultsInvocation();

		// Pass to handlers
		this.mapResolvedHandlersToPrefix.forEach((promise, prefix) => {
			promise.then(handler => {
				this.handlerOnOpenCalled.delete(prefix);

				handler.onClose(reason === HideReason.CANCELED); // Don't check if onOpen was called to preserve old behaviour for now
			});
		});

		// Complete promises that are waiting
		while (this.promisesToCompleteOnHide.length) {
			const callback = this.promisesToCompleteOnHide.pop();
			if (callback) {
				callback(true);
			}
		}

		if (reason !== HideReason.FOCUS_LOST) {
			this.editorGroupService.activeGroup.focus(); // focus back to editor group unless user clicked somewhere else
		}

		// Reset context keys
		this.resetQuickOpenContextKeys();

		// Events
		this.emitQuickOpenVisibilityChange(false);
	}

	private cancelPendingGetResultsInvocation(): void {
		if (this.pendingGetResultsInvocation) {
			this.pendingGetResultsInvocation.cancel();
			this.pendingGetResultsInvocation.dispose();
			this.pendingGetResultsInvocation = null;
		}
	}

	private resetQuickOpenContextKeys(): void {
		this.mapContextKeyToContext.forEach(context => context.reset());
	}

	private setQuickOpenContextKey(id?: string): void {
		let key: IContextKey<boolean> | undefined;
		if (id) {
			key = this.mapContextKeyToContext.get(id);
			if (!key) {
				key = new RawContextKey<boolean>(id, false).bindTo(this.contextKeyService);
				this.mapContextKeyToContext.set(id, key);
			}
		}

		if (key && key.get()) {
			return; // already active context
		}

		this.resetQuickOpenContextKeys();

		if (key) {
			key.set(true);
		}
	}

	private hasHandler(prefix: string): boolean {
		return !!Registry.as<IQuickOpenRegistry>(Extensions.Quickopen).getQuickOpenHandler(prefix);
	}

	private getEditorHistoryWithGroupLabel(): QuickOpenModel {
		const entries: QuickOpenEntry[] = this.editorHistoryHandler.getResults();

		// Apply label to first entry
		if (entries.length > 0) {
			entries[0] = new EditorHistoryEntryGroup(entries[0], nls.localize('historyMatches', "recently opened"), false);
		}

		return new QuickOpenModel(entries, this.actionProvider);
	}

	private onOk(): void {
		if (this.isQuickOpen) {
			this.lastSubmittedInputValue = this.lastInputValue;
		}
	}

	private onType(value: string): void {

		// cancel any pending get results invocation and create new
		this.cancelPendingGetResultsInvocation();
		const pendingResultsInvocationTokenSource = new CancellationTokenSource();
		const pendingResultsInvocationToken = pendingResultsInvocationTokenSource.token;
		this.pendingGetResultsInvocation = pendingResultsInvocationTokenSource;

		// look for a handler
		const registry = Registry.as<IQuickOpenRegistry>(Extensions.Quickopen);
		const handlerDescriptor = registry.getQuickOpenHandler(value);
		const defaultHandlerDescriptor = registry.getDefaultQuickOpenHandler();
		const instantProgress = handlerDescriptor && handlerDescriptor.instantProgress;
		const contextKey = handlerDescriptor ? handlerDescriptor.contextKey : defaultHandlerDescriptor.contextKey;

		// Reset Progress
		if (!instantProgress) {
			this.quickOpenWidget.getProgressBar().stop().hide();
		}

		// Reset Extra Class
		this.quickOpenWidget.setExtraClass(null);

		// Update context
		this.setQuickOpenContextKey(contextKey);

		// Remove leading and trailing whitespace
		const trimmedValue = strings.trim(value);

		// If no value provided, default to editor history
		if (!trimmedValue) {

			// Trigger onOpen
			this.resolveHandler(handlerDescriptor || defaultHandlerDescriptor);

			this.quickOpenWidget.setInput(this.getEditorHistoryWithGroupLabel(), { autoFocusFirstEntry: true });

			// If quickOpen entered empty we have to clear the prefill-cache
			this.lastInputValue = '';
			this.isQuickOpen = true;

			return;
		}

		let resultPromise: Promise<void>;
		let resultPromiseDone = false;

		if (handlerDescriptor) {
			this.isQuickOpen = false;
			resultPromise = this.handleSpecificHandler(handlerDescriptor, value, pendingResultsInvocationToken);
		}

		// Otherwise handle default handlers if no specific handler present
		else {
			this.isQuickOpen = true;
			// Cache the value for prefilling the quickOpen next time is opened
			this.lastInputValue = trimmedValue;
			resultPromise = this.handleDefaultHandler(defaultHandlerDescriptor, value, pendingResultsInvocationToken);
		}

		// Remember as the active one
		this.previousActiveHandlerDescriptor = handlerDescriptor;

		// Progress if task takes a long time
		setTimeout(() => {
			if (!resultPromiseDone && !pendingResultsInvocationToken.isCancellationRequested) {
				this.quickOpenWidget.getProgressBar().infinite().show();
			}
		}, instantProgress ? 0 : 800);

		// Promise done handling
		resultPromise.then(() => {
			resultPromiseDone = true;

			if (!pendingResultsInvocationToken.isCancellationRequested) {
				this.quickOpenWidget.getProgressBar().hide();
			}

			pendingResultsInvocationTokenSource.dispose();
		}, (error: any) => {
			resultPromiseDone = true;

			pendingResultsInvocationTokenSource.dispose();

			errors.onUnexpectedError(error);
			this.notificationService.error(types.isString(error) ? new Error(error) : error);
		});
	}

	private async handleDefaultHandler(handler: QuickOpenHandlerDescriptor, value: string, token: CancellationToken): Promise<void> {

		// Fill in history results if matching and we are configured to search in history
		let matchingHistoryEntries: QuickOpenEntry[];
		if (value && !this.searchInEditorHistory) {
			matchingHistoryEntries = [];
		} else {
			matchingHistoryEntries = this.editorHistoryHandler.getResults(value, token);
		}

		if (matchingHistoryEntries.length > 0) {
			matchingHistoryEntries[0] = new EditorHistoryEntryGroup(matchingHistoryEntries[0], nls.localize('historyMatches', "recently opened"), false);
		}

		// Resolve
		const resolvedHandler = await this.resolveHandler(handler);

		const quickOpenModel = new QuickOpenModel(matchingHistoryEntries, this.actionProvider);

		let inputSet = false;

		// If we have matching entries from history we want to show them directly and not wait for the other results to come in
		// This also applies when we used to have entries from a previous run and now there are no more history results matching
		const previousInput = this.quickOpenWidget.getInput();
		const wasShowingHistory = previousInput && previousInput.entries && previousInput.entries.some(e => e instanceof EditorHistoryEntry || e instanceof EditorHistoryEntryGroup);
		if (wasShowingHistory || matchingHistoryEntries.length > 0) {
			(async () => {
				if (resolvedHandler.hasShortResponseTime()) {
					await timeout(QuickOpenController.MAX_SHORT_RESPONSE_TIME);
				}

				if (!token.isCancellationRequested && !inputSet) {
					this.quickOpenWidget.setInput(quickOpenModel, { autoFocusFirstEntry: true });
					inputSet = true;
				}
			})();
		}

		// Get results
		const result = await resolvedHandler.getResults(value, token);
		if (!token.isCancellationRequested) {

			// now is the time to show the input if we did not have set it before
			if (!inputSet) {
				this.quickOpenWidget.setInput(quickOpenModel, { autoFocusFirstEntry: true });
				inputSet = true;
			}

			// merge history and default handler results
			const handlerResults = (result && result.entries) || [];
			this.mergeResults(quickOpenModel, handlerResults, types.withNullAsUndefined(resolvedHandler.getGroupLabel()));
		}
	}

	private mergeResults(quickOpenModel: QuickOpenModel, handlerResults: QuickOpenEntry[], groupLabel: string | undefined): void {

		// Remove results already showing by checking for a "resource" property
		const mapEntryToResource = this.mapEntriesToResource(quickOpenModel);
		const additionalHandlerResults: QuickOpenEntry[] = [];
		for (const result of handlerResults) {
			const resource = result.getResource();

			if (!result.mergeWithEditorHistory() || !resource || !mapEntryToResource[resource.toString()]) {
				additionalHandlerResults.push(result);
			}
		}

		// Show additional handler results below any existing results
		if (additionalHandlerResults.length > 0) {
			const autoFocusFirstEntry = (quickOpenModel.getEntries().length === 0); // the user might have selected another entry meanwhile in local history (see https://github.com/Microsoft/vscode/issues/20828)
			const useTopBorder = quickOpenModel.getEntries().length > 0;
			additionalHandlerResults[0] = new QuickOpenEntryGroup(additionalHandlerResults[0], groupLabel, useTopBorder);
			quickOpenModel.addEntries(additionalHandlerResults);
			this.quickOpenWidget.refresh(quickOpenModel, { autoFocusFirstEntry });
		}

		// Otherwise if no results are present (even from histoy) indicate this to the user
		else if (quickOpenModel.getEntries().length === 0) {
			quickOpenModel.addEntries([new PlaceholderQuickOpenEntry(nls.localize('noResultsFound1', "No results found"))]);
			this.quickOpenWidget.refresh(quickOpenModel, { autoFocusFirstEntry: true });
		}
	}

	private async handleSpecificHandler(handlerDescriptor: QuickOpenHandlerDescriptor, value: string, token: CancellationToken): Promise<void> {
		const resolvedHandler = await this.resolveHandler(handlerDescriptor);

		// Remove handler prefix from search value
		value = value.substr(handlerDescriptor.prefix.length);

		// Return early if the handler can not run in the current environment and inform the user
		const canRun = resolvedHandler.canRun();
		if (types.isUndefinedOrNull(canRun) || (typeof canRun === 'boolean' && !canRun) || typeof canRun === 'string') {
			const placeHolderLabel = (typeof canRun === 'string') ? canRun : nls.localize('canNotRunPlaceholder', "This quick open handler can not be used in the current context");

			const model = new QuickOpenModel([new PlaceholderQuickOpenEntry(placeHolderLabel)], this.actionProvider);
			this.showModel(model, resolvedHandler.getAutoFocus(value, { model, quickNavigateConfiguration: this.quickOpenWidget.getQuickNavigateConfiguration() }), types.withNullAsUndefined(resolvedHandler.getAriaLabel()));

			return;
		}

		// Support extra class from handler
		const extraClass = resolvedHandler.getClass();
		if (extraClass) {
			this.quickOpenWidget.setExtraClass(extraClass);
		}

		// When handlers change, clear the result list first before loading the new results
		if (this.previousActiveHandlerDescriptor !== handlerDescriptor) {
			this.clearModel();
		}

		// Receive Results from Handler and apply
		const result = await resolvedHandler.getResults(value, token);
		if (!token.isCancellationRequested) {
			if (!result || !result.entries.length) {
				const model = new QuickOpenModel([new PlaceholderQuickOpenEntry(resolvedHandler.getEmptyLabel(value))]);
				this.showModel(model, resolvedHandler.getAutoFocus(value, { model, quickNavigateConfiguration: this.quickOpenWidget.getQuickNavigateConfiguration() }), types.withNullAsUndefined(resolvedHandler.getAriaLabel()));
			} else {
				this.showModel(result, resolvedHandler.getAutoFocus(value, { model: result, quickNavigateConfiguration: this.quickOpenWidget.getQuickNavigateConfiguration() }), types.withNullAsUndefined(resolvedHandler.getAriaLabel()));
			}
		}
	}

	private showModel(model: IModel<any>, autoFocus?: IAutoFocus, ariaLabel?: string): void {

		// If the given model is already set in the widget, refresh and return early
		if (this.quickOpenWidget.getInput() === model) {
			this.quickOpenWidget.refresh(model, autoFocus);

			return;
		}

		// Otherwise just set it
		this.quickOpenWidget.setInput(model, autoFocus, ariaLabel);
	}

	private clearModel(): void {
		this.showModel(new QuickOpenModel(), undefined);
	}

	private mapEntriesToResource(model: QuickOpenModel): { [resource: string]: QuickOpenEntry; } {
		const entries = model.getEntries();
		const mapEntryToPath: { [path: string]: QuickOpenEntry; } = {};
		entries.forEach((entry: QuickOpenEntry) => {
			const resource = entry.getResource();
			if (resource) {
				mapEntryToPath[resource.toString()] = entry;
			}
		});

		return mapEntryToPath;
	}

	private async resolveHandler(handler: QuickOpenHandlerDescriptor): Promise<QuickOpenHandler> {
		let result = this.doResolveHandler(handler);

		const id = handler.getId();
		if (!this.handlerOnOpenCalled.has(id)) {
			const original = result;
			this.handlerOnOpenCalled.add(id);
			result = original.then(resolved => {
				this.mapResolvedHandlersToPrefix.set(id, original);
				resolved.onOpen();

				return resolved;
			});

			this.mapResolvedHandlersToPrefix.set(id, result);
		}

		try {
			return await result;
		} catch (error) {
			this.mapResolvedHandlersToPrefix.delete(id);

			throw new Error(`Unable to instantiate quick open handler ${handler.getId()}: ${JSON.stringify(error)}`);
		}
	}

	private doResolveHandler(handler: QuickOpenHandlerDescriptor): Promise<QuickOpenHandler> {
		const id = handler.getId();

		// Return Cached
		if (this.mapResolvedHandlersToPrefix.has(id)) {
			return this.mapResolvedHandlersToPrefix.get(id)!;
		}

		// Otherwise load and create
		const result = Promise.resolve(handler.instantiate(this.instantiationService));
		this.mapResolvedHandlersToPrefix.set(id, result);

		return result;
	}

	layout(dimension: Dimension): void {
		if (this.quickOpenWidget) {
			this.quickOpenWidget.layout(dimension);
		}
	}
}

class PlaceholderQuickOpenEntry extends QuickOpenEntryGroup {
	private placeHolderLabel: string;

	constructor(placeHolderLabel: string) {
		super();

		this.placeHolderLabel = placeHolderLabel;
	}

	getLabel(): string {
		return this.placeHolderLabel;
	}
}

class EditorHistoryHandler {
	private scorerCache: ScorerCache;

	constructor(
		@IHistoryService private readonly historyService: IHistoryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService
	) {
		this.scorerCache = Object.create(null);
	}

	getResults(searchValue?: string, token?: CancellationToken): QuickOpenEntry[] {

		// Massage search for scoring
		const query = prepareQuery(searchValue || '');

		// Just return all if we are not searching
		const history = this.historyService.getHistory();
		if (!query.value) {
			return history.map(input => this.instantiationService.createInstance(EditorHistoryEntry, input));
		}

		// Otherwise filter by search value and sort by score. Include matches on description
		// in case the user is explicitly including path separators.
		const accessor = query.containsPathSeparator ? MatchOnDescription : DoNotMatchOnDescription;
		return history

			// For now, only support to match on inputs that provide resource information
			.filter(input => {
				let resource: URI | undefined;
				if (input instanceof EditorInput) {
					resource = resourceForEditorHistory(input, this.fileService);
				} else {
					resource = (input as IResourceInput).resource;
				}

				return !!resource;
			})

			// Conver to quick open entries
			.map(input => this.instantiationService.createInstance(EditorHistoryEntry, input))

			// Make sure the search value is matching
			.filter(e => {
				const itemScore = scoreItem(e, query, false, accessor, this.scorerCache);
				if (!itemScore.score) {
					return false;
				}

				e.setHighlights(itemScore.labelMatch || [], itemScore.descriptionMatch);

				return true;
			})

			// Sort by score and provide a fallback sorter that keeps the
			// recency of items in case the score for items is the same
			.sort((e1, e2) => compareItemsByScore(e1, e2, query, false, accessor, this.scorerCache, () => -1));
	}
}

class EditorHistoryItemAccessorClass extends QuickOpenItemAccessorClass {

	constructor(private allowMatchOnDescription: boolean) {
		super();
	}

	getItemDescription(entry: QuickOpenEntry): string | null {
		return this.allowMatchOnDescription ? types.withUndefinedAsNull(entry.getDescription()) : null;
	}
}

const MatchOnDescription = new EditorHistoryItemAccessorClass(true);
const DoNotMatchOnDescription = new EditorHistoryItemAccessorClass(false);

export class EditorHistoryEntryGroup extends QuickOpenEntryGroup {
	// Marker class
}

export class EditorHistoryEntry extends EditorQuickOpenEntry {
	private input: IEditorInput | IResourceInput;
	private resource: URI | undefined;
	private label: string | undefined;
	private description?: string;
	private dirty: boolean;

	constructor(
		input: IEditorInput | IResourceInput,
		@IEditorService editorService: IEditorService,
		@IModeService private readonly modeService: IModeService,
		@IModelService private readonly modelService: IModelService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService
	) {
		super(editorService);

		this.input = input;

		if (input instanceof EditorInput) {
			this.resource = resourceForEditorHistory(input, fileService);
			this.label = types.withNullAsUndefined(input.getName());
			this.description = input.getDescription();
			this.dirty = input.isDirty();
		} else {
			const resourceInput = input as IResourceInput;
			this.resource = resourceInput.resource;
			this.label = resources.basenameOrAuthority(resourceInput.resource);
			this.description = labelService.getUriLabel(resources.dirname(this.resource), { relative: true });
			this.dirty = this.resource && this.textFileService.isDirty(this.resource);

			if (this.dirty && this.textFileService.getAutoSaveMode() === AutoSaveMode.AFTER_SHORT_DELAY) {
				this.dirty = false; // no dirty decoration if auto save is on with a short timeout
			}
		}
	}

	getIcon(): string {
		return this.dirty ? 'dirty' : '';
	}

	getLabel(): string | undefined {
		return this.label;
	}

	getLabelOptions(): IIconLabelValueOptions {
		return {
			extraClasses: getIconClasses(this.modelService, this.modeService, this.resource)
		};
	}

	getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, recently opened", this.getLabel());
	}

	getDescription(): string | undefined {
		return this.description;
	}

	getResource(): URI | undefined {
		return this.resource;
	}

	getInput(): IEditorInput | IResourceInput {
		return this.input;
	}

	run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			const sideBySide = !context.quickNavigateConfiguration && (context.keymods.alt || context.keymods.ctrlCmd);
			const pinned = !this.configurationService.getValue<IWorkbenchEditorConfiguration>().workbench.editor.enablePreviewFromQuickOpen || context.keymods.alt;

			if (this.input instanceof EditorInput) {
				this.editorService.openEditor(this.input, { pinned }, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
			} else {
				this.editorService.openEditor({ resource: (this.input as IResourceInput).resource, options: { pinned } }, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
			}

			return true;
		}

		return super.run(mode, context);
	}
}

function resourceForEditorHistory(input: EditorInput, fileService: IFileService): URI | undefined {
	const resource = input ? input.getResource() : undefined;

	// For the editor history we only prefer resources that are either untitled or
	// can be handled by the file service which indicates they are editable resources.
	if (resource && (fileService.canHandleResource(resource) || resource.scheme === Schemas.untitled)) {
		return resource;
	}

	return undefined;
}

export class RemoveFromEditorHistoryAction extends Action {

	static readonly ID = 'workbench.action.removeFromEditorHistory';
	static readonly LABEL = nls.localize('removeFromEditorHistory', "Remove From History");

	constructor(
		id: string,
		label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	async run(): Promise<any> {
		interface IHistoryPickEntry extends IQuickPickItem {
			input: IEditorInput | IResourceInput;
		}

		const history = this.historyService.getHistory();
		const picks: IHistoryPickEntry[] = history.map(h => {
			const entry = this.instantiationService.createInstance(EditorHistoryEntry, h);

			return <IHistoryPickEntry>{
				input: h,
				iconClasses: getIconClasses(this.modelService, this.modeService, entry.getResource()),
				label: entry.getLabel(),
				description: entry.getDescription()
			};
		});

		const pick = await this.quickInputService.pick(picks, { placeHolder: nls.localize('pickHistory', "Select an editor entry to remove from history"), matchOnDescription: true });
		if (pick) {
			this.historyService.remove(pick.input);
		}
	}
}

registerSingleton(IQuickOpenService, QuickOpenController, true);
