/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IChatSessionCustomHeaderData, IChatSessionCustomHeaderRenderer, IChatSessionCustomViewService, IsCustomSessionViewContext } from '../common/chatSessionCustomViewService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { AgentSessionCustomViewId, AgentSessionCustomViewPane } from './widgetHosts/viewPane/agentSessionCustomViewPane.js';

export class ChatSessionCustomViewServiceImpl extends Disposable implements IChatSessionCustomViewService {

	declare readonly _serviceBrand: undefined;

	private readonly _renderers = new Map<string, IChatSessionCustomHeaderRenderer>();
	private readonly _headerData = new Map<string, IChatSessionCustomHeaderData>();

	private readonly _onDidChangeRenderers = this._register(new Emitter<void>());
	readonly onDidChangeRenderers: Event<void> = this._onDidChangeRenderers.event;

	private readonly _onDidChangeHeaderData = this._register(new Emitter<URI>());
	readonly onDidChangeHeaderData: Event<URI> = this._onDidChangeHeaderData.event;

	private readonly _isCustomSessionViewContext: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewsService private readonly _viewsService: IViewsService,
	) {
		super();
		this._isCustomSessionViewContext = IsCustomSessionViewContext.bindTo(contextKeyService);
	}

	registerHeaderRenderer(sessionType: string, renderer: IChatSessionCustomHeaderRenderer): IDisposable {
		if (this._renderers.has(sessionType)) {
			throw new Error(`A header renderer is already registered for session type '${sessionType}'`);
		}
		this._renderers.set(sessionType, renderer);
		this._onDidChangeRenderers.fire();
		return toDisposable(() => {
			if (this._renderers.get(sessionType) === renderer) {
				this._renderers.delete(sessionType);
				this._onDidChangeRenderers.fire();
			}
		});
	}

	getHeaderRenderer(sessionType: string): IChatSessionCustomHeaderRenderer | undefined {
		return this._renderers.get(sessionType);
	}

	setHeaderData(sessionResource: URI, data: IChatSessionCustomHeaderData): void {
		this._headerData.set(sessionResource.toString(), data);
		this._onDidChangeHeaderData.fire(sessionResource);
	}

	getHeaderData(sessionResource: URI): IChatSessionCustomHeaderData | undefined {
		return this._headerData.get(sessionResource.toString());
	}

	async openInCustomView(sessionResource: URI): Promise<void> {
		this._isCustomSessionViewContext.set(true);
		const view = await this._viewsService.openView<AgentSessionCustomViewPane>(AgentSessionCustomViewId, true);
		if (view) {
			await view.loadSession(sessionResource);
		}
	}

	closeCustomView(): void {
		this._isCustomSessionViewContext.set(false);
	}
}
