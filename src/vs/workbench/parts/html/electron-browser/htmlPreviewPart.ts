/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ITextModel } from 'vs/editor/common/model';
import { Disposable, IDisposable, dispose, IReference } from 'vs/base/common/lifecycle';
import { EditorOptions, EditorInput, IEditorMemento } from 'vs/workbench/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { HtmlInput, HtmlInputOptions, areHtmlInputOptionsEqual } from 'vs/workbench/parts/html/common/htmlInput';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITextModelService, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { Parts, IPartService } from 'vs/workbench/services/part/common/partService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Dimension } from 'vs/base/browser/dom';
import { BaseWebviewEditor } from 'vs/workbench/parts/webview/electron-browser/baseWebviewEditor';
import { WebviewElement, WebviewOptions } from 'vs/workbench/parts/webview/electron-browser/webviewElement';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorGroupsService, IEditorGroup } from 'vs/workbench/services/group/common/editorGroupsService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event, Emitter } from 'vs/base/common/event';

export interface HtmlPreviewEditorViewState {
	scrollYPercentage: number;
}

/**
 * An implementation of editor for showing HTML content in an IFrame by leveraging the HTML input.
 */
export class HtmlPreviewPart extends BaseWebviewEditor {

	static readonly ID: string = 'workbench.editor.htmlPreviewPart';
	static class: string = 'htmlPreviewPart';

	private _webviewDisposables: IDisposable[];

	private _modelRef: IReference<ITextEditorModel>;
	public get model(): ITextModel { return this._modelRef && this._modelRef.object.textEditorModel; }
	private _modelChangeSubscription = Disposable.None;
	private _themeChangeSubscription = Disposable.None;

	private _content: HTMLElement;
	private _scrollYPercentage: number = 0;

	private editorMemento: IEditorMemento<HtmlPreviewEditorViewState>;

	private readonly _onDidFocusWebview = this._register(new Emitter<void>());
	public get onDidFocus(): Event<any> { return this._onDidFocusWebview.event; }

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IPartService private readonly _partService: IPartService,
		@IStorageService readonly _storageService: IStorageService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEditorGroupsService readonly editorGroupService: IEditorGroupsService
	) {
		super(HtmlPreviewPart.ID, telemetryService, themeService, contextKeyService, _storageService);

		this.editorMemento = this.getEditorMemento<HtmlPreviewEditorViewState>(editorGroupService, this.viewStateStorageKey);
	}

	dispose(): void {
		// remove from dom
		this._webviewDisposables = dispose(this._webviewDisposables);

		// unhook listeners
		this._themeChangeSubscription.dispose();
		this._modelChangeSubscription.dispose();

		// dispose model ref
		dispose(this._modelRef);
		super.dispose();
	}

	protected createEditor(parent: HTMLElement): void {
		this._content = document.createElement('div');
		this._content.style.position = 'absolute';
		this._content.classList.add(HtmlPreviewPart.class);
		parent.appendChild(this._content);
	}

	private get webview(): WebviewElement {
		if (!this._webview) {
			let webviewOptions: WebviewOptions = {};
			if (this.input && this.input instanceof HtmlInput) {
				webviewOptions = this.input.options;
			}

			this._webview = this._instantiationService.createInstance(WebviewElement,
				this._partService.getContainer(Parts.EDITOR_PART),
				{
					...webviewOptions,
					useSameOriginForRoot: true
				});
			this._webview.mountTo(this._content);

			if (this.input && this.input instanceof HtmlInput) {
				const state = this.loadHTMLPreviewViewState(this.input);
				this._scrollYPercentage = state ? state.scrollYPercentage : 0;
				this.webview.initialScrollProgress = this._scrollYPercentage;

				const resourceUri = this.input.getResource();
				this.webview.baseUrl = resourceUri.toString(true);
			}
			this._webviewDisposables = [
				this._webview,
				this._webview.onDidClickLink(uri => this._openerService.open(uri)),
				this._webview.onDidScroll(data => {
					this._scrollYPercentage = data.scrollYPercentage;
				}),
			];

			this._register(this._webview.onDidFocus(() => this._onDidFocusWebview.fire()));
		}
		return this._webview;
	}

	protected setEditorVisible(visible: boolean, group: IEditorGroup): void {
		this._doSetVisible(visible);
		super.setEditorVisible(visible, group);
	}

	private _doSetVisible(visible: boolean): void {
		if (!visible) {
			this._themeChangeSubscription.dispose();
			this._modelChangeSubscription.dispose();
			this._webviewDisposables = dispose(this._webviewDisposables);
			this._webview = undefined;
		} else {
			this._themeChangeSubscription = this.themeService.onThemeChange(this.onThemeChange.bind(this));

			if (this._hasValidModel()) {
				this._modelChangeSubscription = this.model.onDidChangeContent(() => this.webview.contents = this.model.getLinesContent().join('\n'));
				this.webview.contents = this.model.getLinesContent().join('\n');
			}
		}
	}

	private _hasValidModel(): boolean {
		return this._modelRef && this.model && !this.model.isDisposed();
	}

	public layout(dimension: Dimension): void {
		const { width, height } = dimension;
		this._content.style.width = `${width}px`;
		this._content.style.height = `${height}px`;

		super.layout(dimension);
	}

	public clearInput(): void {
		if (this.input instanceof HtmlInput) {
			this.saveHTMLPreviewViewState(this.input, {
				scrollYPercentage: this._scrollYPercentage
			});
		}
		dispose(this._modelRef);
		this._modelRef = undefined;
		super.clearInput();
	}

	protected saveState(): void {
		if (this.input instanceof HtmlInput) {
			this.saveHTMLPreviewViewState(this.input, {
				scrollYPercentage: this._scrollYPercentage
			});
		}

		super.saveState();
	}

	public sendMessage(data: any): void {
		this.webview.sendMessage(data);
	}

	public setInput(input: EditorInput, options: EditorOptions, token: CancellationToken): Promise<void> {

		if (this.input && this.input.matches(input) && this._hasValidModel() && this.input instanceof HtmlInput && input instanceof HtmlInput && areHtmlInputOptionsEqual(this.input.options, input.options)) {
			return Promise.resolve(undefined);
		}

		let oldOptions: HtmlInputOptions | undefined = undefined;

		if (this.input instanceof HtmlInput) {
			oldOptions = this.input.options;
			this.saveHTMLPreviewViewState(this.input, {
				scrollYPercentage: this._scrollYPercentage
			});
		}

		if (this._modelRef) {
			this._modelRef.dispose();
		}
		this._modelChangeSubscription.dispose();

		if (!(input instanceof HtmlInput)) {
			return Promise.reject(new Error('Invalid input'));
		}

		return super.setInput(input, options, token).then(() => {
			const resourceUri = input.getResource();
			return this._textModelResolverService.createModelReference(resourceUri).then(ref => {
				if (token.isCancellationRequested) {
					return undefined;
				}

				const model = ref.object;
				if (model instanceof BaseTextEditorModel) {
					this._modelRef = ref;
				}

				if (!this.model) {
					return Promise.reject(new Error(localize('html.voidInput', "Invalid editor input.")));
				}

				if (oldOptions && !areHtmlInputOptionsEqual(oldOptions, input.options)) {
					this._doSetVisible(false);
				}

				this._modelChangeSubscription = this.model.onDidChangeContent(() => {
					if (this.model) {
						this._scrollYPercentage = 0;
						this.webview.contents = this.model.getLinesContent().join('\n');
					}
				});
				const state = this.loadHTMLPreviewViewState(input);
				this._scrollYPercentage = state ? state.scrollYPercentage : 0;
				this.webview.baseUrl = resourceUri.toString(true);
				this.webview.options = input.options;
				this.webview.contents = this.model.getLinesContent().join('\n');
				this.webview.initialScrollProgress = this._scrollYPercentage;
				return undefined;
			});
		});
	}


	private get viewStateStorageKey(): string {
		return this.getId() + '.editorViewState';
	}

	private saveHTMLPreviewViewState(input: HtmlInput, editorViewState: HtmlPreviewEditorViewState): void {
		this.editorMemento.saveEditorState(this.group, input, editorViewState);
	}

	private loadHTMLPreviewViewState(input: HtmlInput): HtmlPreviewEditorViewState {
		return this.editorMemento.loadEditorState(this.group, input);
	}
}
