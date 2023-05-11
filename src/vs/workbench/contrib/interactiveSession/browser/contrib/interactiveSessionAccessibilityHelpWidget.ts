/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { addStandardDisposableListener } from 'vs/base/browser/dom';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { LinkDetector } from 'vs/editor/contrib/links/browser/links';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';

export class InteractiveAccessibilityHelpWidget extends Disposable implements IOverlayWidget  {
	private readonly _domElement: HTMLElement;
	private _editorWidget?: CodeEditorWidget;

	constructor(
		private readonly _editor: ICodeEditor,
		@IModelService private readonly _modelService: IModelService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
		this._domElement = document.createElement('div');
		this._domElement.classList.add('interactive-session-accessibility-help-widget');
	}
	async show(): Promise<void> {
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
			readOnly: true
		};
		this._editorWidget = this._register(this._instantiationService.createInstance(CodeEditorWidget, this._domElement, editorOptions, codeEditorWidgetOptions));
		let model = this._editorWidget.getModel();
		if (model) {
			model.setValue(`testing\\n1\\2n\\3n
			\\4n\\
			5n\\nlfsjdkfjsdlkfjsldkj`);
		} else {
			model = await this.getTextModel();
		}

		this._editorWidget.setModel(model);
		const layoutInfo = this._editor.getLayoutInfo();
		this._editor.layout({width: 300, height: 300});
		this._editorWidget.layout({ width: 300, height: 300 });
		this._register(addStandardDisposableListener(this._editorWidget.getDomNode()!, 'keydown', (e) => {
			if (e.keyCode === KeyCode.Escape) {
				this._editor.layout(layoutInfo);
				this._editor.focus();
				this.dispose();
			}
		}));
	}
	getDomNode(): HTMLElement {
		return this._domElement;
	}
	getId(): string {
		return 'interactiveSession';
	}
	async getTextModel(): Promise<ITextModel> {
		const existing = this._modelService.getModel(URI.from({ scheme: 'interactiveSession', path: 'interactiveSession' }));
		if (existing && !existing.isDisposed()) {
			return existing;
		}
		return this._modelService.createModel(`testing\\n1\\2n\\3n
		\\4n\\
		5n\\nlfsjdkfjsdlkfjsldkj`, null, URI.from({ scheme: 'interactiveSession', path: 'interactiveSession' }), false);
	}
	getPosition(): IOverlayWidgetPosition {
		return {
			preference: OverlayWidgetPositionPreference.TOP_CENTER
		};
	}
}
