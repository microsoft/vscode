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
import { LinkDetector } from 'vs/editor/contrib/links/browser/links';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewDelegate, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { alert } from 'vs/base/browser/ui/aria/aria';

const enum DEFAULT {
	WIDTH = 800,
	TOP = 3
}

export interface IAccessibleContentProvider {
	verbositySettingKey: string;
	provideContent(): string;
	onClose(): void;
	onKeyDown?(e: IKeyboardEvent): void;
	options: IAccessibleViewOptions;
}

export const IAccessibleViewService = createDecorator<IAccessibleViewService>('accessibleViewService');

export interface IAccessibleViewService {
	readonly _serviceBrand: undefined;
	show(provider: IAccessibleContentProvider): void;
}

export const enum AccessibleViewType {
	HelpMenu = 'helpMenu',
	View = 'view'
}

export interface IAccessibleViewOptions {
	ariaLabel: string;
	readMoreUrl?: string;
	language?: string;
	type: AccessibleViewType;
}

export const accessibilityHelpIsShown = new RawContextKey<boolean>('accessibilityHelpIsShown', false, true);
class AccessibleView extends Disposable {
	private _editorWidget: CodeEditorWidget;
	private _accessiblityHelpIsShown: IContextKey<boolean>;
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
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		super();
		this._accessiblityHelpIsShown = accessibilityHelpIsShown.bindTo(this._contextKeyService);
		this._editorContainer = document.createElement('div');
		this._editorContainer.classList.add('accessible-view');
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([LinkDetector.ID, SelectionClipboardContributionID, 'editor.contrib.selectionAnchorController'])
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
				return this._render(provider, container);
			},
			onHide: () => {
				if (provider.options.type === AccessibleViewType.HelpMenu) {
					this._accessiblityHelpIsShown.reset();
				}
				this._currentProvider = undefined;
			}
		};
		this._contextViewService.showContextView(delegate);
		if (provider.options.type === AccessibleViewType.HelpMenu) {
			this._accessiblityHelpIsShown.set(true);
		}
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
			if (accessibilitySupport && provider.verbositySettingKey === 'editor') {
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
			if (provider.options.language) {
				model.setLanguage(provider.options.language);
			}
			container.appendChild(this._editorContainer);
			this._editorWidget.updateOptions({ ariaLabel: provider.options.ariaLabel });
			this._editorWidget.focus();
		});
		const disposableStore = new DisposableStore();
		disposableStore.add(this._editorWidget.onKeyUp((e) => {
			if (e.keyCode === KeyCode.Escape) {
				this._contextViewService.hideContextView();
				// Delay to allow the context view to hide #186514
				setTimeout(() => provider.onClose(), 100);
			} else if (e.keyCode === KeyCode.KeyD && this._configurationService.getValue(settingKey)) {
				alert(localize('disableAccessibilityHelp', '{0} accessibility verbosity is now disabled', provider.verbositySettingKey));
				this._configurationService.updateValue(settingKey, false);
			}
			e.stopPropagation();
			provider.onKeyDown?.(e);
		}));
		disposableStore.add(this._editorWidget.onKeyDown((e) => {
			if (e.keyCode === KeyCode.KeyH && provider.options.readMoreUrl) {
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
}

export class AccessibleViewService extends Disposable implements IAccessibleViewService {
	declare readonly _serviceBrand: undefined;
	private _accessibleView: AccessibleView | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
	}

	show(provider: IAccessibleContentProvider): void {
		if (!this._accessibleView) {
			this._accessibleView = this._register(this._instantiationService.createInstance(AccessibleView));
		}
		this._accessibleView.show(provider);
	}
}
