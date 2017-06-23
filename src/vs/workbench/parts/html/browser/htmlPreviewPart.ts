/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IModel } from 'vs/editor/common/editorCommon';
import { Dimension, Builder } from 'vs/base/browser/builder';
import { empty as EmptyDisposable, IDisposable, dispose, IReference } from 'vs/base/common/lifecycle';
import { EditorOptions, EditorInput } from 'vs/workbench/common/editor';
import { Position } from 'vs/platform/editor/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { HtmlInput } from 'vs/workbench/parts/html/common/htmlInput';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITextModelService, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { Parts, IPartService } from 'vs/workbench/services/part/common/partService';

import Webview from './webview';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { WebviewEditor } from 'vs/workbench/browser/parts/editor/webviewEditor';

/**
 * An implementation of editor for showing HTML content in an IFrame by leveraging the HTML input.
 */
export class HtmlPreviewPart extends WebviewEditor {

	static ID: string = 'workbench.editor.htmlPreviewPart';

	private _webview: Webview;
	private _webviewDisposables: IDisposable[];
	private _container: HTMLDivElement;

	private _modelRef: IReference<ITextEditorModel>;
	public get model(): IModel { return this._modelRef && this._modelRef.object.textEditorModel; }
	private _modelChangeSubscription = EmptyDisposable;
	private _themeChangeSubscription = EmptyDisposable;

	private scrollYPercentage: number = 0;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@ITextModelService private textModelResolverService: ITextModelService,
		@IThemeService themeService: IThemeService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IPartService private partService: IPartService,
		@IStorageService storageService: IStorageService
	) {
		super(HtmlPreviewPart.ID, telemetryService, themeService, storageService);
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
			this._webview = new Webview(this._container, this.partService.getContainer(Parts.EDITOR_PART), { enableJavascript: true });
			if (this.input && this.input instanceof HtmlInput) {
				const state = this.loadViewState(this.input.getResource());
				this.scrollYPercentage = state ? state.scrollYPercentage : 0;
				this.webview.initialScrollProgress = this.scrollYPercentage;

				const resourceUri = this.input.getResource();
				this.webview.baseUrl = resourceUri.toString(true);
			}

			this._webviewDisposables = [
				this._webview,
				this._webview.onDidClickLink(uri => this.openerService.open(uri)),
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
			this.saveViewState(this.input.getResource(), {
				scrollYPercentage: this.scrollYPercentage
			});
		}
		dispose(this._modelRef);
		this._modelRef = undefined;
		super.clearInput();
	}

	public shutdown(): void {
		if (this.input instanceof HtmlInput) {
			this.saveViewState(this.input.getResource(), {
				scrollYPercentage: this.scrollYPercentage
			});
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
			this.saveViewState(this.input.getResource(), {
				scrollYPercentage: this.scrollYPercentage
			});
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
			return this.textModelResolverService.createModelReference(resourceUri).then(ref => {
				const model = ref.object;

				if (model instanceof BaseTextEditorModel) {
					this._modelRef = ref;
				}

				if (!this.model) {
					return TPromise.wrapError<void>(localize('html.voidInput', "Invalid editor input."));
				}

				this._modelChangeSubscription = this.model.onDidChangeContent(() => {
					if (this.model) {
						this.scrollYPercentage = 0;
						this.webview.contents = this.model.getLinesContent();
					}
				});
				const state = this.loadViewState(resourceUri);
				this.scrollYPercentage = state ? state.scrollYPercentage : 0;
				this.webview.baseUrl = resourceUri.toString(true);
				this.webview.contents = this.model.getLinesContent();
				this.webview.initialScrollProgress = this.scrollYPercentage;
				return undefined;
			});
		});
	}
}
