/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/quickopen';
import { TPromise, ValueCallback } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import * as browser from 'vs/base/browser/browser';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import * as types from 'vs/base/common/types';
import { Action, IAction } from 'vs/base/common/actions';
import { IIconLabelValueOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Mode, IEntryRunContext, IAutoFocus, IQuickNavigateConfiguration, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, QuickOpenModel, QuickOpenEntryGroup, compareEntries, QuickOpenItemAccessorClass } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenWidget, HideReason } from 'vs/base/parts/quickopen/browser/quickOpenWidget';
import { ContributableActionProvider } from 'vs/workbench/browser/actions';
import { ITextFileService, AutoSaveMode } from 'vs/workbench/services/textfile/common/textfiles';
import { Registry } from 'vs/platform/registry/common/platform';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IModeService } from 'vs/editor/common/services/modeService';
import { getIconClasses } from 'vs/workbench/browser/labels';
import { IModelService } from 'vs/editor/common/services/modelService';
import { EditorInput, IWorkbenchEditorConfiguration, IEditorInput } from 'vs/workbench/common/editor';
import { Component } from 'vs/workbench/common/component';
import { Event, Emitter } from 'vs/base/common/event';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { QuickOpenHandler, QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions, EditorQuickOpenEntry, CLOSE_ON_FOCUS_LOST_CONFIG } from 'vs/workbench/browser/quickopen';
import * as errors from 'vs/base/common/errors';
import { IPickOpenEntry, IFilePickOpenEntry, IQuickOpenService, IShowOptions, IPickOpenItem, IStringPickOptions, ITypedPickOptions } from 'vs/platform/quickOpen/common/quickOpen';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { attachQuickOpenStyler } from 'vs/platform/theme/common/styler';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITree, IActionProvider } from 'vs/base/parts/tree/browser/tree';
import { BaseActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { FileKind, IFileService } from 'vs/platform/files/common/files';
import { scoreItem, ScorerCache, compareItemsByScore, prepareQuery } from 'vs/base/parts/quickopen/common/quickOpenScorer';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { matchesFuzzyOcticonAware, parseOcticons, IParsedOcticons } from 'vs/base/common/octicon';
import { IMatch } from 'vs/base/common/filters';
import { Schemas } from 'vs/base/common/network';
import Severity from 'vs/base/common/severity';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Dimension, addClass } from 'vs/base/browser/dom';
import { IEditorService, ACTIVE_GROUP, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { IUriDisplayService } from 'vs/platform/uriDisplay/common/uriDisplay';

const HELP_PREFIX = '?';

interface IInternalPickOptions {
	contextKey?: string;
	value?: string;
	valueSelection?: [number, number];
	placeHolder?: string;
	inputDecoration?: Severity;
	password?: boolean;
	autoFocus?: IAutoFocus;
	matchOnDescription?: boolean;
	matchOnDetail?: boolean;
	ignoreFocusLost?: boolean;
	quickNavigateConfiguration?: IQuickNavigateConfiguration;
	onDidType?: (value: string) => any;
	onDidFocus?: (item: any) => void;
}

export class QuickOpenController extends Component implements IQuickOpenService {

	private static readonly MAX_SHORT_RESPONSE_TIME = 500;
	private static readonly ID = 'workbench.component.quickopen';

	_serviceBrand: any;

	private readonly _onShow: Emitter<void> = this._register(new Emitter<void>());
	get onShow(): Event<void> { return this._onShow.event; }

	private readonly _onHide: Emitter<void> = this._register(new Emitter<void>());
	get onHide(): Event<void> { return this._onHide.event; }

	private quickOpenWidget: QuickOpenWidget;
	private pickOpenWidget: QuickOpenWidget;
	private layoutDimensions: Dimension;
	private mapResolvedHandlersToPrefix: { [prefix: string]: TPromise<QuickOpenHandler>; } = Object.create(null);
	private mapContextKeyToContext: { [id: string]: IContextKey<boolean>; } = Object.create(null);
	private handlerOnOpenCalled: { [prefix: string]: boolean; } = Object.create(null);
	private currentResultToken: string;
	private currentPickerToken: string;
	private promisesToCompleteOnHide: ValueCallback[] = [];
	private previousActiveHandlerDescriptor: QuickOpenHandlerDescriptor;
	private actionProvider = new ContributableActionProvider();
	private closeOnFocusLost: boolean;
	private editorHistoryHandler: EditorHistoryHandler;

	constructor(
		@IEditorGroupsService private editorGroupService: IEditorGroupsService,
		@INotificationService private notificationService: INotificationService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IThemeService themeService: IThemeService
	) {
		super(QuickOpenController.ID, themeService);

		this.editorHistoryHandler = this.instantiationService.createInstance(EditorHistoryHandler);

		this.updateConfiguration();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => this.updateConfiguration()));
		this._register(this.partService.onTitleBarVisibilityChange(() => this.positionQuickOpenWidget()));
		this._register(browser.onDidChangeZoomLevel(() => this.positionQuickOpenWidget()));
	}

	private updateConfiguration(): void {
		if (this.environmentService.args['sticky-quickopen']) {
			this.closeOnFocusLost = false;
		} else {
			this.closeOnFocusLost = this.configurationService.getValue(CLOSE_ON_FOCUS_LOST_CONFIG);
		}
	}

	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration): void {
		if (this.quickOpenWidget) {
			this.quickOpenWidget.navigate(next, quickNavigate);
		}

		if (this.pickOpenWidget) {
			this.pickOpenWidget.navigate(next, quickNavigate);
		}
	}

	pick(picks: TPromise<string[]>, options?: IStringPickOptions, token?: CancellationToken): TPromise<string>;
	pick<T extends IPickOpenEntry>(picks: TPromise<T[]>, options?: ITypedPickOptions<T>, token?: CancellationToken): TPromise<string>;
	pick(picks: string[], options?: IStringPickOptions, token?: CancellationToken): TPromise<string>;
	pick<T extends IPickOpenEntry>(picks: T[], options?: ITypedPickOptions<T>, token?: CancellationToken): TPromise<T>;
	pick(arg1: string[] | TPromise<string[]> | IPickOpenEntry[] | TPromise<IPickOpenEntry[]>, options?: IStringPickOptions | ITypedPickOptions<IPickOpenEntry>, token?: CancellationToken): TPromise<string | IPickOpenEntry> {
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
		const entryPromise = arrayPromise.then(elements => {
			return (<Array<string | IPickOpenEntry>>elements).map(element => {
				if (typeof element === 'string') {
					isAboutStrings = true;

					return <IPickOpenEntry>{ label: element };
				} else {
					return element;
				}
			});
		});

		if (this.pickOpenWidget && this.pickOpenWidget.isVisible()) {
			this.pickOpenWidget.hide(HideReason.CANCELED);
		}

		return new TPromise<string | IPickOpenEntry>((resolve, reject) => {

			function onItem(item: IPickOpenEntry): string | IPickOpenEntry {
				return item && isAboutStrings ? item.label : item;
			}

			this.doPick(entryPromise, options, token).then(item => resolve(onItem(item)), err => reject(err));
		});
	}

	private doPick(picksPromise: TPromise<IPickOpenEntry[]>, options: IInternalPickOptions, token: CancellationToken = CancellationToken.None): TPromise<IPickOpenEntry> {
		const autoFocus = options.autoFocus;

		// Use a generated token to avoid race conditions from long running promises
		const currentPickerToken = defaultGenerator.nextId();
		this.currentPickerToken = currentPickerToken;

		// Update context
		this.setQuickOpenContextKey(options.contextKey);

		// Create upon first open
		if (!this.pickOpenWidget) {
			this.pickOpenWidget = this._register(new QuickOpenWidget(
				document.getElementById(this.partService.getWorkbenchElementId()),
				{
					onOk: () => { /* ignore, handle later */ },
					onCancel: () => { /* ignore, handle later */ },
					onType: (value: string) => { /* ignore, handle later */ },
					onShow: () => this.handleOnShow(true),
					onHide: (reason) => this.handleOnHide(true, reason)
				}, {
					inputPlaceHolder: options.placeHolder || '',
					keyboardSupport: false,
					treeCreator: (container, config, opts) => this.instantiationService.createInstance(WorkbenchTree, container, config, opts)
				}
			));
			this._register(attachQuickOpenStyler(this.pickOpenWidget, this.themeService, { background: SIDE_BAR_BACKGROUND, foreground: SIDE_BAR_FOREGROUND }));

			const pickOpenContainer = this.pickOpenWidget.create();
			addClass(pickOpenContainer, 'show-file-icons');
			this.positionQuickOpenWidget();
		}

		// Update otherwise
		else {
			this.pickOpenWidget.setPlaceHolder(options.placeHolder || '');
		}

		// Respect input value
		if (options.value) {
			this.pickOpenWidget.setValue(options.value, options.valueSelection);
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

		return new TPromise<IPickOpenEntry>((complete, error) => {

			// Detect cancellation while pick promise is loading
			this.pickOpenWidget.setCallbacks({
				onCancel: () => { complete(void 0); },
				onOk: () => { /* ignore, handle later */ },
				onType: (value: string) => { /* ignore, handle later */ },
			});

			// hide widget when being cancelled
			token.onCancellationRequested(e => {
				if (this.currentPickerToken === currentPickerToken) {
					this.pickOpenWidget.hide(HideReason.CANCELED);
				}
			});

			let picksPromiseDone = false;

			// Resolve picks
			picksPromise.then(picks => {
				if (this.currentPickerToken !== currentPickerToken) {
					return complete(void 0); // Return as canceled if another request came after or user canceled
				}

				picksPromiseDone = true;

				// Reset Progress
				this.pickOpenWidget.getProgressBar().stop().hide();

				// Model
				const model = new QuickOpenModel([], new PickOpenActionProvider());
				const entries = picks.map((e, index) => {
					const onPreview = () => {
						if (options.onDidFocus) {
							options.onDidFocus(e);
						}
					};
					return this.instantiationService.createInstance(PickOpenEntry, e, index, onPreview, () => this.pickOpenWidget.refresh());
				});
				if (picks.length === 0) {
					entries.push(this.instantiationService.createInstance(PickOpenEntry, { label: nls.localize('emptyPicks', "There are no entries to pick from") }, 0, null, null));
				}

				model.setEntries(entries);

				// Handlers
				const callbacks = {
					onOk: () => {
						if (picks.length === 0) {
							return complete(null);
						}

						let index = -1;
						let context: IEntryRunContext;
						entries.forEach(entry => {
							if (entry.shouldRunWithContext) {
								index = entry.index;
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

						// Filter by value (since we support octicons, use octicon aware fuzzy matching)
						else {
							entries.forEach(entry => {
								const { labelHighlights, descriptionHighlights, detailHighlights } = entry.matchesFuzzy(value, options);

								if (entry.shouldAlwaysShow() || labelHighlights || descriptionHighlights || detailHighlights) {
									entry.setHighlights(labelHighlights, descriptionHighlights, detailHighlights);
									entry.setHidden(false);
								} else {
									entry.setHighlights(null, null, null);
									entry.setHidden(true);
								}
							});
						}

						// Sort by value
						const normalizedSearchValue = value ? strings.stripWildcards(value.toLowerCase()) : value;
						model.entries.sort((pickA: PickOpenEntry, pickB: PickOpenEntry) => {
							if (!value) {
								return pickA.index - pickB.index; // restore natural order
							}

							return compareEntries(pickA, pickB, normalizedSearchValue);
						});

						this.pickOpenWidget.refresh(model, value ? { autoFocusFirstEntry: true } : autoFocus);
					},
					onShow: () => this.handleOnShow(true),
					onHide: (reason: HideReason) => this.handleOnHide(true, reason)
				};
				this.pickOpenWidget.setCallbacks(callbacks);

				// Set input
				if (!this.pickOpenWidget.isVisible()) {
					this.pickOpenWidget.show(model, { autoFocus, quickNavigateConfiguration: options.quickNavigateConfiguration });
				} else {
					this.pickOpenWidget.setInput(model, autoFocus);
				}

				// The user might have typed something (or options.value was set) so we need to play back
				// the input box value through our callbacks to filter the result accordingly.
				const inputValue = this.pickOpenWidget.getInputBox().value;
				if (inputValue) {
					callbacks.onType(inputValue);
				}
			}, (err) => {
				this.pickOpenWidget.hide();

				error(err);
			});

			// Progress if task takes a long time
			TPromise.timeout(800).then(() => {
				if (!picksPromiseDone && this.currentPickerToken === currentPickerToken) {
					this.pickOpenWidget.getProgressBar().infinite().show();
				}
			});

			// Show picker empty if resolving takes a while
			if (!picksPromiseDone) {
				this.pickOpenWidget.show(new QuickOpenModel());
			}
		});
	}

	accept(): void {
		[this.quickOpenWidget, this.pickOpenWidget].forEach(w => {
			if (w && w.isVisible()) {
				w.accept();
			}
		});
	}

	focus(): void {
		[this.quickOpenWidget, this.pickOpenWidget].forEach(w => {
			if (w && w.isVisible()) {
				w.focus();
			}
		});
	}

	close(): void {
		[this.quickOpenWidget, this.pickOpenWidget].forEach(w => {
			if (w && w.isVisible()) {
				w.hide(HideReason.CANCELED);
			}
		});
	}

	private emitQuickOpenVisibilityChange(isVisible: boolean): void {
		if (isVisible) {
			this._onShow.fire();
		} else {
			this._onHide.fire();
		}
	}

	show(prefix?: string, options?: IShowOptions): TPromise<void> {
		let quickNavigateConfiguration = options ? options.quickNavigateConfiguration : void 0;
		let inputSelection = options ? options.inputSelection : void 0;
		let autoFocus = options ? options.autoFocus : void 0;

		const promiseCompletedOnHide = new TPromise<void>(c => {
			this.promisesToCompleteOnHide.push(c);
		});

		// Telemetry: log that quick open is shown and log the mode
		const registry = Registry.as<IQuickOpenRegistry>(Extensions.Quickopen);
		const handlerDescriptor = registry.getQuickOpenHandler(prefix) || registry.getDefaultQuickOpenHandler();

		// Trigger onOpen
		this.resolveHandler(handlerDescriptor).done(null, errors.onUnexpectedError);

		// Create upon first open
		if (!this.quickOpenWidget) {
			this.quickOpenWidget = this._register(new QuickOpenWidget(
				document.getElementById(this.partService.getWorkbenchElementId()),
				{
					onOk: () => { /* ignore */ },
					onCancel: () => { /* ignore */ },
					onType: (value: string) => this.onType(value || ''),
					onShow: () => this.handleOnShow(false),
					onHide: (reason) => this.handleOnHide(false, reason),
					onFocusLost: () => !this.closeOnFocusLost
				}, {
					inputPlaceHolder: this.hasHandler(HELP_PREFIX) ? nls.localize('quickOpenInput', "Type '?' to get help on the actions you can take from here") : '',
					keyboardSupport: false,
					treeCreator: (container, config, opts) => this.instantiationService.createInstance(WorkbenchTree, container, config, opts)
				}
			));
			this._register(attachQuickOpenStyler(this.quickOpenWidget, this.themeService, { background: SIDE_BAR_BACKGROUND, foreground: SIDE_BAR_FOREGROUND }));

			const quickOpenContainer = this.quickOpenWidget.create();
			addClass(quickOpenContainer, 'show-file-icons');
			this.positionQuickOpenWidget();
		}

		// Layout
		if (this.layoutDimensions) {
			this.quickOpenWidget.layout(this.layoutDimensions);
		}

		// Show quick open with prefix or editor history
		if (!this.quickOpenWidget.isVisible() || quickNavigateConfiguration) {
			if (prefix) {
				this.quickOpenWidget.show(prefix, { quickNavigateConfiguration, inputSelection, autoFocus });
			} else {
				const editorHistory = this.getEditorHistoryWithGroupLabel();
				if (editorHistory.getEntries().length < 2) {
					quickNavigateConfiguration = null; // If no entries can be shown, default to normal quick open mode
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

				this.quickOpenWidget.show(editorHistory, { quickNavigateConfiguration, autoFocus, inputSelection });
			}
		}

		// Otherwise reset the widget to the prefix that is passed in
		else {
			this.quickOpenWidget.show(prefix || '', { inputSelection });
		}

		return promiseCompletedOnHide;
	}

	private positionQuickOpenWidget(): void {
		const titlebarOffset = this.partService.getTitleBarOffset();

		if (this.quickOpenWidget) {
			this.quickOpenWidget.getElement().style.top = `${titlebarOffset}px`;
		}

		if (this.pickOpenWidget) {
			this.pickOpenWidget.getElement().style.top = `${titlebarOffset}px`;
		}
	}

	private handleOnShow(isPicker: boolean): void {
		if (isPicker && this.quickOpenWidget) {
			this.quickOpenWidget.hide(HideReason.FOCUS_LOST);
		} else if (!isPicker && this.pickOpenWidget) {
			this.pickOpenWidget.hide(HideReason.FOCUS_LOST);
		}

		this.emitQuickOpenVisibilityChange(true);
	}

	private handleOnHide(isPicker: boolean, reason: HideReason): void {
		if (!isPicker) {

			// Clear state
			this.previousActiveHandlerDescriptor = null;

			// Pass to handlers
			for (let prefix in this.mapResolvedHandlersToPrefix) {
				const promise = this.mapResolvedHandlersToPrefix[prefix];
				promise.then(handler => {
					this.handlerOnOpenCalled[prefix] = false;

					handler.onClose(reason === HideReason.CANCELED); // Don't check if onOpen was called to preserve old behaviour for now
				});
			}

			// Complete promises that are waiting
			while (this.promisesToCompleteOnHide.length) {
				this.promisesToCompleteOnHide.pop()(true);
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

	private resetQuickOpenContextKeys(): void {
		Object.keys(this.mapContextKeyToContext).forEach(k => this.mapContextKeyToContext[k].reset());
	}

	private setQuickOpenContextKey(id?: string): void {
		let key: IContextKey<boolean>;
		if (id) {
			key = this.mapContextKeyToContext[id];
			if (!key) {
				key = new RawContextKey<boolean>(id, false).bindTo(this.contextKeyService);
				this.mapContextKeyToContext[id] = key;
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

	private onType(value: string): void {

		// look for a handler
		const registry = Registry.as<IQuickOpenRegistry>(Extensions.Quickopen);
		const handlerDescriptor = registry.getQuickOpenHandler(value);
		const defaultHandlerDescriptor = registry.getDefaultQuickOpenHandler();
		const instantProgress = handlerDescriptor && handlerDescriptor.instantProgress;
		const contextKey = handlerDescriptor ? handlerDescriptor.contextKey : defaultHandlerDescriptor.contextKey;

		// Use a generated token to avoid race conditions from long running promises
		const currentResultToken = defaultGenerator.nextId();
		this.currentResultToken = currentResultToken;

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
			this.resolveHandler(handlerDescriptor || defaultHandlerDescriptor)
				.done(null, errors.onUnexpectedError);

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
			resultPromise = this.handleDefaultHandler(defaultHandlerDescriptor, value, currentResultToken);
		}

		// Remember as the active one
		this.previousActiveHandlerDescriptor = handlerDescriptor;

		// Progress if task takes a long time
		TPromise.timeout(instantProgress ? 0 : 800).then(() => {
			if (!resultPromiseDone && currentResultToken === this.currentResultToken) {
				this.quickOpenWidget.getProgressBar().infinite().show();
			}
		});

		// Promise done handling
		resultPromise.done(() => {
			resultPromiseDone = true;

			if (currentResultToken === this.currentResultToken) {
				this.quickOpenWidget.getProgressBar().hide();
			}
		}, (error: any) => {
			resultPromiseDone = true;
			errors.onUnexpectedError(error);
			this.notificationService.error(types.isString(error) ? new Error(error) : error);
		});
	}

	private handleDefaultHandler(handler: QuickOpenHandlerDescriptor, value: string, currentResultToken: string): TPromise<void> {

		// Fill in history results if matching
		const matchingHistoryEntries = this.editorHistoryHandler.getResults(value);
		if (matchingHistoryEntries.length > 0) {
			matchingHistoryEntries[0] = new EditorHistoryEntryGroup(matchingHistoryEntries[0], nls.localize('historyMatches', "recently opened"), false);
		}

		// Resolve
		return this.resolveHandler(handler).then(resolvedHandler => {
			const quickOpenModel = new QuickOpenModel(matchingHistoryEntries, this.actionProvider);

			let inputSet = false;

			// If we have matching entries from history we want to show them directly and not wait for the other results to come in
			// This also applies when we used to have entries from a previous run and now there are no more history results matching
			const previousInput = this.quickOpenWidget.getInput();
			const wasShowingHistory = previousInput && previousInput.entries && previousInput.entries.some(e => e instanceof EditorHistoryEntry || e instanceof EditorHistoryEntryGroup);
			if (wasShowingHistory || matchingHistoryEntries.length > 0) {
				(resolvedHandler.hasShortResponseTime() ? TPromise.timeout(QuickOpenController.MAX_SHORT_RESPONSE_TIME) : TPromise.as(undefined)).then(() => {
					if (this.currentResultToken === currentResultToken && !inputSet) {
						this.quickOpenWidget.setInput(quickOpenModel, { autoFocusFirstEntry: true });
						inputSet = true;
					}
				});
			}

			// Get results
			return resolvedHandler.getResults(value).then(result => {
				if (this.currentResultToken === currentResultToken) {

					// now is the time to show the input if we did not have set it before
					if (!inputSet) {
						this.quickOpenWidget.setInput(quickOpenModel, { autoFocusFirstEntry: true });
						inputSet = true;
					}

					// merge history and default handler results
					const handlerResults = (result && result.entries) || [];
					this.mergeResults(quickOpenModel, handlerResults, resolvedHandler.getGroupLabel());
				}
			});
		});
	}

	private mergeResults(quickOpenModel: QuickOpenModel, handlerResults: QuickOpenEntry[], groupLabel: string): void {

		// Remove results already showing by checking for a "resource" property
		const mapEntryToResource = this.mapEntriesToResource(quickOpenModel);
		const additionalHandlerResults: QuickOpenEntry[] = [];
		for (let i = 0; i < handlerResults.length; i++) {
			const result = handlerResults[i];
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

	private handleSpecificHandler(handlerDescriptor: QuickOpenHandlerDescriptor, value: string, currentResultToken: string): TPromise<void> {
		return this.resolveHandler(handlerDescriptor).then((resolvedHandler: QuickOpenHandler) => {

			// Remove handler prefix from search value
			value = value.substr(handlerDescriptor.prefix.length);

			// Return early if the handler can not run in the current environment and inform the user
			const canRun = resolvedHandler.canRun();
			if (types.isUndefinedOrNull(canRun) || (typeof canRun === 'boolean' && !canRun) || typeof canRun === 'string') {
				const placeHolderLabel = (typeof canRun === 'string') ? canRun : nls.localize('canNotRunPlaceholder', "This quick open handler can not be used in the current context");

				const model = new QuickOpenModel([new PlaceholderQuickOpenEntry(placeHolderLabel)], this.actionProvider);
				this.showModel(model, resolvedHandler.getAutoFocus(value, { model, quickNavigateConfiguration: this.quickOpenWidget.getQuickNavigateConfiguration() }), resolvedHandler.getAriaLabel());

				return TPromise.as(null);
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
			return resolvedHandler.getResults(value).then(result => {
				if (this.currentResultToken === currentResultToken) {
					if (!result || !result.entries.length) {
						const model = new QuickOpenModel([new PlaceholderQuickOpenEntry(resolvedHandler.getEmptyLabel(value))]);
						this.showModel(model, resolvedHandler.getAutoFocus(value, { model, quickNavigateConfiguration: this.quickOpenWidget.getQuickNavigateConfiguration() }), resolvedHandler.getAriaLabel());
					} else {
						this.showModel(result, resolvedHandler.getAutoFocus(value, { model: result, quickNavigateConfiguration: this.quickOpenWidget.getQuickNavigateConfiguration() }), resolvedHandler.getAriaLabel());
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
		const entries = model.getEntries();
		const mapEntryToPath: { [path: string]: QuickOpenEntry; } = {};
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

		return result.then<QuickOpenHandler>(null, (error) => {
			delete this.mapResolvedHandlersToPrefix[id];

			return TPromise.wrapError(new Error(`Unable to instantiate quick open handler ${handler.getId()}: ${JSON.stringify(error)}`));
		});
	}

	private _resolveHandler(handler: QuickOpenHandlerDescriptor): TPromise<QuickOpenHandler> {
		const id = handler.getId();

		// Return Cached
		if (this.mapResolvedHandlersToPrefix[id]) {
			return this.mapResolvedHandlersToPrefix[id];
		}

		// Otherwise load and create
		return this.mapResolvedHandlersToPrefix[id] = TPromise.as(handler.instantiate(this.instantiationService));
	}

	layout(dimension: Dimension): void {
		this.layoutDimensions = dimension;
		if (this.quickOpenWidget) {
			this.quickOpenWidget.layout(this.layoutDimensions);
		}

		if (this.pickOpenWidget) {
			this.pickOpenWidget.layout(this.layoutDimensions);
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

class PickOpenEntry extends PlaceholderQuickOpenEntry implements IPickOpenItem {
	private _shouldRunWithContext: IEntryRunContext;
	private description: string;
	private detail: string;
	private tooltip: string;
	private descriptionTooltip: string;
	private hasSeparator: boolean;
	private separatorLabel: string;
	private alwaysShow: boolean;
	private resource: URI;
	private fileKind: FileKind;
	private _action: IAction;
	private removed: boolean;
	private payload: any;
	private labelOcticons: IParsedOcticons;
	private descriptionOcticons: IParsedOcticons;
	private detailOcticons: IParsedOcticons;

	constructor(
		item: IPickOpenEntry,
		private _index: number,
		private onPreview: () => void,
		private onRemove: () => void,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService
	) {
		super(item.label);

		this.description = item.description;
		this.detail = item.detail;
		this.tooltip = item.tooltip;
		this.descriptionOcticons = item.description ? parseOcticons(item.description) : void 0;
		this.descriptionTooltip = this.descriptionOcticons ? this.descriptionOcticons.text : void 0;
		this.hasSeparator = item.separator && item.separator.border;
		this.separatorLabel = item.separator && item.separator.label;
		this.alwaysShow = item.alwaysShow;
		this._action = item.action;
		this.payload = item.payload;

		const fileItem = <IFilePickOpenEntry>item;
		this.resource = fileItem.resource;
		this.fileKind = fileItem.fileKind;
	}

	matchesFuzzy(query: string, options: IInternalPickOptions): { labelHighlights: IMatch[], descriptionHighlights: IMatch[], detailHighlights: IMatch[] } {
		if (!this.labelOcticons) {
			this.labelOcticons = parseOcticons(this.getLabel()); // parse on demand
		}

		const detail = this.getDetail();
		if (detail && options.matchOnDetail && !this.detailOcticons) {
			this.detailOcticons = parseOcticons(detail); // parse on demand
		}

		return {
			labelHighlights: matchesFuzzyOcticonAware(query, this.labelOcticons),
			descriptionHighlights: options.matchOnDescription && this.descriptionOcticons ? matchesFuzzyOcticonAware(query, this.descriptionOcticons) : void 0,
			detailHighlights: options.matchOnDetail && this.detailOcticons ? matchesFuzzyOcticonAware(query, this.detailOcticons) : void 0
		};
	}

	getPayload(): any {
		return this.payload;
	}

	remove(): void {
		super.setHidden(true);
		this.removed = true;

		this.onRemove();
	}

	isHidden(): boolean {
		return this.removed || super.isHidden();
	}

	get action(): IAction {
		return this._action;
	}

	get index(): number {
		return this._index;
	}

	getLabelOptions(): IIconLabelValueOptions {
		return {
			extraClasses: this.resource ? getIconClasses(this.modelService, this.modeService, this.resource, this.fileKind) : []
		};
	}

	get shouldRunWithContext(): IEntryRunContext {
		return this._shouldRunWithContext;
	}

	getDescription(): string {
		return this.description;
	}

	getDetail(): string {
		return this.detail;
	}

	getTooltip(): string {
		return this.tooltip;
	}

	getDescriptionTooltip(): string {
		return this.descriptionTooltip;
	}

	showBorder(): boolean {
		return this.hasSeparator;
	}

	getGroupLabel(): string {
		return this.separatorLabel;
	}

	shouldAlwaysShow(): boolean {
		return this.alwaysShow;
	}

	getResource(): URI {
		return this.resource;
	}

	run(mode: Mode, context: IEntryRunContext): boolean {
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

class PickOpenActionProvider implements IActionProvider {
	hasActions(tree: ITree, element: PickOpenEntry): boolean {
		return !!element.action;
	}

	getActions(tree: ITree, element: PickOpenEntry): TPromise<IAction[]> {
		return TPromise.as(element.action ? [element.action] : []);
	}

	hasSecondaryActions(tree: ITree, element: PickOpenEntry): boolean {
		return false;
	}

	getSecondaryActions(tree: ITree, element: PickOpenEntry): TPromise<IAction[]> {
		return TPromise.as([]);
	}

	getActionItem(tree: ITree, element: PickOpenEntry, action: Action): BaseActionItem {
		return null;
	}
}

class EditorHistoryHandler {
	private scorerCache: ScorerCache;

	constructor(
		@IHistoryService private historyService: IHistoryService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IFileService private fileService: IFileService
	) {
		this.scorerCache = Object.create(null);
	}

	getResults(searchValue?: string): QuickOpenEntry[] {

		// Massage search for scoring
		const query = prepareQuery(searchValue);

		const history = this.historyService.getHistory()
			// For now, only support to match on inputs that provide resource information
			.filter(input => {
				let resource: URI;
				if (input instanceof EditorInput) {
					resource = resourceForEditorHistory(input, this.fileService);
				} else {
					resource = (input as IResourceInput).resource;
				}

				return !!resource;
			})

			// Conver to quick open entries
			.map(input => this.instantiationService.createInstance(EditorHistoryEntry, input));

		// Just return all if we are not searching
		if (!query.value) {
			return history;
		}

		// Otherwise filter by search value and sort by score. Include matches on description
		// in case the user is explicitly including path separators.
		const accessor = query.containsPathSeparator ? MatchOnDescription : DoNotMatchOnDescription;
		return history
			// Make sure the search value is matching
			.filter(e => {
				const itemScore = scoreItem(e, query, false, accessor, this.scorerCache);
				if (!itemScore.score) {
					return false;
				}

				e.setHighlights(itemScore.labelMatch, itemScore.descriptionMatch);

				return true;
			})

			// Sort by score and provide a fallback sorter that keeps the
			// recency of items in case the score for items is the same
			.sort((e1, e2) => compareItemsByScore(e1, e2, query, false, accessor, this.scorerCache, (e1, e2, query, accessor) => -1));
	}
}

class EditorHistoryItemAccessorClass extends QuickOpenItemAccessorClass {

	constructor(private allowMatchOnDescription: boolean) {
		super();
	}

	getItemDescription(entry: QuickOpenEntry): string {
		return this.allowMatchOnDescription ? entry.getDescription() : void 0;
	}
}

const MatchOnDescription = new EditorHistoryItemAccessorClass(true);
const DoNotMatchOnDescription = new EditorHistoryItemAccessorClass(false);

export class EditorHistoryEntryGroup extends QuickOpenEntryGroup {
	// Marker class
}

export class EditorHistoryEntry extends EditorQuickOpenEntry {
	private input: IEditorInput | IResourceInput;
	private resource: URI;
	private label: string;
	private description: string;
	private dirty: boolean;

	constructor(
		input: IEditorInput | IResourceInput,
		@IEditorService editorService: IEditorService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
		@ITextFileService private textFileService: ITextFileService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IUriDisplayService uriDisplayService: IUriDisplayService,
		@IFileService fileService: IFileService
	) {
		super(editorService);

		this.input = input;

		if (input instanceof EditorInput) {
			this.resource = resourceForEditorHistory(input, fileService);
			this.label = input.getName();
			this.description = input.getDescription();
			this.dirty = input.isDirty();
		} else {
			const resourceInput = input as IResourceInput;
			this.resource = resourceInput.resource;
			this.label = resources.basenameOrAuthority(resourceInput.resource);
			this.description = uriDisplayService.getLabel(resources.dirname(this.resource), true);
			this.dirty = this.resource && this.textFileService.isDirty(this.resource);

			if (this.dirty && this.textFileService.getAutoSaveMode() === AutoSaveMode.AFTER_SHORT_DELAY) {
				this.dirty = false; // no dirty decoration if auto save is on with a short timeout
			}
		}
	}

	getIcon(): string {
		return this.dirty ? 'dirty' : '';
	}

	getLabel(): string {
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

	getDescription(): string {
		return this.description;
	}

	getResource(): URI {
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

function resourceForEditorHistory(input: EditorInput, fileService: IFileService): URI {
	const resource = input ? input.getResource() : void 0;

	// For the editor history we only prefer resources that are either untitled or
	// can be handled by the file service which indicates they are editable resources.
	if (resource && (fileService.canHandleResource(resource) || resource.scheme === Schemas.untitled)) {
		return resource;
	}

	return void 0;
}

export class RemoveFromEditorHistoryAction extends Action {

	static readonly ID = 'workbench.action.removeFromEditorHistory';
	static readonly LABEL = nls.localize('removeFromEditorHistory', "Remove From History");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IHistoryService private historyService: IHistoryService
	) {
		super(id, label);
	}

	run(): TPromise<any> {
		interface IHistoryPickEntry extends IFilePickOpenEntry {
			input: IEditorInput | IResourceInput;
		}

		const history = this.historyService.getHistory();
		const picks: IHistoryPickEntry[] = history.map(h => {
			const entry = this.instantiationService.createInstance(EditorHistoryEntry, h);

			return <IHistoryPickEntry>{
				input: h,
				resource: entry.getResource(),
				label: entry.getLabel(),
				description: entry.getDescription()
			};
		});

		return this.quickOpenService.pick(picks, { placeHolder: nls.localize('pickHistory', "Select an editor entry to remove from history"), autoFocus: { autoFocusFirstEntry: true }, matchOnDescription: true }).then(pick => {
			if (pick) {
				this.historyService.remove(pick.input);
			}
		});
	}
}
