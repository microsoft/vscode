/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/quickopen';
import 'vs/workbench/browser/parts/quickopen/quickopen.contribution';
import {TPromise, ValueCallback} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {Dimension, withElementById} from 'vs/base/browser/builder';
import strings = require('vs/base/common/strings');
import filters = require('vs/base/common/filters');
import URI from 'vs/base/common/uri';
import uuid = require('vs/base/common/uuid');
import types = require('vs/base/common/types');
import {CancellationToken} from 'vs/base/common/cancellation';
import {Mode, IEntryRunContext, IAutoFocus, IQuickNavigateConfiguration, IModel} from 'vs/base/parts/quickopen/common/quickOpen';
import {QuickOpenEntryItem, QuickOpenEntry, QuickOpenModel, QuickOpenEntryGroup} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {QuickOpenWidget, HideReason} from 'vs/base/parts/quickopen/browser/quickOpenWidget';
import {ContributableActionProvider} from 'vs/workbench/browser/actionBarRegistry';
import {ITree, IElementCallback} from 'vs/base/parts/tree/browser/tree';
import labels = require('vs/base/common/labels');
import paths = require('vs/base/common/paths');
import {Registry} from 'vs/platform/platform';
import {EditorInput, getUntitledOrFileResource, IWorkbenchEditorConfiguration} from 'vs/workbench/common/editor';
import {WorkbenchComponent} from 'vs/workbench/common/component';
import Event, {Emitter} from 'vs/base/common/event';
import {Identifiers} from 'vs/workbench/common/constants';
import {KeyMod} from 'vs/base/common/keyCodes';
import {QuickOpenHandler, QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions, EditorQuickOpenEntry} from 'vs/workbench/browser/quickopen';
import errors = require('vs/base/common/errors');
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IPickOpenEntry, IInputOptions, IQuickOpenService, IPickOptions, IShowOptions} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IContextKeyService, RawContextKey, IContextKey} from 'vs/platform/contextkey/common/contextkey';
import {IHistoryService} from 'vs/workbench/services/history/common/history';

const HELP_PREFIX = '?';
const QUICK_OPEN_MODE = new RawContextKey<boolean>('inQuickOpen', false);

interface IPickOpenEntryItem extends IPickOpenEntry {
	height?: number;
	render?: (tree: ITree, container: HTMLElement, previousCleanupFn: IElementCallback) => IElementCallback;
}

interface IWorkbenchQuickOpenConfiguration {
	workbench: {
		quickOpen: {
			closeOnFocusLost: boolean;
		}
	};
}

interface IInternalPickOptions {
	value?: string;
	valueSelect?: boolean;
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

	public _serviceBrand: any;

	private static ID = 'workbench.component.quickopen';

	private _onShow: Emitter<void>;
	private _onHide: Emitter<void>;

	private quickOpenWidget: QuickOpenWidget;
	private pickOpenWidget: QuickOpenWidget;
	private layoutDimensions: Dimension;
	private mapResolvedHandlersToPrefix: { [prefix: string]: TPromise<QuickOpenHandler>; };
	private handlerOnOpenCalled: { [prefix: string]: boolean; };
	private currentResultToken: string;
	private currentPickerToken: string;
	private inQuickOpenMode: IContextKey<boolean>;
	private promisesToCompleteOnHide: ValueCallback[];
	private previousActiveHandlerDescriptor: QuickOpenHandlerDescriptor;
	private actionProvider = new ContributableActionProvider();
	private previousValue = '';
	private visibilityChangeTimeoutHandle: number;
	private closeOnFocusLost: boolean;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IHistoryService private historyService: IHistoryService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(QuickOpenController.ID);

		this.mapResolvedHandlersToPrefix = {};
		this.handlerOnOpenCalled = {};

		this.promisesToCompleteOnHide = [];

		this.inQuickOpenMode = QUICK_OPEN_MODE.bindTo(contextKeyService);

		this._onShow = new Emitter<void>();
		this._onHide = new Emitter<void>();

		this.updateConfiguration(<IWorkbenchQuickOpenConfiguration>this.configurationService.getConfiguration());

		this.registerListeners();
	}

	private registerListeners(): void {
		this.configurationService.onDidUpdateConfiguration(e => this.updateConfiguration(e.config));
	}

	private updateConfiguration(settings: IWorkbenchQuickOpenConfiguration): void {
		this.closeOnFocusLost = settings.workbench.quickOpen.closeOnFocusLost;
	}

	public get onShow(): Event<void> {
		return this._onShow.event;
	}

	public get onHide(): Event<void> {
		return this._onHide.event;
	}

	public quickNavigate(configuration: IQuickNavigateConfiguration, next: boolean): void {
		if (this.quickOpenWidget) {
			this.quickOpenWidget.quickNavigate(configuration, next);
		}
	}

	public input(options: IInputOptions = {}, token: CancellationToken = CancellationToken.None): TPromise<string> {
		const defaultMessage = options.prompt
			? nls.localize('inputModeEntryDescription', "{0} (Press 'Enter' to confirm or 'Escape' to cancel)", options.prompt)
			: nls.localize('inputModeEntry', "Press 'Enter' to confirm your input or 'Escape' to cancel");

		let currentPick = defaultMessage;
		let currentValidation = TPromise.as(true);
		let currentDecoration: Severity;
		let lastValue: string;

		const init = (resolve: (value: IPickOpenEntry | TPromise<IPickOpenEntry>) => any, reject: (value: any) => any) => {

			// open quick pick with just one choice. we will recurse whenever
			// the validation/success message changes
			this.doPick(TPromise.as([{ label: currentPick }]), {
				ignoreFocusLost: options.ignoreFocusLost,
				autoFocus: { autoFocusFirstEntry: true },
				password: options.password,
				placeHolder: options.placeHolder,
				value: lastValue === void 0 ? options.value : lastValue,
				valueSelect: lastValue === void 0,
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
			}, token).then(resolve, reject);
		};

		return new TPromise(init).then(item => {
			return currentValidation.then(valid => {
				if (valid && item) {
					return lastValue || '';
				}
			});
		});
	}

	public pick(picks: TPromise<string[]>, options?: IPickOptions, token?: CancellationToken): TPromise<string>;
	public pick<T extends IPickOpenEntry>(picks: TPromise<T[]>, options?: IPickOptions, token?: CancellationToken): TPromise<string>;
	public pick(picks: string[], options?: IPickOptions, token?: CancellationToken): TPromise<string>;
	public pick<T extends IPickOpenEntry>(picks: T[], options?: IPickOptions, token?: CancellationToken): TPromise<T>;
	public pick(arg1: string[] | TPromise<string[]> | IPickOpenEntry[] | TPromise<IPickOpenEntry[]>, options?: IPickOptions, token?: CancellationToken): TPromise<string | IPickOpenEntry> {
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

			this.doPick(entryPromise, options, token).then(item => resolve(onItem(item)), err => reject(err), item => progress(onItem(item)));
		});
	}

	private doPick(picksPromise: TPromise<IPickOpenEntry[]>, options: IInternalPickOptions, token: CancellationToken = CancellationToken.None): TPromise<IPickOpenEntry> {
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
					onShow: () => this.handleOnShow(true),
					onHide: (reason) => this.handleOnHide(true, reason)
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
			this.pickOpenWidget.setValue(options.value, options.valueSelect);
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

			// hide widget when being cancelled
			token.onCancellationRequested(e => this.pickOpenWidget.hide(HideReason.CANCELED));

			let picksPromiseDone = false;

			// Resolve picks
			picksPromise.then(picks => {
				if (this.currentPickerToken !== currentPickerToken) {
					return; // Return if another request came after
				}

				picksPromiseDone = true;

				// Reset Progress
				this.pickOpenWidget.getProgressBar().stop().getContainer().hide();

				// Model
				let model = new QuickOpenModel();
				let entries = picks.map(e => {
					let entry = (<IPickOpenEntryItem>e);
					if (entry.height && entry.render) {
						return new PickOpenItem(entry, () => progress(e));
					}

					return new PickOpenEntry(entry, () => progress(e));
				});

				if (picks.length === 0) {
					entries.push(new PickOpenEntry({ label: nls.localize('emptyPicks', "There are no entries to pick from") }));
				}

				model.setEntries(entries);

				// Handlers
				this.pickOpenWidget.setCallbacks({
					onOk: () => {
						if (picks.length === 0) {
							return complete(null);
						}

						let index = -1;
						let context: IEntryRunContext;
						entries.forEach((entry, i) => {
							if (entry.shouldRunWithContext) {
								index = i;
								context = entry.shouldRunWithContext;
							}
						});

						const selectedPick = picks[index];

						if (selectedPick && typeof selectedPick.run === 'function') {
							selectedPick.run(context);
						}

						complete(selectedPick || null);
					},
					onCancel: () => complete(void 0),
					onFocusLost: () => !this.closeOnFocusLost || options.ignoreFocusLost,
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
							entries.forEach(e => {
								e.setHighlights(null);
								e.setHidden(false);
							});
						}

						// Filter by value
						else {
							entries.forEach(entry => {
								let labelHighlights = filters.matchesFuzzy(value, entry.getLabel());
								let descriptionHighlights = options.matchOnDescription && filters.matchesFuzzy(value, entry.getDescription());
								let detailHighlights = options.matchOnDetail && entry.getDetail() && filters.matchesFuzzy(value, entry.getDetail());

								if (entry.shouldAlwaysShow() || labelHighlights || descriptionHighlights || detailHighlights) {
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
					onShow: () => this.handleOnShow(true),
					onHide: (reason) => this.handleOnHide(true, reason)
				});

				// Set input
				if (!this.pickOpenWidget.isVisible()) {
					this.pickOpenWidget.show(model, { autoFocus });
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

	public accept(): void {
		[this.quickOpenWidget, this.pickOpenWidget].forEach(w => {
			if (w && w.isVisible()) {
				w.accept();
			}
		});
	}

	public focus(): void {
		[this.quickOpenWidget, this.pickOpenWidget].forEach(w => {
			if (w && w.isVisible()) {
				w.focus();
			}
		});
	}

	public close(): void {
		[this.quickOpenWidget, this.pickOpenWidget].forEach(w => {
			if (w && w.isVisible()) {
				w.hide(HideReason.CANCELED);
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

	public show(prefix?: string, options?: IShowOptions): TPromise<void> {
		let quickNavigateConfiguration = options ? options.quickNavigateConfiguration : void 0;

		this.previousValue = prefix;

		let promiseCompletedOnHide = new TPromise<void>(c => {
			this.promisesToCompleteOnHide.push(c);
		});

		// Telemetry: log that quick open is shown and log the mode
		let registry = (<IQuickOpenRegistry>Registry.as(Extensions.Quickopen));
		let handlerDescriptors = [registry.getQuickOpenHandler(prefix)];
		if (!handlerDescriptors[0]) {
			handlerDescriptors = registry.getDefaultQuickOpenHandlers();
		}

		if (handlerDescriptors[0]) {
			this.telemetryService.publicLog('quickOpenWidgetShown', { mode: handlerDescriptors[0].getId(), quickNavigate: quickNavigateConfiguration });
		}

		// Trigger onOpen
		handlerDescriptors.forEach(desc => this.resolveHandler(desc));

		// Create upon first open
		if (!this.quickOpenWidget) {
			this.quickOpenWidget = new QuickOpenWidget(
				withElementById(Identifiers.WORKBENCH_CONTAINER).getHTMLElement(),
				{
					onOk: () => { /* ignore */ },
					onCancel: () => { /* ignore */ },
					onType: (value: string) => this.onType(value || ''),
					onShow: () => this.handleOnShow(false),
					onHide: (reason) => this.handleOnHide(false, reason),
					onFocusLost: () => !this.closeOnFocusLost
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
				this.quickOpenWidget.show(prefix, { quickNavigateConfiguration });
			} else {
				let editorHistory = this.getEditorHistoryWithGroupLabel();
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

				this.quickOpenWidget.show(editorHistory, { quickNavigateConfiguration, autoFocus });
			}
		}

		// Otherwise reset the widget to the prefix that is passed in
		else {
			this.quickOpenWidget.show(prefix || '');
		}

		return promiseCompletedOnHide;
	}

	private handleOnShow(isPicker: boolean): void {
		if (isPicker && this.quickOpenWidget) {
			this.quickOpenWidget.hide(HideReason.FOCUS_LOST);
		} else if (!isPicker && this.pickOpenWidget) {
			this.pickOpenWidget.hide(HideReason.FOCUS_LOST);
		}

		this.inQuickOpenMode.set(true);
		this.emitQuickOpenVisibilityChange(true);
	}

	private handleOnHide(isPicker: boolean, reason: HideReason): void {
		if (!isPicker) {

			// Clear state
			this.previousActiveHandlerDescriptor = null;

			// Pass to handlers
			for (let prefix in this.mapResolvedHandlersToPrefix) {
				if (this.mapResolvedHandlersToPrefix.hasOwnProperty(prefix)) {
					let promise = this.mapResolvedHandlersToPrefix[prefix];
					promise.then(handler => {
						this.handlerOnOpenCalled[prefix] = false;
						// Don't check if onOpen was called to preserve old behaviour for now
						handler.onClose(reason === HideReason.CANCELED);
					});
				}
			}

			// Complete promises that are waiting
			while (this.promisesToCompleteOnHide.length) {
				this.promisesToCompleteOnHide.pop()(true);
			}
		}

		if (reason !== HideReason.FOCUS_LOST) {
			this.restoreFocus(); // focus back to editor unless user clicked somewhere else
		}

		this.inQuickOpenMode.reset();
		this.emitQuickOpenVisibilityChange(false);
	}

	private hasHandler(prefix: string): boolean {
		return !!(<IQuickOpenRegistry>Registry.as(Extensions.Quickopen)).getQuickOpenHandler(prefix);
	}

	private getEditorHistoryWithGroupLabel(): QuickOpenModel {
		let entries: QuickOpenEntry[] = this.getEditorHistoryEntries();

		// Apply label to first entry
		if (entries.length > 0) {
			entries[0] = new EditorHistoryEntryGroup(entries[0], nls.localize('historyMatches', "recently opened"), false);
		}

		return new QuickOpenModel(entries, this.actionProvider);
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

		// look for a handler
		const registry = Registry.as<IQuickOpenRegistry>(Extensions.Quickopen);
		const handlerDescriptor = registry.getQuickOpenHandler(value);
		const instantProgress = handlerDescriptor && handlerDescriptor.instantProgress;

		// Use a generated token to avoid race conditions from long running promises
		let currentResultToken = uuid.generateUuid();
		this.currentResultToken = currentResultToken;

		// Reset Progress
		if (!instantProgress) {
			this.quickOpenWidget.getProgressBar().stop().getContainer().hide();
		}

		// Reset Extra Class
		this.quickOpenWidget.setExtraClass(null);

		// Trigger onOpen
		if (handlerDescriptor) {
			this.resolveHandler(handlerDescriptor);
		} else {
			registry.getDefaultQuickOpenHandlers().forEach(desc => this.resolveHandler(desc));
		}

		// Remove leading and trailing whitespace
		let trimmedValue = strings.trim(value);

		// If no value provided, default to editor history
		if (!trimmedValue) {
			this.quickOpenWidget.setInput(this.getEditorHistoryWithGroupLabel(), { autoFocusFirstEntry: true });
			return;
		}

		let resultPromise: TPromise<void>;
		let resultPromiseDone = false;

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
		TPromise.timeout(instantProgress ? 0 : 800).then(() => {
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
		const previousInput = this.quickOpenWidget.getInput();
		const wasShowingHistory = previousInput && previousInput.entries && previousInput.entries.some(e => e instanceof EditorHistoryEntry || e instanceof EditorHistoryEntryGroup);

		// Fill in history results if matching
		let matchingHistoryEntries = this.getEditorHistoryEntries(value);
		if (matchingHistoryEntries.length > 0) {
			matchingHistoryEntries[0] = new EditorHistoryEntryGroup(matchingHistoryEntries[0], nls.localize('historyMatches', "recently opened"), false);
		}

		// If we have matching entries from history we want to show them directly and not wait for the other results to come in
		// This also applies when we used to have entries from a previous run and now there are no more history results matching
		let inputSet = false;
		let quickOpenModel = new QuickOpenModel(matchingHistoryEntries, this.actionProvider);
		if (wasShowingHistory || matchingHistoryEntries.length > 0) {
			this.quickOpenWidget.setInput(quickOpenModel, { autoFocusFirstEntry: true });
			inputSet = true;
		}

		// Resolve all default handlers
		let resolvePromises: TPromise<QuickOpenHandler>[] = [];
		defaultHandlers.forEach(defaultHandler => {
			resolvePromises.push(this.resolveHandler(defaultHandler));
		});

		return TPromise.join(resolvePromises).then((resolvedHandlers: QuickOpenHandler[]) => {
			let resultPromises: TPromise<void>[] = [];
			resolvedHandlers.forEach(resolvedHandler => {

				// Receive Results from Handler and apply
				resultPromises.push(resolvedHandler.getResults(value).then(result => {
					if (this.currentResultToken === currentResultToken) {
						let handlerResults = (result && result.entries) || [];

						// now is the time to show the input if we did not have set it before
						if (!inputSet) {
							this.quickOpenWidget.setInput(quickOpenModel, { autoFocusFirstEntry: true });
						}

						this.mergeResults(quickOpenModel, handlerResults, resolvedHandler.getGroupLabel());
					}
				}));
			});

			return TPromise.join(resultPromises).then(() => void 0);
		});
	}

	private getEditorHistoryEntries(searchValue?: string): QuickOpenEntry[] {
		if (searchValue) {
			searchValue = searchValue.replace(/ /g, ''); // get rid of all whitespace
		}

		// Just return all if we are not searching
		const history = this.historyService.getHistory();
		if (!searchValue) {
			return history.map(input => this.instantiationService.createInstance(EditorHistoryEntry, input));
		}

		const searchInPath = searchValue.indexOf(paths.nativeSep) >= 0;

		let results: QuickOpenEntry[] = [];
		history.forEach(input => {
			const resource = getUntitledOrFileResource(input);
			if (!resource) {
				return; //For now, only support to match on inputs that provide resource information
			}

			// Check if this entry is a match for the search value
			let targetToMatch = searchInPath ? labels.getPathLabel(resource, this.contextService) : input.getName();
			if (!filters.matchesFuzzy(searchValue, targetToMatch)) {
				return;
			}

			let entry = this.instantiationService.createInstance(EditorHistoryEntry, input);

			const {labelHighlights, descriptionHighlights} = QuickOpenEntry.highlight(entry, searchValue);
			entry.setHighlights(labelHighlights, descriptionHighlights);

			results.push(entry);
		});

		// Sort
		return results.sort((elementA: EditorHistoryEntry, elementB: EditorHistoryEntry) => QuickOpenEntry.compare(elementA, elementB, searchValue));
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
				this.showModel(model, resolvedHandler.getAutoFocus(value, this.quickOpenWidget.getQuickNavigateConfiguration()), resolvedHandler.getAriaLabel());

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
			return resolvedHandler.getResults(value).then(result => {
				if (this.currentResultToken === currentResultToken) {
					if (!result || !result.entries.length) {
						const model = new QuickOpenModel([new PlaceholderQuickOpenEntry(resolvedHandler.getEmptyLabel(value))]);
						this.showModel(model, resolvedHandler.getAutoFocus(value, this.quickOpenWidget.getQuickNavigateConfiguration()), resolvedHandler.getAriaLabel());
					} else {
						this.showModel(result, resolvedHandler.getAutoFocus(value, this.quickOpenWidget.getQuickNavigateConfiguration()), resolvedHandler.getAriaLabel());
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
		let result = this._resolveHandler(handler);
		const id = handler.getId();
		if (!this.handlerOnOpenCalled[id]) {
			const original = result;
			this.handlerOnOpenCalled[id] = true;
			result = this.mapResolvedHandlersToPrefix[id] = original.then(resolved => {
				this.mapResolvedHandlersToPrefix[id] = original;
				resolved.onOpen();
				return resolved;
			});
		}
		return result.then(null, (error) => {
			delete this.mapResolvedHandlersToPrefix[id];
			return TPromise.wrapError('Unable to instantiate quick open handler ' + handler.moduleName + ' - ' + handler.ctorName + ': ' + JSON.stringify(error));
		});
	}

	private _resolveHandler(handler: QuickOpenHandlerDescriptor): TPromise<QuickOpenHandler> {
		let id = handler.getId();

		// Return Cached
		if (this.mapResolvedHandlersToPrefix[id]) {
			return this.mapResolvedHandlersToPrefix[id];
		}

		// Otherwise load and create
		return this.mapResolvedHandlersToPrefix[id] = this.instantiationService.createInstance(handler);
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
	private _shouldRunWithContext: IEntryRunContext;
	private description: string;
	private detail: string;
	private hasSeparator: boolean;
	private separatorLabel: string;
	private alwaysShow: boolean;

	constructor(
		item: IPickOpenEntry,
		private onPreview?: () => void
	) {
		super(item.label);

		this.description = item.description;
		this.detail = item.detail;
		this.hasSeparator = item.separator && item.separator.border;
		this.separatorLabel = item.separator && item.separator.label;
		this.alwaysShow = item.alwaysShow;
	}

	public get shouldRunWithContext(): IEntryRunContext {
		return this._shouldRunWithContext;
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

	public shouldAlwaysShow(): boolean {
		return this.alwaysShow;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			this._shouldRunWithContext = context;

			return true;
		}

		if (mode === Mode.PREVIEW && this.onPreview) {
			this.onPreview();
		}

		return false;
	}
}

class PickOpenItem extends QuickOpenEntryItem {
	private _shouldRunWithContext: IEntryRunContext;
	private label: string;
	private description: string;
	private height: number;
	private renderFn: (tree: ITree, container: HTMLElement, previousCleanupFn: IElementCallback) => IElementCallback;
	private alwaysShow: boolean;

	constructor(
		item: IPickOpenEntryItem,
		private onPreview?: () => void
	) {
		super();

		this.label = item.label;
		this.description = item.description;
		this.height = item.height;
		this.renderFn = item.render.bind(item);
		this.alwaysShow = item.alwaysShow;
	}

	public getHeight(): number {
		return this.height;
	}

	public render(tree: ITree, container: HTMLElement, previousCleanupFn: IElementCallback): IElementCallback {
		return this.renderFn(tree, container, previousCleanupFn);
	}

	public get shouldRunWithContext(): IEntryRunContext {
		return this._shouldRunWithContext;
	}

	public getLabel(): string {
		return this.label;
	}

	public getDescription(): string {
		return this.description;
	}

	public shouldAlwaysShow(): boolean {
		return this.alwaysShow;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			this._shouldRunWithContext = context;

			return true;
		}

		if (mode === Mode.PREVIEW && this.onPreview) {
			this.onPreview();
		}

		return false;
	}
}

export class EditorHistoryEntryGroup extends QuickOpenEntryGroup {
	// Marker class
}

export class EditorHistoryEntry extends EditorQuickOpenEntry {
	private input: EditorInput;
	private resource: URI;

	constructor(
		input: EditorInput,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(editorService);

		this.input = input;
		this.resource = getUntitledOrFileResource(input);
	}

	public getIcon(): string {
		return this.input.isDirty() ? 'dirty' : '';
	}

	public getLabel(): string {
		return this.input.getName();
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, recently opened", this.getLabel());
	}

	public getDescription(): string {
		return this.input.getDescription();
	}

	public getResource(): URI {
		return this.resource;
	}

	public getInput(): EditorInput {
		return this.input;
	}

	public matches(input: EditorInput): boolean {
		return this.input.matches(input);
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			const sideBySide = !context.quickNavigateConfiguration && context.keymods.indexOf(KeyMod.CtrlCmd) >= 0;
			const pinned = !this.configurationService.getConfiguration<IWorkbenchEditorConfiguration>().workbench.editor.enablePreviewFromQuickOpen;

			this.editorService.openEditor(this.input, { pinned }, sideBySide).done(null, errors.onUnexpectedError);

			return true;
		}

		return false;
	}
}