/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { AccessibilityHelpNLS } from 'vs/editor/common/standaloneStrings';
import { LinkDetector } from 'vs/editor/contrib/links/browser/links';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextViewDelegate, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IDisposable } from 'xterm';

const enum DIMENSION_DEFAULT {
	WIDTH = .6,
	HEIGHT = 200
}

export interface IAccessibleContentProvider {
	id: string;
	provideContent(): string;
	onClose(): void;
	onKeyDown?(e: IKeyboardEvent): void;
	options: IAccessibleViewOptions;
}

export const IAccessibleViewService = createDecorator<IAccessibleViewService>('accessibleViewService');

export interface IAccessibleViewService {
	readonly _serviceBrand: undefined;
	show(providerId: string): AccessibleView;
	registerProvider(provider: IAccessibleContentProvider): IDisposable;
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

class AccessibleView extends Disposable {
	private _editorWidget: CodeEditorWidget;
	get editorWidget() { return this._editorWidget; }
	private _editorContainer: HTMLElement;

	constructor(
		@IOpenerService private readonly _openerService: IOpenerService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IModelService private readonly _modelService: IModelService,
		@IContextViewService private readonly _contextViewService: IContextViewService
	) {
		super();
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
			readOnly: true
		};
		this._editorWidget = this._register(this._instantiationService.createInstance(CodeEditorWidget, this._editorContainer, editorOptions, codeEditorWidgetOptions));
	}

	show(provider: IAccessibleContentProvider): void {
		const delegate: IContextViewDelegate = {
			getAnchor: () => this._editorContainer,
			render: (container) => {
				return this._render(provider, container);
			},
			onHide: () => {
				provider.onClose();
			}
		};
		this._contextViewService.showContextView(delegate);
	}

	private _render(provider: IAccessibleContentProvider, container: HTMLElement): IDisposable {
		const settingKey = `accessibility.verbosity.${provider.id}`;
		const value = this._configurationService.getValue(settingKey);
		const readMoreLink = provider.options.readMoreUrl ? localize("openDoc", "\nPress H now to open a browser window with more information related to accessibility.\n") : '';
		const disableHelpHint = provider.options.type && value ? localize('disable-help-hint', '\nTo disable the `accessibility.verbosity` hint for this feature, press D now.\n') : '\n';
		const fragment = provider.provideContent() + readMoreLink + disableHelpHint + localize('exit-tip', 'Exit this menu via the Escape key.');

		this._getTextModel(URI.from({ path: `accessible-view-${provider.id}`, scheme: 'accessible-view', fragment })).then((model) => {
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
			this._register(this._editorWidget.onKeyUp((e) => {
				if (e.keyCode === KeyCode.Escape) {
					this._contextViewService.hideContextView();
				} else if (e.keyCode === KeyCode.KeyD) {
					this._configurationService.updateValue(settingKey, false);
				} else if (e.keyCode === KeyCode.KeyH && provider.options.readMoreUrl) {
					const url: string = provider.options.readMoreUrl!;
					alert(AccessibilityHelpNLS.openingDocs);
					this._openerService.open(URI.parse(url));
				}
				e.stopPropagation();
				provider.onKeyDown?.(e);
			}));
			this._register(this._editorWidget.onDidBlurEditorText(() => this._contextViewService.hideContextView()));
			this._register(this._editorWidget.onDidContentSizeChange(() => this._layout()));
			this._editorWidget.updateOptions({ ariaLabel: provider.options.ariaLabel });
			this._editorWidget.focus();
		});
		return toDisposable(() => provider.onClose());
	}

	private _layout(): void {
		const windowWidth = window.innerWidth;
		const width = windowWidth * DIMENSION_DEFAULT.WIDTH;
		this._editorWidget.layout({ width, height: this._editorWidget.getContentHeight() });
		const left = Math.round((windowWidth - width) / 2);
		this._editorContainer.style.left = `${left}px`;
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

	private _providers: Map<string, IAccessibleContentProvider> = new Map();

	private _accessibleView: AccessibleView | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
	}

	registerProvider(provider: IAccessibleContentProvider): IDisposable {
		this._providers.set(provider.id, provider);
		return toDisposable(() => {
			this._providers.delete(provider.id);
		});
	}

	show(providerId: string): AccessibleView {
		if (!this._accessibleView) {
			this._accessibleView = this._register(this._instantiationService.createInstance(AccessibleView));
		}
		const provider = this._providers.get(providerId);
		if (!provider) {
			throw new Error(`No accessible view provider with id: ${providerId}`);
		}
		this._accessibleView.show(provider);
		return this._accessibleView;
	}
}
