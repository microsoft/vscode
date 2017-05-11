/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IModel } from 'vs/editor/common/editorCommon';
import { Dimension, Builder } from 'vs/base/browser/builder';
import { empty as EmptyDisposable, IDisposable, dispose, IReference } from 'vs/base/common/lifecycle';
import { EditorOptions, EditorInput } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { Position } from 'vs/platform/editor/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { HtmlInput } from 'vs/workbench/parts/html/common/htmlInput';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITextModelResolverService, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { Parts, IPartService } from 'vs/workbench/services/part/common/partService';

import Webview from './webview';
import { Scope } from "vs/workbench/common/memento";
import { IStorageService } from "vs/platform/storage/common/storage";

const HTML_PREVIEW_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'htmlPreviewEditorViewState';

interface HtmlPreviewEditorViewState {
	scrollYPercentage: number;
}

interface HtmlPreviewEditorViewStates {
	0?: HtmlPreviewEditorViewState;
	1?: HtmlPreviewEditorViewState;
	2?: HtmlPreviewEditorViewState;
}



/**
 * An implementation of editor for showing HTML content in an IFrame by leveraging the HTML input.
 */
export class HtmlPreviewPart extends BaseEditor {

	static ID: string = 'workbench.editor.htmlPreviewPart';

	private _textModelResolverService: ITextModelResolverService;
	private _openerService: IOpenerService;
	private _webview: Webview;
	private _webviewDisposables: IDisposable[];
	private _container: HTMLDivElement;

	private _baseUrl: URI;

	private _modelRef: IReference<ITextEditorModel>;
	public get model(): IModel { return this._modelRef && this._modelRef.object.textEditorModel; }
	private _modelChangeSubscription = EmptyDisposable;
	private _themeChangeSubscription = EmptyDisposable;

	private scrollYPercentage: number;


	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@ITextModelResolverService textModelResolverService: ITextModelResolverService,
		@IThemeService protected themeService: IThemeService,
		@IOpenerService openerService: IOpenerService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IPartService private partService: IPartService,
		@IStorageService private storageService: IStorageService
	) {
		super(HtmlPreviewPart.ID, telemetryService, themeService);

		this._textModelResolverService = textModelResolverService;
		this._openerService = openerService;
		this._baseUrl = contextService.toResource('/');
	}

	dispose(): void {
		// remove from dom
		this._webviewDisposables = dispose(this._webviewDisposables);

		// unhook listeners
		this._themeChangeSubscription.dispose();
		this._modelChangeSubscription.dispose();

		// dipose model ref
		dispose(this._modelRef);
		super.dispose();
	}

	protected createEditor(parent: Builder): void {
		this._container = document.createElement('div');
		this._container.style.position = 'absolute';
		parent.getHTMLElement().appendChild(this._container);
	}

	private get webview(): Webview {
		if (!this._webview) {
			this._webview = new Webview(this._container, this.partService.getContainer(Parts.EDITOR_PART));
			this._webview.baseUrl = this._baseUrl && this._baseUrl.toString(true);
			if (this.input && this.input instanceof HtmlInput) {
				this.loadTextEditorViewState(this.input.getResource());
				this.webview.initialScrollProgress = this.scrollYPercentage;
			}

			this._webviewDisposables = [
				this._webview,
				this._webview.onDidClickLink(uri => this._openerService.open(uri)),
				this._webview.onDidLoadContent(data => this.telemetryService.publicLog('previewHtml', data.stats)),
				this._webview.onDidScroll(data => {
					this.scrollYPercentage = data.scrollYPercentage;
				})
			];
		}
		return this._webview;
	}

	public changePosition(position: Position): void {
		// what this actually means is that we got reparented. that
		// has caused the webview to stop working and we need to reset it
		this._doSetVisible(false);
		this._doSetVisible(true);

		super.changePosition(position);
	}

	protected setEditorVisible(visible: boolean, position?: Position): void {
		this._doSetVisible(visible);
		super.setEditorVisible(visible, position);
	}

	private _doSetVisible(visible: boolean): void {
		if (!visible) {
			this._themeChangeSubscription.dispose();
			this._modelChangeSubscription.dispose();
			this._webviewDisposables = dispose(this._webviewDisposables);
			this._webview = undefined;
		} else {
			this._themeChangeSubscription = this.themeService.onThemeChange(themeId => this.webview.style(themeId));
			this.webview.style(this.themeService.getTheme());

			if (this._hasValidModel()) {
				this._modelChangeSubscription = this.model.onDidChangeContent(() => this.webview.contents = this.model.getLinesContent());
				this.webview.contents = this.model.getLinesContent();
			}
		}
	}

	private _hasValidModel(): boolean {
		return this._modelRef && this.model && !this.model.isDisposed();
	}

	public layout(dimension: Dimension): void {
		const { width, height } = dimension;
		this._container.style.width = `${width}px`;
		this._container.style.height = `${height}px`;
		if (this._webview) {
			this._webview.layout();
		}
	}

	public focus(): void {
		this.webview.focus();
	}

	public clearInput(): void {
		if (this.input instanceof HtmlInput) {
			this.saveTextEditorViewState(this.input.getResource());
		}

		dispose(this._modelRef);
		this._modelRef = undefined;
		super.clearInput();
	}

	public shutdown(): void {
		if (this.input instanceof HtmlInput) {
			this.saveTextEditorViewState(this.input.getResource());
		}
		super.shutdown();
	}

	public sendMessage(data: any): void {
		this.webview.sendMessage(data);
	}

	public setInput(input: EditorInput, options?: EditorOptions): TPromise<void> {

		if (this.input && this.input.matches(input) && this._hasValidModel()) {
			return TPromise.as(undefined);
		}

		if (this.input instanceof HtmlInput) {
			this.saveTextEditorViewState(this.input.getResource());
		}

		if (this._modelRef) {
			this._modelRef.dispose();
		}
		this._modelChangeSubscription.dispose();

		if (!(input instanceof HtmlInput)) {
			return TPromise.wrapError<void>('Invalid input');
		}


		return super.setInput(input, options).then(() => {
			const resourceUri = input.getResource();
			return this._textModelResolverService.createModelReference(resourceUri).then(ref => {
				const model = ref.object;

				if (model instanceof BaseTextEditorModel) {
					this._modelRef = ref;
				}

				if (!this.model) {
					return TPromise.wrapError<void>(localize('html.voidInput', "Invalid editor input."));
				}

				this._modelChangeSubscription = this.model.onDidChangeContent(() => {
					if (this.model) {
						this.webview.contents = this.model.getLinesContent();
					}
				});
				this.loadTextEditorViewState(resourceUri);
				this.webview.baseUrl = resourceUri.toString(true);
				this.webview.contents = this.model.getLinesContent();
				this.webview.initialScrollProgress = this.scrollYPercentage;
				return undefined;
			});
		});
	}

	private saveTextEditorViewState(resource: URI): void {
		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		let editorViewStateMemento = memento[HTML_PREVIEW_EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (!editorViewStateMemento) {
			editorViewStateMemento = Object.create(null);
			memento[HTML_PREVIEW_EDITOR_VIEW_STATE_PREFERENCE_KEY] = editorViewStateMemento;
		}

		const scrollYPercentage = this.scrollYPercentage;
		const editorViewState: HtmlPreviewEditorViewState = {
			scrollYPercentage: scrollYPercentage
		};

		let fileViewState: HtmlPreviewEditorViewStates = editorViewStateMemento[resource.toString()];
		if (!fileViewState) {
			fileViewState = Object.create(null);
			editorViewStateMemento[resource.toString()] = fileViewState;
		}

		if (typeof this.position === 'number') {
			fileViewState[this.position] = editorViewState;
		}
	}

	private loadTextEditorViewState(resource: URI) {
		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		const editorViewStateMemento = memento[HTML_PREVIEW_EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (editorViewStateMemento) {
			const fileViewState: HtmlPreviewEditorViewStates = editorViewStateMemento[resource.toString()];
			if (fileViewState) {
				const state: HtmlPreviewEditorViewState = fileViewState[this.position];
				if (state) {
					this.webview.initialScrollProgress = state.scrollYPercentage;
				}
			}
		}
	}
}
