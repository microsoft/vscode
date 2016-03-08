/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/quickopen';
import {TPromise, ValueCallback} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {Dimension, withElementById} from 'vs/base/browser/builder';
import strings = require('vs/base/common/strings');
import filters = require('vs/base/common/filters');
import uuid = require('vs/base/common/uuid');
import types = require('vs/base/common/types');
import {Mode, IContext, IAutoFocus, IQuickNavigateConfiguration, IModel} from 'vs/base/parts/quickopen/common/quickOpen';
import {QuickOpenEntryItem, QuickOpenEntry, QuickOpenModel, QuickOpenEntryGroup} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {QuickOpenWidget} from 'vs/base/parts/quickopen/browser/quickOpenWidget';
import {ContributableActionProvider} from 'vs/workbench/browser/actionBarRegistry';
import {ITree, IElementCallback} from 'vs/base/parts/tree/browser/tree';
import {Registry} from 'vs/platform/platform';
import {WorkbenchComponent} from 'vs/workbench/common/component';
import {EditorEvent, EventType} from 'vs/workbench/common/events';
import Event, {Emitter} from 'vs/base/common/event';
import {Identifiers} from 'vs/workbench/common/constants';
import {Scope} from 'vs/workbench/common/memento';
import {QuickOpenHandler, QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions} from 'vs/workbench/browser/quickopen';
import {EditorHistoryModel} from 'vs/workbench/browser/parts/quickopen/editorHistoryModel';
import {EditorInput} from 'vs/workbench/common/editor';
import errors = require('vs/base/common/errors');
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IPickOpenEntry, IInputOptions, IQuickOpenService, IPickOptions} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';

const ID = 'workbench.component.quickopen';
const EDITOR_HISTORY_STORAGE_KEY = 'quickopen.editorhistory';
const HELP_PREFIX = '?';
const AUTO_SAVE_HISTORY_THRESHOLD = 5;
const QUICK_OPEN_MODE = 'inQuickOpen';

interface IPickOpenEntryItem extends IPickOpenEntry {
	height?: number;
	render?: (tree: ITree, container: HTMLElement, previousCleanupFn: IElementCallback) => IElementCallback;
}

interface IInternalPickOptions {
	value?: string;
	placeHolder?: string;
	inputDecoration?: Severity;
	password?: boolean;
	autoFocus?: IAutoFocus;
	matchOnDescription?: boolean;
	matchOnDetail?: boolean;
	ignoreFocusLost?: boolean;
	onDidType?: (value: string) => any;
}

export class QuickOpenController extends WorkbenchComponent implements IQuickOpenService {

	public serviceId = IQuickOpenService;

	private _onShow: Emitter<void>;
	private _onHide: Emitter<void>;

	private instantiationService: IInstantiationService;
	private quickOpenWidget: QuickOpenWidget;
	private pickOpenWidget: QuickOpenWidget;
	private layoutDimensions: Dimension;
	private editorHistoryModel: EditorHistoryModel;
	private memento: any;
	private mapResolvedHandlersToPrefix: { [prefix: string]: QuickOpenHandler; };
	private currentResultToken: string;
	private currentPickerToken: string;
	private autoSaveHistoryCounter: number;
	private inQuickOpenMode: IKeybindingContextKey<boolean>;
	private promisesToCompleteOnHide: ValueCallback[];
	private previousActiveHandlerDescriptor: QuickOpenHandlerDescriptor;
	private actionProvider = new ContributableActionProvider();
	private previousValue = '';
	private visibilityChangeTimeoutHandle: number;

	constructor(
		private eventService: IEventService,
		private storageService: IStorageService,
		private editorService: IWorkbenchEditorService,
		private viewletService: IViewletService,
		private messageService: IMessageService,
		private telemetryService: ITelemetryService,
		private contextService: IWorkspaceContextService,
		keybindingService: IKeybindingService
	) {
		super(ID);

		this.mapResolvedHandlersToPrefix = {};
		this.autoSaveHistoryCounter = 0;

		this.promisesToCompleteOnHide = [];

		this.inQuickOpenMode = keybindingService.createKey(QUICK_OPEN_MODE, false);

		this._onShow = new Emitter<void>();
		this._onHide = new Emitter<void>();
	}

	public get onShow(): Event<void> {
		return this._onShow.event;
	}

	public get onHide(): Event<void> {
		return this._onHide.event;
	}

	public setInstantiationService(service: IInstantiationService): void {
		this.instantiationService = service;
	}

	public getEditorHistoryModel(): EditorHistoryModel {
		return this.editorHistoryModel;
	}

	public create(): void {

		// Listen on Editor Input Changes to show in MRU List
		this.toUnbind.push(this.eventService.addListener(EventType.EDITOR_INPUT_CHANGING, (e: EditorEvent) => this.onEditorInputChanging(e)));
		this.toUnbind.push(this.eventService.addListener(EventType.EDITOR_SET_INPUT_ERROR, (e: EditorEvent) => this.onEditorInputSetError(e)));

		// Editor History Model
		this.editorHistoryModel = new EditorHistoryModel(this.editorService, this.instantiationService, this.contextService);
		this.memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		if (this.memento[EDITOR_HISTORY_STORAGE_KEY]) {
			this.editorHistoryModel.loadFrom(this.memento[EDITOR_HISTORY_STORAGE_KEY]);
		}
	}

	private onEditorInputChanging(e: EditorEvent): void {
		if (e.editorInput) {

			// If an active editor is set, but is different from the one from the event, return early
			let activeEditor = this.editorService.getActiveEditor();
			if (activeEditor && e.editor && activeEditor !== e.editor) {
				return;
			}

			// Add to History
			this.editorHistoryModel.add(e.editorInput);

			// Save to Local Storage periodically
			if (this.autoSaveHistoryCounter++ >= AUTO_SAVE_HISTORY_THRESHOLD) {
				this.saveEditorHistory(true);
				this.autoSaveHistoryCounter = 0;
			}
		}
	}

	private onEditorInputSetError(e: EditorEvent): void {
		if (e.editorInput) {
			this.removeEditorHistoryEntry(e.editorInput); // make sure this input does not show up in history if it failed to open
		}
	}

	public getEditorHistory(): EditorInput[] {
		return this.editorHistoryModel ? this.editorHistoryModel.getEntries().map((entry) => entry.getInput()) : [];
	}

	public removeEditorHistoryEntry(input: EditorInput): void {
		this.editorHistoryModel.remove(input);
	}

	public quickNavigate(configuration: IQuickNavigateConfiguration, next: boolean): void {
		if (this.quickOpenWidget) {
			this.quickOpenWidget.quickNavigate(configuration, next);
		}
	}

	public input(options?: IInputOptions): TPromise<string> {
		const defaultMessage = options && options.prompt
			? nls.localize('inputModeEntryDescription', "{0} (Press 'Enter' to confirm or 'Escape' to cancel)", options.prompt)
			: nls.localize('inputModeEntry', "Press 'Enter' to confirm your input or 'Escape' to cancel");

		let currentPick = defaultMessage;
		let currentValidation = TPromise.as(true);
		let currentDecoration: Severity;
		let lastValue = options && options.value || '';

		const init = (resolve: (value: IPickOpenEntry | TPromise<IPickOpenEntry>) => any, reject: (value: any) => any) => {

			// open quick pick with just one choise. we will recurse whenever
			// the validation/success message changes
			this.doPick(TPromise.as([{ label: currentPick }]), {
				ignoreFocusLost: true,
				autoFocus: { autoFocusFirstEntry: true },
				password: options.password,
				placeHolder: options.placeHolder,
				value: options.value,
				inputDecoration: currentDecoration,
				onDidType: (value) => {
					lastValue = value;

					if (options.validateInput) {
						if (currentValidation) {
							currentValidation.cancel();
						}
						currentValidation = TPromise.timeout(100).then(() => {
							return options.validateInput(value).then(message => {
								currentDecoration = !!message ? Severity.Error : void 0;
								let newPick = message || defaultMessage;
								if (newPick !== currentPick) {
									currentPick = newPick;
									resolve(new TPromise(init));
								}
								return !message;
							});
						}, err => {
							// ignore
						});
					}
				}
			}).then(resolve, reject);
		};

		return new TPromise(init).then(item => {
			return currentValidation.then(valid => {
				if (valid && item) {
					return lastValue;
				}
			});
		});
	}

	public pick(picks: TPromise<string[]>, options?: IPickOptions): TPromise<string>;
	public pick<T extends IPickOpenEntry>(picks: TPromise<T[]>, options?: IPickOptions): TPromise<string>;
	public pick(picks: string[], options?: IPickOptions): TPromise<string>;
	public pick<T extends IPickOpenEntry>(picks: T[], options?: IPickOptions): TPromise<T>;
	public pick(arg1: string[] | TPromise<string[]> | IPickOpenEntry[] | TPromise<IPickOpenEntry[]>, options?: IPickOptions): TPromise<string | IPickOpenEntry> {
		if (!options) {
			options = Object.create(null);
		}

		let arrayPromise: TPromise<string[] | IPickOpenEntry[]>;
		if (Array.isArray(arg1)) {
			arrayPromise = TPromise.as(arg1);
		} else if (TPromise.is(arg1)) {
			arrayPromise = arg1;
		} else {
			throw new Error('illegal input');
		}

		let isAboutStrings = false;
		let entryPromise = arrayPromise.then(elements => {
			return (<Array<string | IPickOpenEntry>>elements).map(element => {
				if (typeof element === 'string') {
					isAboutStrings = true;
					return <IPickOpenEntry>{ label: element };
				} else {
					return element;
				}
			});
		});

		return new TPromise<string | IPickOpenEntry>((resolve, reject, progress) => {

			function onItem(item: IPickOpenEntry): string | IPickOpenEntry {
				return item && isAboutStrings ? item.label : item;
			}

			this.doPick(entryPromise, options).then(item => resolve(onItem(item)),
				err => reject(err),
				item => progress(onItem(item)));
		});
	}

	private doPick(picksPromise: TPromise<IPickOpenEntry[]>, options: IInternalPickOptions): TPromise<IPickOpenEntry> {
		let autoFocus = options.autoFocus;

		// Use a generated token to avoid race conditions from long running promises
		let currentPickerToken = uuid.generateUuid();
		this.currentPickerToken = currentPickerToken;

		// Create upon first open
		if (!this.pickOpenWidget) {
			this.pickOpenWidget = new QuickOpenWidget(
				withElementById(Identifiers.WORKBENCH_CONTAINER).getHTMLElement(),
				{
					onOk: () => { /* ignore, handle later */ },
					onCancel: () => { /* ignore, handle later */ },
					onType: (value: string) => { /* ignore, handle later */ },
					onShow: () => this.emitQuickOpenVisibilityChange(true),
					onHide: () => {
						this.restoreFocus(); // focus back to editor or viewlet
						this.emitQuickOpenVisibilityChange(false); // event
					}
				}, {
					inputPlaceHolder: options.placeHolder || ''
				},
				this.telemetryService
			);

			this.pickOpenWidget.create();
		}

		// Update otherwise
		else {
			this.pickOpenWidget.setPlaceHolder(options.placeHolder || '');
		}

		// Respect input value
		if (options.value) {
			this.pickOpenWidget.setValue(options.value);
		}

		// Respect password
		this.pickOpenWidget.setPassword(options.password);

		// Input decoration
		if (!types.isUndefinedOrNull(options.inputDecoration)) {
			this.pickOpenWidget.showInputDecoration(options.inputDecoration);
		} else {
			this.pickOpenWidget.clearInputDecoration();
		}

		// Layout
		if (this.layoutDimensions) {
			this.pickOpenWidget.layout(this.layoutDimensions);
		}

		return new TPromise<IPickOpenEntry | string>((complete, error, progress) => {
			let picksPromiseDone = false;

			// Resolve picks
			picksPromise.then((picks) => {
				if (this.currentPickerToken !== currentPickerToken) {
					return; // Return if another request came after
				}

				picksPromiseDone = true;

				// Reset Progress
				this.pickOpenWidget.getProgressBar().stop().getContainer().hide();

				// Model
				let model = new QuickOpenModel();
				let entries = picks.map((e) => {
					let entry = (<IPickOpenEntryItem>e);
					if (entry.height && entry.render) {
						return new PickOpenItem(entry.label, entry.description, entry.height, entry.render.bind(entry), () => progress(e));
					}

					return new PickOpenEntry(entry.label, entry.description, entry.detail, () => progress(e), entry.separator && entry.separator.border, entry.separator && entry.separator.label);
				});

				if (picks.length === 0) {
					entries.push(new PickOpenEntry(nls.localize('emptyPicks', "There are no entries to pick from")));
				}

				model.setEntries(entries);

				// Handlers
				this.pickOpenWidget.setCallbacks({
					onOk: () => {

						if (picks.length === 0) {
							return complete(null);
						}

						let index = -1;
						entries.forEach((entry, i) => {
							if (entry.selected) {
								index = i;
							}
						});

						complete(picks[index] || null);
					},
					onCancel: () => complete(void 0),
					onFocusLost: () => options.ignoreFocusLost,
					onType: (value: string) => {

						// the caller takes care of all input
						if (options.onDidType) {
							options.onDidType(value);
							return;
						}

						if (picks.length === 0) {
							return;
						}

						value = value ? strings.trim(value) : value;

						// Reset filtering
						if (!value) {
							entries.forEach((e) => {
								e.setHighlights(null);
								e.setHidden(false);
							});
						}

						// Filter by value
						else {
							entries.forEach((entry) => {
								let labelHighlights = filters.matchesFuzzy(value, entry.getLabel());
								let descriptionHighlights = options.matchOnDescription
									&& filters.matchesFuzzy(value, entry.getDescription());

								let detailHighlights = options.matchOnDetail && entry.getDetail()
									&& filters.matchesFuzzy(value, entry.getDetail());

								if (labelHighlights || descriptionHighlights || detailHighlights) {
									entry.setHighlights(labelHighlights, descriptionHighlights, detailHighlights);
									entry.setHidden(false);
								} else {
									entry.setHighlights(null, null, null);
									entry.setHidden(true);
								}
							});
						}

						this.pickOpenWidget.refresh(model, value ? { autoFocusFirstEntry: true } : autoFocus);
					},
					onShow: () => {
						this.emitQuickOpenVisibilityChange(true); // event
					},
					onHide: () => {
						this.restoreFocus(); // focus back to editor or viewlet
						this.emitQuickOpenVisibilityChange(false); // event
					}
				});

				// Set input
				if (!this.pickOpenWidget.isVisible()) {
					this.pickOpenWidget.show(model, autoFocus);
				} else {
					this.pickOpenWidget.setInput(model, autoFocus);
				}
			}, (err) => {
				this.pickOpenWidget.hide();

				error(err);
			});

			// Progress if task takes a long time
			TPromise.timeout(800).then(() => {
				if (!picksPromiseDone && this.currentPickerToken === currentPickerToken) {
					this.pickOpenWidget.getProgressBar().infinite().getContainer().show();
				}
			});

			// Show picker empty if resolving takes a while
			if (!picksPromiseDone) {
				this.pickOpenWidget.show(new QuickOpenModel());
			}
		});
	}

	private emitQuickOpenVisibilityChange(isVisible: boolean): void {
		if (this.visibilityChangeTimeoutHandle) {
			window.clearTimeout(this.visibilityChangeTimeoutHandle);
		}

		this.visibilityChangeTimeoutHandle = setTimeout(() => {
			if (isVisible) {
				this._onShow.fire();
			} else {
				this._onHide.fire();
			}

			this.visibilityChangeTimeoutHandle = void 0;
		}, 100 /* to prevent flashing, we accumulate visibility changes over a timeout of 100ms */);
	}

	public refresh(input?: string): TPromise<void> {
		if (!this.quickOpenWidget.isVisible()) {
			return TPromise.as(null);
		}

		if (input && this.previousValue !== input) {
			return TPromise.as(null);
		}

		return this.show(this.previousValue);
	}

	public show(prefix?: string, quickNavigateConfiguration?: IQuickNavigateConfiguration): TPromise<void> {
		this.previousValue = prefix;

		let promiseCompletedOnHide = new TPromise<void>((c) => {
			this.promisesToCompleteOnHide.push(c);
		});

		// Telemetry: log that quick open is shown and log the mode
		let registry = (<IQuickOpenRegistry>Registry.as(Extensions.Quickopen));
		let handlerDescriptor = registry.getQuickOpenHandler(prefix);
		if (!handlerDescriptor) {
			let defaultHandlerDescriptors = registry.getDefaultQuickOpenHandlers();
			if (defaultHandlerDescriptors.length > 0) {
				handlerDescriptor = defaultHandlerDescriptors[0];
			}
		}

		if (handlerDescriptor) {
			this.telemetryService.publicLog('quickOpenWidgetShown', { mode: handlerDescriptor.getId(), quickNavigate: !!quickNavigateConfiguration });
		}

		// Create upon first open
		if (!this.quickOpenWidget) {
			this.quickOpenWidget = new QuickOpenWidget(
				withElementById(Identifiers.WORKBENCH_CONTAINER).getHTMLElement(),
				{
					onOk: () => this.onClose(false),
					onCancel: () => this.onCancel(),
					onType: (value: string) => this.onType(value || ''),
					onShow: () => {
						this.inQuickOpenMode.set(true);
						this.emitQuickOpenVisibilityChange(true);
					},
					onHide: () => {
						this.inQuickOpenMode.reset();

						// Complete promises that are waiting
						while (this.promisesToCompleteOnHide.length) {
							this.promisesToCompleteOnHide.pop()(true);
						}

						this.restoreFocus(); // focus back to editor or viewlet
						this.emitQuickOpenVisibilityChange(false);
					}
				}, {
					inputPlaceHolder: this.hasHandler(HELP_PREFIX) ? nls.localize('quickOpenInput', "Type '?' to get help on the actions you can take from here") : ''
				},
				this.telemetryService
			);

			this.quickOpenWidget.create();
		}

		// Layout
		if (this.layoutDimensions) {
			this.quickOpenWidget.layout(this.layoutDimensions);
		}

		// Show quick open with prefix or editor history
		if (!this.quickOpenWidget.isVisible() || quickNavigateConfiguration) {
			if (prefix) {
				this.quickOpenWidget.show(prefix);
			} else {
				let editorHistory = this.getEditorHistoryModelWithGroupLabel();
				if (editorHistory.getEntries().length < 2) {
					quickNavigateConfiguration = null; // If no entries can be shown, default to normal quick open mode
				}

				let autoFocus: IAutoFocus;
				if (!quickNavigateConfiguration) {
					autoFocus = { autoFocusFirstEntry: true };
				} else {
					let visibleEditorCount = this.editorService.getVisibleEditors().length;
					autoFocus = { autoFocusFirstEntry: visibleEditorCount === 0, autoFocusSecondEntry: visibleEditorCount !== 0 };
				}

				this.quickOpenWidget.show(editorHistory, autoFocus, quickNavigateConfiguration);
			}
		}

		// Otherwise reset the widget to the prefix that is passed in
		else {
			this.quickOpenWidget.show(prefix || '');
		}

		return promiseCompletedOnHide;
	}

	private hasHandler(prefix: string): boolean {
		return !!(<IQuickOpenRegistry>Registry.as(Extensions.Quickopen)).getQuickOpenHandler(prefix);
	}

	private getEditorHistoryModelWithGroupLabel(): QuickOpenModel {
		let entries: QuickOpenEntry[] = this.editorHistoryModel.getEntries();

		// Apply label to first entry
		if (entries.length > 0) {
			entries[0] = new QuickOpenEntryGroup(entries[0], nls.localize('historyMatches', "recently opened"), false);
		}

		return new QuickOpenModel(entries, this.actionProvider);
	}

	private onCancel(notifyHandlers = true): void {

		// Indicate to handlers
		if (notifyHandlers) {
			this.onClose(true);
		}
	}

	private onClose(canceled: boolean): void {

		// Clear state
		this.previousActiveHandlerDescriptor = null;

		// Pass to handlers
		for (let prefix in this.mapResolvedHandlersToPrefix) {
			if (this.mapResolvedHandlersToPrefix.hasOwnProperty(prefix)) {
				let handler = this.mapResolvedHandlersToPrefix[prefix];
				handler.onClose(canceled);
			}
		}
	}

	private restoreFocus(): void {

		// Try to focus active editor
		let editor = this.editorService.getActiveEditor();
		if (editor) {
			editor.focus();
		}
	}

	private onType(value: string): void {
		this.previousValue = value;

		// Use a generated token to avoid race conditions from long running promises
		let currentResultToken = uuid.generateUuid();
		this.currentResultToken = currentResultToken;

		// Reset Progress
		this.quickOpenWidget.getProgressBar().stop().getContainer().hide();

		// Reset Extra Class
		this.quickOpenWidget.setExtraClass(null);

		// Remove leading and trailing whitespace
		let trimmedValue = strings.trim(value);

		// If no value provided, default to editor history
		if (!trimmedValue) {
			this.quickOpenWidget.setInput(this.getEditorHistoryModelWithGroupLabel(), { autoFocusFirstEntry: true });
			return;
		}

		let resultPromise: TPromise<void>;
		let resultPromiseDone = false;

		// look for a handler
		let registry = (<IQuickOpenRegistry>Registry.as(Extensions.Quickopen));
		let handlerDescriptor = registry.getQuickOpenHandler(value);
		if (handlerDescriptor) {
			resultPromise = this.handleSpecificHandler(handlerDescriptor, value, currentResultToken);
		}

		// Otherwise handle default handlers if no specific handler present
		else {
			let defaultHandlers = registry.getDefaultQuickOpenHandlers();
			resultPromise = this.handleDefaultHandlers(defaultHandlers, value, currentResultToken);
		}

		// Remember as the active one
		this.previousActiveHandlerDescriptor = handlerDescriptor;

		// Progress if task takes a long time
		TPromise.timeout(handlerDescriptor && handlerDescriptor.instantProgress ? 0 : 800).then(() => {
			if (!resultPromiseDone && currentResultToken === this.currentResultToken) {
				this.quickOpenWidget.getProgressBar().infinite().getContainer().show();
			}
		});

		// Promise done handling
		resultPromise.done(() => {
			resultPromiseDone = true;

			if (currentResultToken === this.currentResultToken) {
				this.quickOpenWidget.getProgressBar().getContainer().hide();
			}
		}, (error: any) => {
			resultPromiseDone = true;
			errors.onUnexpectedError(error);
			this.messageService.show(Severity.Error, types.isString(error) ? new Error(error) : error);
		});
	}

	private handleDefaultHandlers(defaultHandlers: QuickOpenHandlerDescriptor[], value: string, currentResultToken: string): TPromise<void> {

		// Fill in history results if matching
		let matchingHistoryEntries = this.editorHistoryModel.getResults(value);
		if (matchingHistoryEntries.length > 0) {
			matchingHistoryEntries[0] = new QuickOpenEntryGroup(matchingHistoryEntries[0], nls.localize('historyMatches', "recently opened"), false);
		}

		let quickOpenModel = new QuickOpenModel(matchingHistoryEntries, this.actionProvider);

		// Set input and await additional results from handlers coming in later
		this.quickOpenWidget.setInput(quickOpenModel, { autoFocusFirstEntry: true });

		// If no handler present, return early
		if (defaultHandlers.length === 0) {
			return TPromise.as(null);
		}

		// Resolve all default handlers
		let resolvePromises: TPromise<QuickOpenHandler>[] = [];
		defaultHandlers.forEach((defaultHandler) => {
			resolvePromises.push(this.resolveHandler(defaultHandler));
		});

		return TPromise.join(resolvePromises).then((resolvedHandlers: QuickOpenHandler[]) => {
			let resultPromises: TPromise<void>[] = [];
			resolvedHandlers.forEach((resolvedHandler) => {

				// Return early if the handler can not run in the current environment
				let canRun = resolvedHandler.canRun();
				if (types.isUndefinedOrNull(canRun) || (typeof canRun === 'boolean' && !canRun) || typeof canRun === 'string') {
					return;
				}

				// Receive Results from Handler and apply
				resultPromises.push(resolvedHandler.getResults(value).then((result) => {
					if (this.currentResultToken === currentResultToken) {
						let handlerResults = result && result.entries;

						if (!handlerResults) {
							handlerResults = []; // guard against handler returning nothing
						}

						this.mergeResults(quickOpenModel, handlerResults, resolvedHandler.getGroupLabel());
					}
				}));
			});

			return TPromise.join(resultPromises).then(() => void 0);
		});
	}

	private mergeResults(quickOpenModel: QuickOpenModel, handlerResults: QuickOpenEntry[], groupLabel: string): void {

		// Remove results already showing by checking for a "resource" property
		let mapEntryToResource = this.mapEntriesToResource(quickOpenModel);
		let additionalHandlerResults: QuickOpenEntry[] = [];
		for (let i = 0; i < handlerResults.length; i++) {
			let result = handlerResults[i];
			let resource = result.getResource();

			if (!resource || !mapEntryToResource[resource.toString()]) {
				additionalHandlerResults.push(result);
			}
		}

		// Show additional handler results below any existing results
		if (additionalHandlerResults.length > 0) {
			let useTopBorder = quickOpenModel.getEntries().length > 0;
			additionalHandlerResults[0] = new QuickOpenEntryGroup(additionalHandlerResults[0], groupLabel, useTopBorder);
			quickOpenModel.addEntries(additionalHandlerResults);
			this.quickOpenWidget.refresh(quickOpenModel, { autoFocusFirstEntry: true });
		}

		// Otherwise if no results are present (even from histoy) indicate this to the user
		else if (quickOpenModel.getEntries().length === 0) {
			quickOpenModel.addEntries([new PlaceholderQuickOpenEntry(nls.localize('noResultsFound1', "No results found"))]);
			this.quickOpenWidget.refresh(quickOpenModel, { autoFocusFirstEntry: true });
		}
	}

	private handleSpecificHandler(handlerDescriptor: QuickOpenHandlerDescriptor, value: string, currentResultToken: string): TPromise<void> {
		return this.resolveHandler(handlerDescriptor).then((resolvedHandler: QuickOpenHandler) => {

			// Remove handler prefix from search value
			value = value.substr(handlerDescriptor.prefix.length);

			// Return early if the handler can not run in the current environment and inform the user
			let canRun = resolvedHandler.canRun();
			if (types.isUndefinedOrNull(canRun) || (typeof canRun === 'boolean' && !canRun) || typeof canRun === 'string') {
				let placeHolderLabel = (typeof canRun === 'string') ? canRun : nls.localize('canNotRunPlaceholder', "This quick open handler can not be used in the current context");

				const model = new QuickOpenModel([new PlaceholderQuickOpenEntry(placeHolderLabel)], this.actionProvider);
				this.showModel(model, resolvedHandler.getAutoFocus(value), resolvedHandler.getAriaLabel());

				return TPromise.as(null);
			}

			// Support extra class from handler
			let extraClass = resolvedHandler.getClass();
			if (extraClass) {
				this.quickOpenWidget.setExtraClass(extraClass);
			}

			// When handlers change, clear the result list first before loading the new results
			if (this.previousActiveHandlerDescriptor !== handlerDescriptor) {
				this.clearModel();
			}

			// Receive Results from Handler and apply
			return resolvedHandler.getResults(value).then((result) => {
				if (this.currentResultToken === currentResultToken) {
					if (!result || !result.entries.length) {
						const model = new QuickOpenModel([new PlaceholderQuickOpenEntry(resolvedHandler.getEmptyLabel(value))]);
						this.showModel(model, resolvedHandler.getAutoFocus(value), resolvedHandler.getAriaLabel());
					} else {
						this.showModel(result, resolvedHandler.getAutoFocus(value), resolvedHandler.getAriaLabel());
					}
				}
			});
		});
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
		this.showModel(new QuickOpenModel(), null);
	}

	private mapEntriesToResource(model: QuickOpenModel): { [resource: string]: QuickOpenEntry; } {
		let entries = model.getEntries();
		let mapEntryToPath: { [path: string]: QuickOpenEntry; } = {};
		entries.forEach((entry: QuickOpenEntry) => {
			if (entry.getResource()) {
				mapEntryToPath[entry.getResource().toString()] = entry;
			}
		});

		return mapEntryToPath;
	}

	private resolveHandler(handler: QuickOpenHandlerDescriptor): TPromise<QuickOpenHandler> {
		let id = handler.getId();

		// Return Cached
		if (this.mapResolvedHandlersToPrefix[id]) {
			return TPromise.as(this.mapResolvedHandlersToPrefix[id]);
		}

		// Otherwise load and create
		return this.instantiationService.createInstance(handler).then((resolvedHandler: QuickOpenHandler) => {
			this.mapResolvedHandlersToPrefix[id] = resolvedHandler;

			return resolvedHandler;
		}, (error) => {
			return TPromise.wrapError('Unable to instanciate quick open handler ' + handler.moduleName + ' - ' + handler.ctorName + ': ' + JSON.stringify(error));
		});
	}

	public shutdown(): void {

		// Save Editor Input History
		this.saveEditorHistory(false);

		// Call Super
		super.shutdown();
	}

	private saveEditorHistory(toLocalStorage: boolean): void {
		if (!this.memento[EDITOR_HISTORY_STORAGE_KEY]) {
			this.memento[EDITOR_HISTORY_STORAGE_KEY] = {};
		}
		this.editorHistoryModel.saveTo(this.memento[EDITOR_HISTORY_STORAGE_KEY]);

		if (toLocalStorage) {
			this.saveMemento();
		}
	}

	public layout(dimension: Dimension): void {
		this.layoutDimensions = dimension;
		if (this.quickOpenWidget) {
			this.quickOpenWidget.layout(this.layoutDimensions);
		}

		if (this.pickOpenWidget) {
			this.pickOpenWidget.layout(this.layoutDimensions);
		}
	}

	public dispose(): void {
		if (this.quickOpenWidget) {
			this.quickOpenWidget.dispose();
		}

		if (this.pickOpenWidget) {
			this.pickOpenWidget.dispose();
		}

		super.dispose();
	}
}

class PlaceholderQuickOpenEntry extends QuickOpenEntryGroup {
	private placeHolderLabel: string;

	constructor(placeHolderLabel: string) {
		super();

		this.placeHolderLabel = placeHolderLabel;
	}

	public getLabel(): string {
		return this.placeHolderLabel;
	}
}

class PickOpenEntry extends PlaceholderQuickOpenEntry {
	private _selected: boolean;
	private description: string;
	private detail: string;

	constructor(label: string, description?: string, detail?: string, private onPreview?: () => void, private hasSeparator?: boolean, private separatorLabel?: string) {
		super(label);

		this.description = description;
		this.detail = detail;
	}

	public get selected(): boolean {
		return this._selected;
	}

	public getDescription(): string {
		return this.description;
	}

	public getDetail(): string {
		return this.detail;
	}

	public showBorder(): boolean {
		return this.hasSeparator;
	}

	public getGroupLabel(): string {
		return this.separatorLabel;
	}

	public run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.OPEN) {
			this._selected = true;

			return true;
		}

		if (mode === Mode.PREVIEW && this.onPreview) {
			this.onPreview();
		}

		return false;
	}
}

class PickOpenItem extends QuickOpenEntryItem {
	private _selected: boolean;

	constructor(private label: string, private description: string, private height: number, private renderFn: (tree: ITree, container: HTMLElement, previousCleanupFn: IElementCallback) => IElementCallback, private onPreview?: () => void) {
		super();
	}

	public getHeight(): number {
		return this.height;
	}

	public render(tree: ITree, container: HTMLElement, previousCleanupFn: IElementCallback): IElementCallback {
		return this.renderFn(tree, container, previousCleanupFn);
	}

	public get selected(): boolean {
		return this._selected;
	}

	public getLabel(): string {
		return this.label;
	}

	public getDescription(): string {
		return this.description;
	}

	public run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.OPEN) {
			this._selected = true;

			return true;
		}

		if (mode === Mode.PREVIEW && this.onPreview) {
			this.onPreview();
		}

		return false;
	}
}