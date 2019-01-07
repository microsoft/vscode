/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeEditor, isCodeEditor, isDiffEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import * as modes from 'vs/editor/common/modes';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { keys } from 'vs/base/common/map';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ExtHostCommentsShape, ExtHostContext, IExtHostContext, MainContext, MainThreadCommentsShape, CommentProviderFeatures } from '../node/extHost.protocol';

import { ICommentService } from 'vs/workbench/parts/comments/electron-browser/commentService';
import { COMMENTS_PANEL_ID } from 'vs/workbench/parts/comments/electron-browser/commentsPanel';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { URI } from 'vs/base/common/uri';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { generateUuid } from 'vs/base/common/uuid';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommentsConfiguration } from 'vs/workbench/parts/comments/electron-browser/comments.contribution';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export class MainThreadDocumentCommentProvider implements modes.DocumentCommentProvider {
	private _proxy: ExtHostCommentsShape;
	private _handle: number;
	private _features: CommentProviderFeatures;
	get startDraftLabel(): string { return this._features.startDraftLabel; }
	get deleteDraftLabel(): string { return this._features.deleteDraftLabel; }
	get finishDraftLabel(): string { return this._features.finishDraftLabel; }

	constructor(proxy: ExtHostCommentsShape, handle: number, features: CommentProviderFeatures) {
		this._proxy = proxy;
		this._handle = handle;
		this._features = features;
	}

	async provideDocumentComments(uri, token) {
		return this._proxy.$provideDocumentComments(this._handle, uri);
	}

	async createNewCommentThread(uri, range, text, token) {
		return this._proxy.$createNewCommentThread(this._handle, uri, range, text);
	}

	async replyToCommentThread(uri, range, thread, text, token) {
		return this._proxy.$replyToCommentThread(this._handle, uri, range, thread, text);
	}

	async editComment(uri, comment, text, token) {
		return this._proxy.$editComment(this._handle, uri, comment, text);
	}

	async deleteComment(uri, comment, token) {
		return this._proxy.$deleteComment(this._handle, uri, comment);
	}

	async startDraft(uri, token): Promise<void> {
		return this._proxy.$startDraft(this._handle, uri);
	}
	async deleteDraft(uri, token): Promise<void> {
		return this._proxy.$deleteDraft(this._handle, uri);
	}
	async finishDraft(uri, token): Promise<void> {
		return this._proxy.$finishDraft(this._handle, uri);
	}

	onDidChangeCommentThreads = null;
}

@extHostNamedCustomer(MainContext.MainThreadComments)
export class MainThreadComments extends Disposable implements MainThreadCommentsShape {
	private _disposables: IDisposable[];
	private _proxy: ExtHostCommentsShape;
	private _documentProviders = new Map<number, IDisposable>();
	private _workspaceProviders = new Map<number, IDisposable>();
	private _handlers = new Map<number, string>();
	private _openPanelListener: IDisposable | null;

	constructor(
		extHostContext: IExtHostContext,
		@IEditorService private readonly _editorService: IEditorService,
		@ICommentService private readonly _commentService: ICommentService,
		@IPanelService private readonly _panelService: IPanelService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
		this._disposables = [];
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostComments);
	}

	$registerDocumentCommentProvider(handle: number, features: CommentProviderFeatures): void {
		this._documentProviders.set(handle, undefined);
		const handler = new MainThreadDocumentCommentProvider(this._proxy, handle, features);

		const providerId = generateUuid();
		this._handlers.set(handle, providerId);

		this._commentService.registerDataProvider(providerId, handler);
	}

	/**
	 * If the comments panel has never been opened, the constructor for it has not yet run so it has
	 * no listeners for comment threads being set or updated. Listen for the panel opening for the
	 * first time and send it comments then.
	 */
	private registerOpenPanelListener(commentsPanelAlreadyConstructed: boolean) {
		if (!commentsPanelAlreadyConstructed && !this._openPanelListener) {
			this._openPanelListener = this._panelService.onDidPanelOpen(e => {
				if (e.panel.getId() === COMMENTS_PANEL_ID) {
					keys(this._workspaceProviders).forEach(handle => {
						this._proxy.$provideWorkspaceComments(handle).then(commentThreads => {
							if (commentThreads) {
								const providerId = this._handlers.get(handle);
								this._commentService.setWorkspaceComments(providerId, commentThreads);
							}

						});
					});

					this._openPanelListener.dispose();
					this._openPanelListener = null;
				}
			});
		}
	}

	$registerWorkspaceCommentProvider(handle: number, extensionId: ExtensionIdentifier): void {
		this._workspaceProviders.set(handle, undefined);

		const providerId = generateUuid();
		this._handlers.set(handle, providerId);

		const commentsPanelAlreadyConstructed = this._panelService.getPanels().some(panel => panel.id === COMMENTS_PANEL_ID);
		this._panelService.setPanelEnablement(COMMENTS_PANEL_ID, true);

		const openPanel = this._configurationService.getValue<ICommentsConfiguration>('comments').openPanel;


		if (openPanel === 'neverOpen') {
			this.registerOpenPanelListener(commentsPanelAlreadyConstructed);
		}

		if (openPanel === 'openOnSessionStart') {
			this._panelService.openPanel(COMMENTS_PANEL_ID);
		}

		this._proxy.$provideWorkspaceComments(handle).then(commentThreads => {
			if (commentThreads) {
				if (openPanel === 'openOnSessionStartWithComments' && commentThreads.length) {
					if (commentThreads.length) {
						this._panelService.openPanel(COMMENTS_PANEL_ID);
					} else {
						this.registerOpenPanelListener(commentsPanelAlreadyConstructed);
					}
				}

				this._commentService.setWorkspaceComments(providerId, commentThreads);
			}
		});

		/* __GDPR__
			"comments:registerWorkspaceCommentProvider" : {
				"extensionId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this._telemetryService.publicLog('comments:registerWorkspaceCommentProvider', {
			extensionId: extensionId.value
		});
	}

	$unregisterDocumentCommentProvider(handle: number): void {
		this._documentProviders.delete(handle);
		const handlerId = this._handlers.get(handle);
		this._commentService.unregisterDataProvider(handlerId);
		this._handlers.delete(handle);
	}

	$unregisterWorkspaceCommentProvider(handle: number): void {
		this._workspaceProviders.delete(handle);
		if (this._workspaceProviders.size === 0) {
			this._panelService.setPanelEnablement(COMMENTS_PANEL_ID, false);

			if (this._openPanelListener) {
				this._openPanelListener.dispose();
				this._openPanelListener = null;
			}
		}

		const handlerId = this._handlers.get(handle);
		this._commentService.removeWorkspaceComments(handlerId);
		this._handlers.delete(handle);
	}

	$onDidCommentThreadsChange(handle: number, event: modes.CommentThreadChangedEvent) {
		// notify comment service
		const providerId = this._handlers.get(handle);
		this._commentService.updateComments(providerId, event);
	}

	getVisibleEditors(): ICodeEditor[] {
		let ret: ICodeEditor[] = [];

		this._editorService.visibleControls.forEach(control => {
			if (isCodeEditor(control.getControl())) {
				ret.push(control.getControl() as ICodeEditor);
			}

			if (isDiffEditor(control.getControl())) {
				let diffEditor = control.getControl() as IDiffEditor;
				ret.push(diffEditor.getOriginalEditor(), diffEditor.getModifiedEditor());
			}
		});

		return ret;
	}

	async provideWorkspaceComments(): Promise<modes.CommentThread[]> {
		const result: modes.CommentThread[] = [];
		for (const handle of keys(this._workspaceProviders)) {
			result.push(...await this._proxy.$provideWorkspaceComments(handle));
		}
		return result;
	}

	async provideDocumentComments(resource: URI): Promise<modes.CommentInfo[]> {
		const result: modes.CommentInfo[] = [];
		for (const handle of keys(this._documentProviders)) {
			result.push(await this._proxy.$provideDocumentComments(handle, resource));
		}
		return result;
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
		this._workspaceProviders.forEach(value => dispose(value));
		this._workspaceProviders.clear();
		this._documentProviders.forEach(value => dispose(value));
		this._documentProviders.clear();
	}
}
