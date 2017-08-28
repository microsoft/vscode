/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/quickopen';
import { TPromise, ValueCallback } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import * as browser from 'vs/base/browser/browser';
import { Dimension, withElementById } from 'vs/base/browser/builder';
import strings = require('vs/base/common/strings');
import filters = require('vs/base/common/filters');
import DOM = require('vs/base/browser/dom');
import URI from 'vs/base/common/uri';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import types = require('vs/base/common/types');
import { Action, IAction } from 'vs/base/common/actions';
import { IIconLabelOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Mode, IEntryRunContext, IAutoFocus, IQuickNavigateConfiguration, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, QuickOpenModel, QuickOpenEntryGroup } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenWidget, HideReason } from 'vs/base/parts/quickopen/browser/quickOpenWidget';
import { ContributableActionProvider } from 'vs/workbench/browser/actions';
import labels = require('vs/base/common/labels');
import paths = require('vs/base/common/paths');
import { ITextFileService, AutoSaveMode } from 'vs/workbench/services/textfile/common/textfiles';
import { Registry } from 'vs/platform/registry/common/platform';
import { IResourceInput, IEditorInput } from 'vs/platform/editor/common/editor';
import { IModeService } from 'vs/editor/common/services/modeService';
import { getIconClasses } from 'vs/workbench/browser/labels';
import { IModelService } from 'vs/editor/common/services/modelService';
import { EditorInput, toResource, IWorkbenchEditorConfiguration } from 'vs/workbench/common/editor';
import { Component } from 'vs/workbench/common/component';
import Event, { Emitter } from 'vs/base/common/event';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { KeyMod } from 'vs/base/common/keyCodes';
import { QuickOpenHandler, QuickOpenHandlerDescriptor, IQuickOpenRegistry, Extensions, EditorQuickOpenEntry, IWorkbenchQuickOpenConfiguration } from 'vs/workbench/browser/quickopen';
import errors = require('vs/base/common/errors');
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPickOpenEntry, IFilePickOpenEntry, IInputOptions, IQuickOpenService, IPickOptions, IShowOptions, IPickOpenItem } from 'vs/platform/quickOpen/common/quickOpen';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IListService } from 'vs/platform/list/browser/listService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { attachQuickOpenStyler } from 'vs/platform/theme/common/styler';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITree, IActionProvider } from 'vs/base/parts/tree/browser/tree';
import { BaseActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { FileKind } from 'vs/platform/files/common/files';

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
}

export class QuickOpenController extends Component implements IQuickOpenService {

	private static MAX_SHORT_RESPONSE_TIME = 500;

	public _serviceBrand: any;

	private static ID = 'workbench.component.quickopen';

	private _onShow: Emitter<void>;
	private _onHide: Emitter<void>;

	private quickOpenWidget: QuickOpenWidget;
	private pickOpenWidget: QuickOpenWidget;
	private layoutDimensions: Dimension;
	private mapResolvedHandlersToPrefix: { [prefix: string]: TPromise<QuickOpenHandler>; };
	private mapContextKeyToContext: { [id: string]: IContextKey<boolean>; };
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
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IHistoryService private historyService: IHistoryService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IListService private listService: IListService,
		@IThemeService themeService: IThemeService
	) {
		super(QuickOpenController.ID, themeService);

		this.mapResolvedHandlersToPrefix = {};
		this.handlerOnOpenCalled = {};
		this.mapContextKeyToContext = {};

		this.promisesToCompleteOnHide = [];

		this.inQuickOpenMode = new RawContextKey<boolean>('inQuickOpen', false).bindTo(contextKeyService);

		this._onShow = new Emitter<void>();
		this._onHide = new Emitter<void>();

		this.updateConfiguration(<IWorkbenchQuickOpenConfiguration>this.configurationService.getConfiguration());

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.configurationService.onDidUpdateConfiguration(e => this.updateConfiguration(this.configurationService.getConfiguration<IWorkbenchQuickOpenConfiguration>())));
		this.toUnbind.push(this.partService.onTitleBarVisibilityChange(() => this.positionQuickOpenWidget()));
		this.toUnbind.push(browser.onDidChangeZoomLevel(() => this.positionQuickOpenWidget()));
	}

	private updateConfiguration(settings: IWorkbenchQuickOpenConfiguration): void {
		this.closeOnFocusLost = settings.workbench && settings.workbench.quickOpen && settings.workbench.quickOpen.closeOnFocusLost;
	}

	public get onShow(): Event<void> {
		return this._onShow.event;
	}

	public get onHide(): Event<void> {
		return this._onHide.event;
	}

	public navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration): void {
		if (this.quickOpenWidget) {
			this.quickOpenWidget.navigate(next, quickNavigate);
		}

		if (this.pickOpenWidget) {
			this.pickOpenWidget.navigate(next, quickNavigate);
		}
	}

	public input(options: IInputOptions = {}, token: CancellationToken = CancellationToken.None): TPromise<string> {
		if (this.pickOpenWidget && this.pickOpenWidget.isVisible()) {
			this.pickOpenWidget.hide(HideReason.CANCELED);
		}

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
				valueSelection: options.valueSelection,
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
								const newPick = message || defaultMessage;
								if (newPick !== currentPick) {
									options.valueSelection = [lastValue.length, lastValue.length];
									currentPick = newPick;
									resolve(new TPromise<any>(init));
								}

								return !message;
							});
						}, err => {
							// ignore
							return null;
						});
					}
				}
			}, token).then(resolve, reject);
		};

		return new TPromise(init).then(item => {
			return currentValidation.then(valid => {
				if (valid && item) {
					return lastValue === void 0 ? (options.value || '') : lastValue;
				}

				return void 0;
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

		return new TPromise<string | IPickOpenEntry>((resolve, reject, progress) => {

			function onItem(item: IPickOpenEntry): string | IPickOpenEntry {
				return item && isAboutStrings ? item.label : item;
			}

			this.doPick(entryPromise, options, token).then(item => resolve(onItem(item)), err => reject(err), item => progress(onItem(item)));
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
			this.pickOpenWidget = new QuickOpenWidget(
				withElementById(this.partService.getWorkbenchElementId()).getHTMLElement(),
				{
					onOk: () => { /* ignore, handle later */ },
					onCancel: () => { /* ignore, handle later */ },
					onType: (value: string) => { /* ignore, handle later */ },
					onShow: () => this.handleOnShow(true),
					onHide: (reason) => this.handleOnHide(true, reason)
				}, {
					inputPlaceHolder: options.placeHolder || '',
					keyboardSupport: false
				},
				this.telemetryService
			);
			this.toUnbind.push(attachQuickOpenStyler(this.pickOpenWidget, this.themeService, { background: SIDE_BAR_BACKGROUND, foreground: SIDE_BAR_FOREGROUND }));

			const pickOpenContainer = this.pickOpenWidget.create();
			this.toUnbind.push(this.listService.register(this.pickOpenWidget.getTree()));
			DOM.addClass(pickOpenContainer, 'show-file-icons');
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

		return new TPromise<IPickOpenEntry>((complete, error, progress) => {

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
				this.pickOpenWidget.getProgressBar().stop().getContainer().hide();

				// Model
				const model = new QuickOpenModel([], new PickOpenActionProvider());
				const entries = picks.map((e, index) => this.instantiationService.createInstance(PickOpenEntry, e, index, () => progress(e), () => this.pickOpenWidget.refresh()));
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

						// Filter by value
						else {
							entries.forEach(entry => {
								const labelHighlights = filters.matchesFuzzy(value, entry.getLabel());
								const descriptionHighlights = options.matchOnDescription && filters.matchesFuzzy(value, entry.getDescription());
								const detailHighlights = options.matchOnDetail && entry.getDetail() && filters.matchesFuzzy(value, entry.getDetail());

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

							return QuickOpenEntry.compare(pickA, pickB, normalizedSearchValue);
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
		let inputSelection = options ? options.inputSelection : void 0;

		this.previousValue = prefix;

		const promiseCompletedOnHide = new TPromise<void>(c => {
			this.promisesToCompleteOnHide.push(c);
		});

		// Telemetry: log that quick open is shown and log the mode
		const registry = Registry.as<IQuickOpenRegistry>(Extensions.Quickopen);
		const handlerDescriptor = registry.getQuickOpenHandler(prefix) || registry.getDefaultQuickOpenHandler();

		this.telemetryService.publicLog('quickOpenWidgetShown', { mode: handlerDescriptor.getId(), quickNavigate: quickNavigateConfiguration });

		// Trigger onOpen
		this.resolveHandler(handlerDescriptor)
			.done(null, errors.onUnexpectedError);

		// Create upon first open
		if (!this.quickOpenWidget) {
			this.quickOpenWidget = new QuickOpenWidget(
				withElementById(this.partService.getWorkbenchElementId()).getHTMLElement(),
				{
					onOk: () => { /* ignore */ },
					onCancel: () => { /* ignore */ },
					onType: (value: string) => this.onType(value || ''),
					onShow: () => this.handleOnShow(false),
					onHide: (reason) => this.handleOnHide(false, reason),
					onFocusLost: () => !this.closeOnFocusLost
				}, {
					inputPlaceHolder: this.hasHandler(HELP_PREFIX) ? nls.localize('quickOpenInput', "Type '?' to get help on the actions you can take from here") : '',
					keyboardSupport: false
				},
				this.telemetryService
			);
			this.toUnbind.push(attachQuickOpenStyler(this.quickOpenWidget, this.themeService, { background: SIDE_BAR_BACKGROUND, foreground: SIDE_BAR_FOREGROUND }));

			const quickOpenContainer = this.quickOpenWidget.create();
			this.toUnbind.push(this.listService.register(this.quickOpenWidget.getTree()));
			DOM.addClass(quickOpenContainer, 'show-file-icons');
			this.positionQuickOpenWidget();
		}

		// Layout
		if (this.layoutDimensions) {
			this.quickOpenWidget.layout(this.layoutDimensions);
		}

		// Show quick open with prefix or editor history
		if (!this.quickOpenWidget.isVisible() || quickNavigateConfiguration) {
			if (prefix) {
				this.quickOpenWidget.show(prefix, { quickNavigateConfiguration, inputSelection });
			} else {
				const editorHistory = this.getEditorHistoryWithGroupLabel();
				if (editorHistory.getEntries().length < 2) {
					quickNavigateConfiguration = null; // If no entries can be shown, default to normal quick open mode
				}

				let autoFocus: IAutoFocus;
				if (!quickNavigateConfiguration) {
					autoFocus = { autoFocusFirstEntry: true };
				} else {
					const visibleEditorCount = this.editorService.getVisibleEditors().length;
					autoFocus = { autoFocusFirstEntry: visibleEditorCount === 0, autoFocusSecondEntry: visibleEditorCount !== 0 };
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
			this.quickOpenWidget.getElement().style('top', `${titlebarOffset}px`);
		}

		if (this.pickOpenWidget) {
			this.pickOpenWidget.getElement().style('top', `${titlebarOffset}px`);
		}
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
					const promise = this.mapResolvedHandlersToPrefix[prefix];
					promise.then(handler => {
						this.handlerOnOpenCalled[prefix] = false;

						handler.onClose(reason === HideReason.CANCELED); // Don't check if onOpen was called to preserve old behaviour for now
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

		// Reset context keys
		this.inQuickOpenMode.reset();
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
		const entries: QuickOpenEntry[] = this.getEditorHistoryEntries();

		// Apply label to first entry
		if (entries.length > 0) {
			entries[0] = new EditorHistoryEntryGroup(entries[0], nls.localize('historyMatches', "recently opened"), false);
		}

		return new QuickOpenModel(entries, this.actionProvider);
	}

	private restoreFocus(): void {

		// Try to focus active editor
		const editor = this.editorService.getActiveEditor();
		if (editor) {
			editor.focus();
		}
	}

	private onType(value: string): void {
		this.previousValue = value;

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
			this.quickOpenWidget.getProgressBar().stop().getContainer().hide();
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

	private handleDefaultHandler(handler: QuickOpenHandlerDescriptor, value: string, currentResultToken: string): TPromise<void> {

		// Fill in history results if matching
		const matchingHistoryEntries = this.getEditorHistoryEntries(value);
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

		const results: QuickOpenEntry[] = [];
		history.forEach(input => {
			let resource: URI;
			if (input instanceof EditorInput) {
				resource = toResource(input, { filter: ['file', 'untitled'] });
			} else {
				resource = (input as IResourceInput).resource;
			}

			if (!resource) {
				return; //For now, only support to match on inputs that provide resource information
			}

			let searchTargetToMatch: string;
			if (searchInPath) {
				searchTargetToMatch = labels.getPathLabel(resource, this.contextService);
			} else if (input instanceof EditorInput) {
				searchTargetToMatch = input.getName();
			} else {
				searchTargetToMatch = paths.basename((input as IResourceInput).resource.fsPath);
			}

			// Check if this entry is a match for the search value
			if (!filters.matchesFuzzy(searchValue, searchTargetToMatch)) {
				return;
			}

			const entry = this.instantiationService.createInstance(EditorHistoryEntry, input);

			const { labelHighlights, descriptionHighlights } = QuickOpenEntry.highlight(entry, searchValue);
			entry.setHighlights(labelHighlights, descriptionHighlights);

			results.push(entry);
		});

		// Sort
		const normalizedSearchValue = strings.stripWildcards(searchValue.toLowerCase());
		return results.sort((elementA: EditorHistoryEntry, elementB: EditorHistoryEntry) => QuickOpenEntry.compare(elementA, elementB, normalizedSearchValue));
	}

	private mergeResults(quickOpenModel: QuickOpenModel, handlerResults: QuickOpenEntry[], groupLabel: string): void {

		// Remove results already showing by checking for a "resource" property
		const mapEntryToResource = this.mapEntriesToResource(quickOpenModel);
		const additionalHandlerResults: QuickOpenEntry[] = [];
		for (let i = 0; i < handlerResults.length; i++) {
			const result = handlerResults[i];
			const resource = result.getResource();

			if (!result.isFile() || !resource || !mapEntryToResource[resource.toString()]) {
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

			return TPromise.wrapError(new Error('Unable to instantiate quick open handler ' + handler.moduleName + ' - ' + handler.ctorName + ': ' + JSON.stringify(error)));
		});
	}

	private _resolveHandler(handler: QuickOpenHandlerDescriptor): TPromise<QuickOpenHandler> {
		const id = handler.getId();

		// Return Cached
		if (this.mapResolvedHandlersToPrefix[id]) {
			return this.mapResolvedHandlersToPrefix[id];
		}

		// Otherwise load and create
		return this.mapResolvedHandlersToPrefix[id] = this.instantiationService.createInstance<QuickOpenHandler>(handler);
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

class PickOpenEntry extends PlaceholderQuickOpenEntry implements IPickOpenItem {
	private _shouldRunWithContext: IEntryRunContext;
	private description: string;
	private detail: string;
	private hasSeparator: boolean;
	private separatorLabel: string;
	private alwaysShow: boolean;
	private resource: URI;
	private fileKind: FileKind;
	private _action: IAction;
	private removed: boolean;
	private payload: any;

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
		this.hasSeparator = item.separator && item.separator.border;
		this.separatorLabel = item.separator && item.separator.label;
		this.alwaysShow = item.alwaysShow;
		this._action = item.action;
		this.payload = item.payload;

		const fileItem = <IFilePickOpenEntry>item;
		this.resource = fileItem.resource;
		this.fileKind = fileItem.fileKind;
	}

	public getPayload(): any {
		return this.payload;
	}

	public remove(): void {
		super.setHidden(true);
		this.removed = true;

		this.onRemove();
	}

	public isHidden(): boolean {
		return this.removed || super.isHidden();
	}

	public get action(): IAction {
		return this._action;
	}

	public get index(): number {
		return this._index;
	}

	public getLabelOptions(): IIconLabelOptions {
		return {
			extraClasses: this.resource ? getIconClasses(this.modelService, this.modeService, this.resource, this.fileKind) : []
		};
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

	public getResource(): URI {
		return this.resource;
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

class PickOpenActionProvider implements IActionProvider {
	public hasActions(tree: ITree, element: PickOpenEntry): boolean {
		return !!element.action;
	}

	public getActions(tree: ITree, element: PickOpenEntry): TPromise<IAction[]> {
		return TPromise.as(element.action ? [element.action] : []);
	}

	public hasSecondaryActions(tree: ITree, element: PickOpenEntry): boolean {
		return false;
	}

	public getSecondaryActions(tree: ITree, element: PickOpenEntry): TPromise<IAction[]> {
		return TPromise.as([]);
	}

	public getActionItem(tree: ITree, element: PickOpenEntry, action: Action): BaseActionItem {
		return null;
	}
}

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
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
		@ITextFileService private textFileService: ITextFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super(editorService);

		this.input = input;

		if (input instanceof EditorInput) {
			this.resource = toResource(input, { filter: ['file', 'untitled'] });
			this.label = input.getName();
			this.description = input.getDescription();
			this.dirty = input.isDirty();
		} else {
			const resourceInput = input as IResourceInput;
			this.resource = resourceInput.resource;
			this.label = paths.basename(resourceInput.resource.fsPath);
			this.description = labels.getPathLabel(paths.dirname(this.resource.fsPath), contextService, environmentService);
			this.dirty = this.resource && this.textFileService.isDirty(this.resource);

			if (this.dirty && this.textFileService.getAutoSaveMode() === AutoSaveMode.AFTER_SHORT_DELAY) {
				this.dirty = false; // no dirty decoration if auto save is on with a short timeout
			}
		}
	}

	public getIcon(): string {
		return this.dirty ? 'dirty' : '';
	}

	public getLabel(): string {
		return this.label;
	}

	public getLabelOptions(): IIconLabelOptions {
		return {
			extraClasses: getIconClasses(this.modelService, this.modeService, this.resource)
		};
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, recently opened", this.getLabel());
	}

	public getDescription(): string {
		return this.description;
	}

	public getResource(): URI {
		return this.resource;
	}

	public getInput(): IEditorInput | IResourceInput {
		return this.input;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			const sideBySide = !context.quickNavigateConfiguration && context.keymods.indexOf(KeyMod.CtrlCmd) >= 0;
			const pinned = !this.configurationService.getConfiguration<IWorkbenchEditorConfiguration>().workbench.editor.enablePreviewFromQuickOpen;

			if (this.input instanceof EditorInput) {
				this.editorService.openEditor(this.input, { pinned }, sideBySide).done(null, errors.onUnexpectedError);
			} else {
				this.editorService.openEditor({ resource: (this.input as IResourceInput).resource, options: { pinned } }, sideBySide);
			}

			return true;
		}

		return super.run(mode, context);
	}
}

export class RemoveFromEditorHistoryAction extends Action {

	public static ID = 'workbench.action.removeFromEditorHistory';
	public static LABEL = nls.localize('removeFromEditorHistory', "Remove From History");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IHistoryService private historyService: IHistoryService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
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
