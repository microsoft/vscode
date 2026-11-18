/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../../editor/browser/config/editorConfiguration.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ContextMenuController } from '../../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { ContentHoverController } from '../../../../../editor/contrib/hover/browser/contentHoverController.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../../common/editor.js';
import { MenuPreventer } from '../../../codeEditor/browser/menuPreventer.js';
import { SelectionClipboardContributionID } from '../../../codeEditor/browser/selectionClipboard.js';
import { CustomEditorInput } from '../../../customEditor/browser/customEditorInput.js';
import { ICustomEditorService } from '../../../customEditor/common/customEditor.js';
import { IEditorResolverService } from '../../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';

/** What a embedded resource shows. */
export interface IChatResourceTarget {
	readonly resource: URI;
	readonly label: string;
}

/** The content of a embedded resource, rendered into the view's body. */
export interface IChatResourceContent extends Disposable {
	/** The height the content needs, or `undefined` until it is known. */
	readonly contentHeight: IObservable<number | undefined>;
	layout(width: number, height: number): void;
}

/**
 * Renders a resource with the editor that opens it by default: its custom editor when that is the default (such as an
 * extension's view or an image preview), and a readonly text editor otherwise.
 * @param owner Owns the content from its creation on, so that disposing it while the content loads disposes the content.
 */
export async function createChatResourceContent(
	target: IChatResourceTarget,
	body: HTMLElement,
	getClippingContainer: () => HTMLElement,
	instantiationService: IInstantiationService,
	owner: DisposableStore,
): Promise<IChatResourceContent> {
	return instantiationService.invokeFunction(async accessor => {
		const defaultEditor = accessor.get(IEditorResolverService).getEditorMatches(target.resource).defaultRule.editor.id;
		if (defaultEditor !== DEFAULT_EDITOR_ASSOCIATION.id) {
			const customEditorService = accessor.get(ICustomEditorService);
			await accessor.get(IExtensionService).activateByEvent(`onCustomEditor:${defaultEditor}`);
			if (owner.isDisposed) {
				throw new CancellationError();
			}
			// Only custom editors that an extension provides render in a webview here; other editors, such as notebooks, show
			// the resource as text.
			const capabilities = customEditorService.getCustomEditorCapabilities(defaultEditor);
			if (capabilities) {
				return whenReady(owner.add(instantiationService.createInstance(ChatResourceWebviewContent, target, defaultEditor, !capabilities.supportsMultipleEditorsPerDocument, body, getClippingContainer)));
			}
		}
		return whenReady(owner.add(instantiationService.createInstance(ChatResourceTextContent, target.resource, body)));
	});
}

/** The content once it is ready; content that fails to get ready is disposed. */
async function whenReady<T extends IChatResourceContent & { ready(): Promise<T> }>(content: T): Promise<T> {
	try {
		return await content.ready();
	} catch (error) {
		content.dispose();
		throw error;
	}
}


const editorContributions = () => EditorExtensionsRegistry.getSomeEditorContributions([
	MenuPreventer.ID,
	SelectionClipboardContributionID,
	ContextMenuController.ID,
	ContentHoverController.ID,
]);

const embeddedEditorOptions: IEditorConstructionOptions = {
	// The resource is a document, so it looks like it does in an editor, rather than like the input boxes of the part around the chat.
	extraEditorClassName: 'keep-editor-background',
	readOnly: true,
	scrollBeyondLastLine: false,
	// The chat is narrow: wrapping keeps whole lines in view, especially prose such as Markdown.
	wordWrap: 'on',
	minimap: { enabled: false },
	stickyScroll: { enabled: false },
	lineNumbersMinChars: 3,
	glyphMargin: false,
	folding: false,
	renderLineHighlight: 'none',
	overviewRulerLanes: 0,
	scrollbar: { alwaysConsumeMouseWheel: false, useShadows: false },
	automaticLayout: false,
};

/** A text resource in a readonly code editor, showing the document an editor of the resource edits, including unsaved changes. */
class ChatResourceTextContent extends Disposable implements IChatResourceContent {
	private readonly _contentHeight = observableValue<number | undefined>(this, undefined);
	readonly contentHeight: IObservable<number | undefined> = this._contentHeight;
	private readonly _editor: CodeEditorWidget;

	constructor(
		private readonly _resource: URI,
		body: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
	) {
		super();
		const options: ICodeEditorWidgetOptions = { isSimpleWidget: false, contributions: editorContributions() };
		this._editor = this._register(instantiationService.createInstance(CodeEditorWidget, body, embeddedEditorOptions, options));
		this._register(this._editor.onDidContentSizeChange(() => this._contentHeight.set(this._editor.getContentHeight(), undefined)));
	}

	async ready(): Promise<this> {
		const reference = await this._textModelService.createModelReference(this._resource);
		if (this._store.isDisposed) {
			reference.dispose();
			return this;
		}
		this._register(reference);
		this._editor.setModel(reference.object.textEditorModel);
		this._contentHeight.set(this._editor.getContentHeight(), undefined);
		return this;
	}

	layout(width: number, height: number): void {
		this._editor.layout({ width, height });
	}
}

/**
 * A resource rendered by its custom editor in an overlay webview anchored to the view's body. A custom editor that supports
 * only one editor per document is not rendered while an editor shows the resource, so that it gets no second instance.
 */
class ChatResourceWebviewContent extends Disposable implements IChatResourceContent {
	private readonly _contentHeight = observableValue<number | undefined>(this, undefined);
	readonly contentHeight: IObservable<number | undefined> = this._contentHeight;
	/** The custom editor input and its webview while the chat shows them. */
	private readonly _presentation = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		private readonly _target: IChatResourceTarget,
		private readonly _viewType: string,
		private readonly _singlePerResource: boolean,
		private readonly _body: HTMLElement,
		private readonly _getClippingContainer: () => HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();
	}

	async ready(): Promise<this> {
		if (this._singlePerResource) {
			this._register(this._editorService.onDidEditorsChange(() => {
				if (this._presentation.value && this._isOpenInEditor()) {
					this._showOpenInEditor();
				}
			}));
			if (this._isOpenInEditor()) {
				this._showOpenInEditor();
				return this;
			}
		}
		const presentation = this._presentation.value = new DisposableStore();
		const input = presentation.add(CustomEditorInput.create(this._instantiationService, {
			resource: this._target.resource,
			viewType: this._viewType,
			webviewTitle: this._target.label,
			preferredName: this._target.label,
			iconPath: undefined,
		}, undefined));
		if (!(input instanceof CustomEditorInput)) {
			return this;
		}
		await input.resolve();
		if (!presentation.isDisposed) {
			this._attach(input, presentation);
		}
		return this;
	}

	private _isOpenInEditor(): boolean {
		return this._editorService.editors.some(editor => editor instanceof CustomEditorInput && editor.viewType === this._viewType && isEqual(editor.resource, this._target.resource));
	}

	private _showOpenInEditor(): void {
		this._presentation.clear();
		dom.reset(this._body, dom.$('.chat-embedded-resource-message', undefined, localize('chatResources.openInEditorElsewhere', "{0} is open in an editor.", this._target.label)));
	}

	private _attach(input: CustomEditorInput, presentation: DisposableStore): void {
		const webview = input.webview;
		const targetWindow = dom.getWindow(this._body);
		// Webviews report the height of their document, which is the content height.
		presentation.add(autorun(reader => {
			const size = webview.intrinsicContentSize.read(reader);
			if (size) {
				this._contentHeight.set(size.height, undefined);
			}
		}));

		// Like MCP apps in chat, claim the overlay only while its anchor is visible.
		let claimed = false;
		const release = () => {
			if (claimed) {
				claimed = false;
				webview.release(this);
			}
		};
		const observer = new targetWindow.IntersectionObserver(entries => {
			if (entries.some(entry => entry.isIntersecting) && this._body.isConnected) {
				webview.claim(this, targetWindow, undefined);
				claimed = true;
				webview.setAnchorElement(this._body, this._getClippingContainer());
			} else {
				release();
			}
		});
		observer.observe(this._body);
		presentation.add(toDisposable(() => {
			observer.disconnect();
			release();
		}));
	}

	layout(): void {
		// The overlay follows its anchor element.
	}
}
