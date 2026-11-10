/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, IDisposable, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { Event } from '../../../../../base/common/event.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../../editor/browser/config/editorConfiguration.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { DiffEditorWidget } from '../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ContextMenuController } from '../../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { ContentHoverController } from '../../../../../editor/contrib/hover/browser/contentHoverController.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../../common/editor.js';
import { MenuPreventer } from '../../../codeEditor/browser/menuPreventer.js';
import { SelectionClipboardContributionID } from '../../../codeEditor/browser/selectionClipboard.js';
import { CustomEditorInput } from '../../../customEditor/browser/customEditorInput.js';
import { ICustomEditorService } from '../../../customEditor/common/customEditor.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService } from '../../../../services/editor/common/editorResolverService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';

/** What a embedded resource shows: a resource, or the changes from an original to a modified resource. */
export interface IChatResourceTarget {
	readonly resource: URI;
	readonly originalResource?: URI;
	readonly label: string;
}

/** The content of a embedded resource, rendered into the view's body. */
export interface IChatResourceContent extends Disposable {
	/** The height the content needs, or `undefined` until it is known. */
	readonly contentHeight: IObservable<number | undefined>;
	/** Whether editable content has changes that are not saved yet; absent for content that cannot be edited. */
	readonly isDirty?: IObservable<boolean>;
	save?(): Promise<void>;
	layout(width: number, height: number): void;
}

/** Renders resources that no editor renders by their resource, such as websites in the integrated browser. */
export interface IChatResourceContentProvider {
	canRender(target: IChatResourceTarget): boolean;
	create(target: IChatResourceTarget, body: HTMLElement, getClippingContainer: () => HTMLElement, instantiationService: IInstantiationService): Promise<IChatResourceContent>;
	/** Whether an editor shows the resource. */
	isOpenInEditor(target: IChatResourceTarget, instantiationService: IInstantiationService): boolean;
	/** Opens the resource in an editor, or reveals the editor that shows it, moving it there when the chat shows it. */
	openInEditor(target: IChatResourceTarget, pinned: boolean, instantiationService: IInstantiationService): Promise<void>;
}

const contentProviders: IChatResourceContentProvider[] = [];

/** Registers how to render resources that no editor renders; providers that live in other layers register themselves. */
export function registerChatResourceContentProvider(provider: IChatResourceContentProvider): IDisposable {
	contentProviders.push(provider);
	return toDisposable(() => {
		const index = contentProviders.indexOf(provider);
		if (index >= 0) {
			contentProviders.splice(index, 1);
		}
	});
}

export function getChatResourceContentProvider(target: IChatResourceTarget): IChatResourceContentProvider | undefined {
	return contentProviders.find(candidate => candidate.canRender(target));
}

/**
 * Renders a resource with the editor that opens it by default: its custom editor when that is the default (such as an
 * extension's view or an image preview), and a text editor otherwise, both editable like in an editor unless the resource
 * is readonly. A text resource with an original shows as a readonly diff.
 */
export async function createChatResourceContent(
	target: IChatResourceTarget,
	body: HTMLElement,
	getClippingContainer: () => HTMLElement,
	instantiationService: IInstantiationService,
): Promise<IChatResourceContent> {
	return instantiationService.invokeFunction(async accessor => {
		const provider = getChatResourceContentProvider(target);
		if (provider) {
			return provider.create(target, body, getClippingContainer, instantiationService);
		}
		const defaultEditor = accessor.get(IEditorResolverService).getEditorMatches(target.resource).defaultRule.editor.id;
		if (defaultEditor !== DEFAULT_EDITOR_ASSOCIATION.id) {
			const customEditorService = accessor.get(ICustomEditorService);
			await accessor.get(IExtensionService).activateByEvent(`onCustomEditor:${defaultEditor}`);
			// Only custom editors that an extension provides render in a webview here; other editors, such as notebooks, show
			// the resource as text. A custom editor shows the resource as it is; only text editors show changes, as a diff.
			if (customEditorService.getCustomEditorCapabilities(defaultEditor)) {
				return instantiationService.createInstance(ChatResourceWebviewContent, target, defaultEditor, body, getClippingContainer).ready();
			}
		}
		if (target.originalResource) {
			return instantiationService.createInstance(ChatResourceDiffContent, target.originalResource, target.resource, body).ready();
		}
		return instantiationService.createInstance(ChatResourceTextContent, target.resource, body).ready();
	});
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
	// Diffs stay readonly; text content becomes editable once its document turns out to be writable.
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

/**
 * A text resource in a code editor. It edits the document an editor of the resource edits, so both share their changes,
 * undo history and unsaved state; Ctrl+S saves it, since the workbench's save command only saves the active editor.
 */
class ChatResourceTextContent extends Disposable implements IChatResourceContent {
	private readonly _contentHeight = observableValue<number | undefined>(this, undefined);
	readonly contentHeight: IObservable<number | undefined> = this._contentHeight;
	readonly isDirty: IObservable<boolean>;
	private readonly _editor: CodeEditorWidget;

	constructor(
		private readonly _resource: URI,
		body: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ITextFileService private readonly _textFileService: ITextFileService,
	) {
		super();
		const options: ICodeEditorWidgetOptions = { isSimpleWidget: false, contributions: editorContributions() };
		this._editor = this._register(instantiationService.createInstance(CodeEditorWidget, body, embeddedEditorOptions, options));
		this._register(this._editor.onDidContentSizeChange(() => this._contentHeight.set(this._editor.getContentHeight(), undefined)));
		this.isDirty = observableFromEvent(this, Event.filter(_textFileService.files.onDidChangeDirty, model => isEqual(model.resource, _resource)), () => _textFileService.isDirty(_resource));
		this._register(dom.addDisposableListener(body, dom.EventType.KEY_DOWN, (event: KeyboardEvent) => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyMod.CtrlCmd | KeyCode.KeyS)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				void this.save();
			}
		}, true));
	}

	async save(): Promise<void> {
		await this._textFileService.save(this._resource);
	}

	async ready(): Promise<this> {
		const reference = await this._textModelService.createModelReference(this._resource);
		if (this._store.isDisposed) {
			reference.dispose();
			return this;
		}
		this._register(reference);
		this._editor.updateOptions({ readOnly: !!reference.object.isReadonly() });
		this._editor.setModel(reference.object.textEditorModel);
		this._contentHeight.set(this._editor.getContentHeight(), undefined);
		return this;
	}

	layout(width: number, height: number): void {
		this._editor.layout({ width, height });
	}
}

/** The changes from an original to a modified text resource in a readonly, compact diff editor. */
class ChatResourceDiffContent extends Disposable implements IChatResourceContent {
	private readonly _contentHeight = observableValue<number | undefined>(this, undefined);
	readonly contentHeight: IObservable<number | undefined> = this._contentHeight;
	private readonly _editor: DiffEditorWidget;

	constructor(
		private readonly _original: URI,
		private readonly _modified: URI,
		body: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
	) {
		super();
		const options: ICodeEditorWidgetOptions = { isSimpleWidget: false, contributions: editorContributions() };
		this._editor = this._register(instantiationService.createInstance(DiffEditorWidget, body, {
			...embeddedEditorOptions,
			originalAriaLabel: localize('chatResources.original', "Original"),
			modifiedAriaLabel: localize('chatResources.modified', "Modified"),
			renderSideBySide: false,
			useInlineViewWhenSpaceIsLimited: true,
			experimental: { useTrueInlineView: true },
			renderOverviewRuler: false,
			renderMarginRevertIcon: false,
			renderGutterMenu: false,
			compactMode: true,
			hideUnchangedRegions: { enabled: true, contextLineCount: 1 },
			isInEmbeddedEditor: true,
		}, { originalEditor: options, modifiedEditor: options }));
		this._register(this._editor.onDidContentSizeChange(() => this._contentHeight.set(this._editor.getContentHeight(), undefined)));
	}

	async ready(): Promise<this> {
		const references: IReference<IResolvedTextEditorModel>[] = await Promise.all([
			this._textModelService.createModelReference(this._original),
			this._textModelService.createModelReference(this._modified),
		]);
		if (this._store.isDisposed) {
			references.forEach(reference => reference.dispose());
			return this;
		}
		references.forEach(reference => this._register(reference));
		this._editor.setModel({ original: references[0].object.textEditorModel, modified: references[1].object.textEditorModel });
		this._contentHeight.set(this._editor.getContentHeight(), undefined);
		return this;
	}

	layout(width: number, height: number): void {
		this._editor.layout({ width, height });
	}
}

/** A resource rendered by its custom editor in an overlay webview anchored to the view's body, editable as in an editor. */
class ChatResourceWebviewContent extends Disposable implements IChatResourceContent {
	private readonly _contentHeight = observableValue<number | undefined>(this, undefined);
	readonly contentHeight: IObservable<number | undefined> = this._contentHeight;
	private readonly _input = observableValue<CustomEditorInput | undefined>(this, undefined);
	readonly isDirty: IObservable<boolean> = derived(this, reader => {
		const input = this._input.read(reader);
		return !!input && observableFromEvent(input.onDidChangeDirty, () => input.isDirty()).read(reader);
	});

	constructor(
		private readonly _target: IChatResourceTarget,
		private readonly _viewType: string,
		private readonly _body: HTMLElement,
		private readonly _getClippingContainer: () => HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		super();
	}

	async save(): Promise<void> {
		await this._input.get()?.save(this._editorGroupsService.activeGroup.id);
	}

	async ready(): Promise<this> {
		const input = CustomEditorInput.create(this._instantiationService, {
			resource: this._target.resource,
			viewType: this._viewType,
			webviewTitle: this._target.label,
			preferredName: this._target.label,
			iconPath: undefined,
		}, undefined);
		this._register(input);
		if (!(input instanceof CustomEditorInput)) {
			return this;
		}
		await input.resolve();
		if (!this._store.isDisposed) {
			this._attach(input);
		}
		return this;
	}

	private _attach(input: CustomEditorInput): void {
		this._input.set(input, undefined);
		const webview = input.webview;
		const targetWindow = dom.getWindow(this._body);
		// Webviews report the height of their document, which is the content height.
		this._register(autorun(reader => {
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
		this._register(toDisposable(() => {
			observer.disconnect();
			release();
		}));
	}

	layout(): void {
		// The overlay follows its anchor element.
	}
}
