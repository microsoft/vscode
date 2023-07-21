/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { isMacintosh } from 'vs/base/common/platform';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { AccessibilityHelpNLS } from 'vs/editor/common/standaloneStrings';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewDelegate, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { CodeActionController } from 'vs/editor/contrib/codeAction/browser/codeActionController';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { AccessibilityVerbositySettingId, AccessibleViewAction, AccessibleViewNextAction } from 'vs/workbench/contrib/accessibility/browser/accessibilityContribution';

const enum DEFAULT {
	WIDTH = 800,
	TOP = 3
}

export interface IAccessibleContentProvider {
	verbositySettingKey: AccessibilityVerbositySettingId;
	provideContent(): string;
	onClose(): void;
	onKeyDown?(e: IKeyboardEvent): void;
	previous?(): void;
	next?(): void;
	options: IAccessibleViewOptions;
}

export const IAccessibleViewService = createDecorator<IAccessibleViewService>('accessibleViewService');

export interface IAccessibleViewService {
	readonly _serviceBrand: undefined;
	show(provider: IAccessibleContentProvider): void;
	next(): void;
	previous(): void;
	/**
	 * If the setting is enabled, provides the open accessible view hint as a localized string.
	 * @param verbositySettingKey The setting key for the verbosity of the feature
	 */
	getOpenAriaHint(verbositySettingKey: AccessibilityVerbositySettingId): string | null;
}

export const enum AccessibleViewType {
	HelpMenu = 'helpMenu',
	View = 'view'
}

export interface IAccessibleViewOptions {
	ariaLabel: string;
	readMoreUrl?: string;
	/**
	 * Defaults to markdown
	 */
	language?: string;
	type: AccessibleViewType;
}

export const accessibilityHelpIsShown = new RawContextKey<boolean>('accessibilityHelpIsShown', false, true);
export const accessibleViewIsShown = new RawContextKey<boolean>('accessibleViewIsShown', false, true);
class AccessibleView extends Disposable {
	private _editorWidget: CodeEditorWidget;
	private _accessiblityHelpIsShown: IContextKey<boolean>;
	private _accessibleViewIsShown: IContextKey<boolean>;
	get editorWidget() { return this._editorWidget; }
	private _editorContainer: HTMLElement;
	private _currentProvider: IAccessibleContentProvider | undefined;

	constructor(
		@IOpenerService private readonly _openerService: IOpenerService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IModelService private readonly _modelService: IModelService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();
		this._accessiblityHelpIsShown = accessibilityHelpIsShown.bindTo(this._contextKeyService);
		this._accessibleViewIsShown = accessibleViewIsShown.bindTo(this._contextKeyService);
		this._editorContainer = document.createElement('div');
		this._editorContainer.classList.add('accessible-view');
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			contributions: EditorExtensionsRegistry.getEditorContributions().filter(c => c.id !== CodeActionController.ID)
		};
		const editorOptions: IEditorConstructionOptions = {
			...getSimpleEditorOptions(this._configurationService),
			lineDecorationsWidth: 6,
			dragAndDrop: true,
			cursorWidth: 1,
			wrappingStrategy: 'advanced',
			wrappingIndent: 'none',
			padding: { top: 2, bottom: 2 },
			quickSuggestions: false,
			renderWhitespace: 'none',
			dropIntoEditor: { enabled: true },
			readOnly: true,
			fontFamily: 'var(--monaco-monospace-font)'
		};
		this._editorWidget = this._register(this._instantiationService.createInstance(CodeEditorWidget, this._editorContainer, editorOptions, codeEditorWidgetOptions));
		this._register(this._accessibilityService.onDidChangeScreenReaderOptimized(() => {
			if (this._currentProvider && this._accessiblityHelpIsShown.get()) {
				this.show(this._currentProvider);
			}
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (this._currentProvider && this._accessiblityHelpIsShown.get() && e.affectsConfiguration(`accessibility.verbosity.${this._currentProvider.verbositySettingKey}`)) {
				this.show(this._currentProvider);
			}
		}));
	}

	show(provider: IAccessibleContentProvider): void {
		const delegate: IContextViewDelegate = {
			getAnchor: () => { return { x: (window.innerWidth / 2) - (DEFAULT.WIDTH / 2), y: DEFAULT.TOP }; },
			render: (container) => {
				container.classList.add('accessible-view-container');
				return this._render(provider, container);
			},
			onHide: () => {
				if (provider.options.type === AccessibleViewType.HelpMenu) {
					this._accessiblityHelpIsShown.reset();
				} else {
					this._accessibleViewIsShown.reset();
				}
				this._currentProvider = undefined;
			}
		};
		this._contextViewService.showContextView(delegate);
		if (provider.options.type === AccessibleViewType.HelpMenu) {
			this._accessiblityHelpIsShown.set(true);
		} else {
			this._accessibleViewIsShown.set(true);
		}
		this._currentProvider = provider;
	}

	previous(): void {
		if (!this._currentProvider) {
			return;
		}
		this._currentProvider.previous?.();
	}

	next(): void {
		if (!this._currentProvider) {
			return;
		}
		this._currentProvider.next?.();
	}

	private _render(provider: IAccessibleContentProvider, container: HTMLElement): IDisposable {
		this._currentProvider = provider;
		const settingKey = `accessibility.verbosity.${provider.verbositySettingKey}`;
		const value = this._configurationService.getValue(settingKey);
		const readMoreLink = provider.options.readMoreUrl ? localize("openDoc", "\nPress H now to open a browser window with more information related to accessibility.\n") : '';
		const disableHelpHint = provider.options.type === AccessibleViewType.HelpMenu && !!value ? localize('disable-help-hint', '\nTo disable the `accessibility.verbosity` hint for this feature, press D now.\n') : '\n';
		const accessibilitySupport = this._accessibilityService.isScreenReaderOptimized();
		let message = '';
		if (provider.options.type === AccessibleViewType.HelpMenu) {
			const turnOnMessage = (
				isMacintosh
					? AccessibilityHelpNLS.changeConfigToOnMac
					: AccessibilityHelpNLS.changeConfigToOnWinLinux
			);
			if (accessibilitySupport && provider.verbositySettingKey === AccessibilityVerbositySettingId.Editor) {
				message = AccessibilityHelpNLS.auto_on;
				message += '\n';
			} else if (!accessibilitySupport) {
				message = AccessibilityHelpNLS.auto_off + '\n' + turnOnMessage;
				message += '\n';
			}
		}

		const fragment = message + provider.provideContent() + readMoreLink + disableHelpHint + localize('exit-tip', 'Exit this menu via the Escape key.');

		this._getTextModel(URI.from({ path: `accessible-view-${provider.verbositySettingKey}`, scheme: 'accessible-view', fragment })).then((model) => {
			if (!model) {
				return;
			}
			this._editorWidget.setModel(model);
			const domNode = this._editorWidget.getDomNode();
			if (!domNode) {
				return;
			}
			model.setLanguage(provider.options.language ?? 'markdown');
			container.appendChild(this._editorContainer);
			this._editorWidget.updateOptions({ ariaLabel: provider.next && provider.previous ? localize('accessibleViewAriaLabelWithNav', "{0} {1}", provider.options.ariaLabel, this._getNavigationAriaHint(provider.verbositySettingKey)) : localize('accessibleViewAriaLabel', "{0}", provider.options.ariaLabel) });
			this._editorWidget.focus();
		});
		const disposableStore = new DisposableStore();
		disposableStore.add(this._editorWidget.onKeyUp((e) => {
			if (e.keyCode === KeyCode.KeyD && this._configurationService.getValue(settingKey)) {
				alert(localize('disableAccessibilityHelp', '{0} accessibility verbosity is now disabled', provider.verbositySettingKey));
				this._configurationService.updateValue(settingKey, false);
			}
			provider.onKeyDown?.(e);
			// e.stopPropagation();
		}));
		disposableStore.add(this._editorWidget.onKeyDown((e) => {
			if (e.keyCode === KeyCode.Escape) {
				e.stopPropagation();
				this._contextViewService.hideContextView();
				// Delay to allow the context view to hide #186514
				setTimeout(() => provider.onClose(), 100);
			} else if (e.keyCode === KeyCode.KeyH && provider.options.readMoreUrl) {
				const url: string = provider.options.readMoreUrl!;
				alert(AccessibilityHelpNLS.openingDocs);
				this._openerService.open(URI.parse(url));
				e.preventDefault();
				e.stopPropagation();
			}
		}));
		disposableStore.add(this._editorWidget.onDidBlurEditorText(() => this._contextViewService.hideContextView()));
		disposableStore.add(this._editorWidget.onDidContentSizeChange(() => this._layout()));
		return disposableStore;
	}

	private _layout(): void {
		this._editorWidget.layout({ width: DEFAULT.WIDTH, height: this._editorWidget.getContentHeight() });
	}

	private async _getTextModel(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}
		return this._modelService.createModel(resource.fragment, null, resource, false);
	}

	private _getNavigationAriaHint(verbositySettingKey: AccessibilityVerbositySettingId): string {
		let hint = '';
		const nextKeybinding = this._keybindingService.lookupKeybinding(AccessibleViewNextAction.id)?.getAriaLabel();
		const previousKeybinding = this._keybindingService.lookupKeybinding(AccessibleViewNextAction.id)?.getAriaLabel();
		if (this._configurationService.getValue(verbositySettingKey)) {
			hint = (nextKeybinding && previousKeybinding) ? localize('chatAccessibleViewNextPreviousHint', "Show the next {0} or previous {1} item in the accessible view", nextKeybinding, previousKeybinding) : localize('chatAccessibleViewNextPreviousHintNoKb', "Show the next or previous item in the accessible view by configuring keybindings for Show Next / Previous in Accessible View");
		}
		return hint;
	}
}

export class AccessibleViewService extends Disposable implements IAccessibleViewService {
	declare readonly _serviceBrand: undefined;
	private _accessibleView: AccessibleView | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();
	}

	show(provider: IAccessibleContentProvider): void {
		if (!this._accessibleView) {
			this._accessibleView = this._register(this._instantiationService.createInstance(AccessibleView));
		}
		this._accessibleView.show(provider);
	}
	next(): void {
		this._accessibleView?.next();
	}
	previous(): void {
		this._accessibleView?.previous();
	}
	getOpenAriaHint(verbositySettingKey: AccessibilityVerbositySettingId): string | null {
		if (!this._configurationService.getValue(verbositySettingKey)) {
			return null;
		}
		const keybinding = this._keybindingService.lookupKeybinding(AccessibleViewAction.id)?.getAriaLabel();
		return keybinding ? localize('chatAccessibleViewHint', "Inspect this in the accessible view with {0}", keybinding) : localize('chatAccessibleViewHintNoKb', "Inspect this in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding");
	}
}
