/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { AbstractCodeEditorService } from 'vs/editor/browser/services/abstractCodeEditorService';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { LinkDetector } from 'vs/editor/contrib/links/browser/links';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';

interface IAccessibleViewProvider {
	id: string;
	provideContent(): string;
	onDispose: Event<IAccessibleViewProvider>;
}

export class AccessibleView extends Disposable {

	private _editorWidget: CodeEditorWidget;
	private _editorContainer: HTMLElement;

	constructor(
		private readonly _codeEditorService: AbstractCodeEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IModelService private readonly _modelService: IModelService) {
		super();
		this._editorContainer = document.createElement('div');
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
		this._editorContainer = document.createElement('div');
		this._editorWidget = this._register(this._instantiationService.createInstance(CodeEditorWidget, this._editorContainer, editorOptions, codeEditorWidgetOptions));

	}

	providers: Map<string, IAccessibleViewProvider> = new Map();

	registerProvider(provider: IAccessibleViewProvider): void {
		this.providers.set(provider.id, provider);
		provider.onDispose(() => this.providers.delete(provider.id));
	}
	show(providerId: string): void {
		const textContent = this._getContent(providerId);
		this._render(textContent);
	}

	private _getContent(providerId: string): string {
		return this.providers.get(providerId)?.provideContent() ?? '';
	}
	private async _render(contents: string): Promise<void> {
		let model = this._editorWidget.getModel();
		if (model) {
			model.setValue(contents);
		} else {
			model = await this._getTextModel(URI.from({ path: 'hi', scheme: 'accessible-view', fragment: `${'accessible-view'}-${contents}` }));
		}
		this._editorWidget.setModel(model);
		this._codeEditorService.addCodeEditor(this._editorWidget);
	}

	private async _getTextModel(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}
		return this._modelService.createModel(`${'accessible-view'}-${resource.fragment}`, null, resource, false);
	}
}
