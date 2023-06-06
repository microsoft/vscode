/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { LinkDetector } from 'vs/editor/contrib/links/browser/links';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextViewDelegate, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IDisposable } from 'xterm';

interface IAccessibleViewProvider {
	id: string;
	provideContent(): string;
	onClose(): void;
}

export class AccessibleView extends Disposable {

	private _editorWidget: CodeEditorWidget;
	private _editorContainer: HTMLElement;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IModelService private readonly _modelService: IModelService,
		@IContextViewService private readonly _contextViewService: IContextViewService) {
		super();
		this._editorContainer = document.createElement('div');
		this._editorContainer.classList.add('accessible-view');
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([LinkDetector.ID, SelectionClipboardContributionID, 'editor.contrib.selectionAnchorController'])
		};
		const editorOptions: IEditorConstructionOptions = {
			...getSimpleEditorOptions(),
			lineDecorationsWidth: 6,
			dragAndDrop: true,
			cursorWidth: 1,
			wrappingStrategy: 'advanced',
			wrappingIndent: 'none',
			padding: { top: 2, bottom: 2 },
			quickSuggestions: false,
			renderWhitespace: 'none',
			dropIntoEditor: { enabled: true },
			accessibilitySupport: this._configurationService.getValue<'auto' | 'off' | 'on'>('editor.accessibilitySupport'),
			cursorBlinking: this._configurationService.getValue('terminal.integrated.cursorBlinking'),
			readOnly: true
		};
		this._editorWidget = this._register(this._instantiationService.createInstance(CodeEditorWidget, this._editorContainer, editorOptions, codeEditorWidgetOptions));
	}

	providers: Map<string, IAccessibleViewProvider> = new Map();

	registerProvider(provider: IAccessibleViewProvider): void {
		this.providers.set(provider.id, provider);
	}

	show(providerId: string): void {
		const delegate: IContextViewDelegate = {
			getAnchor: () => this._editorContainer,
			render: (container) => {
				return this._updateModel(providerId, container);
			},
			onHide: () => {
				this.providers.get(providerId)?.onClose();
			}
		};
		this._contextViewService.showContextView(delegate);
	}

	private _getContent(providerId: string): string {
		return this.providers.get(providerId)?.provideContent() ?? '';
	}

	private _updateModel(providerId: string, container: HTMLElement): IDisposable {
		const contents = this._getContent(providerId);
		const model = this._editorWidget.getModel();
		if (model) {
			model.setValue(contents);
			this._editorWidget.focus();
		} else {
			this._getTextModel(URI.from({ path: `accessible-view-${providerId}`, scheme: 'accessible-view', fragment: contents })).then((model) => {
				if (model) {
					this._setModelAndRender(model, container);
				}
			});
		}
		return { dispose: () => this._editorWidget.dispose() } as IDisposable;
	}

	private _setModelAndRender(model: ITextModel, container: HTMLElement): void {
		this._editorWidget.setModel(model);
		const domNode = this._editorWidget.getDomNode();
		if (!domNode) {
			return;
		}
		container.appendChild(domNode);
		this._editorWidget.layout({ width: 500, height: 300 });
		this._register(this._editorWidget.onKeyDown((e) => {
			if (e.keyCode === KeyCode.Escape) {
				this._contextViewService.hideContextView();
			}
		}));
		this._register(this._editorWidget.onDidBlurEditorText(() => this._contextViewService.hideContextView()));
		this._editorWidget.focus();
	}

	private async _getTextModel(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}
		return this._modelService.createModel(resource.fragment, null, resource, false);
	}
}
