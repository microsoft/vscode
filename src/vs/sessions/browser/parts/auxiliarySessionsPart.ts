/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, isHTMLElement } from '../../../base/browser/dom.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun } from '../../../base/common/observable.js';
import { localize } from '../../../nls.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { hasCustomTitlebar } from '../../../platform/window/common/window.js';
import { IsAuxiliaryWindowContext } from '../../../workbench/common/contextkeys.js';
import { IAuxiliaryWindow, IAuxiliaryWindowOpenOptions, IAuxiliaryWindowService } from '../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { ILifecycleService } from '../../../workbench/services/lifecycle/common/lifecycle.js';
import { CustomViewVisibleContext, IsNewChatSessionContext, IsPhoneLayoutContext, SessionsAuxiliaryWindowContext } from '../../common/contextkeys.js';
import { ISessionContext, SessionContext } from '../../services/sessions/browser/sessionContext.js';
import { ISessionPartCloseEvent } from '../../services/sessions/browser/sessionsPartService.js';
import { AGENTS_PART_CARD_CLASS } from './agentsPartCard.js';
import { SessionsPart } from './sessionsPart.js';
import { ISessionsTitleService } from './titlebarPart.js';

/** Owns one auxiliary document's chrome, scoped services and Sessions rendering lifetime. */
export class AuxiliarySessionsPart extends Disposable {
	private _part: SessionsPart | undefined;
	get part(): SessionsPart | undefined { return this._part; }
	private _window: IAuxiliaryWindow | undefined;
	get window(): IAuxiliaryWindow | undefined { return this._window; }
	private readonly _onDidFocusSession = this._register(new Emitter<string | undefined>());
	readonly onDidFocusSession = this._onDidFocusSession.event;
	private readonly _onDidInteractWithGrid = this._register(new Emitter<void>());
	readonly onDidInteractWithGrid = this._onDidInteractWithGrid.event;
	private readonly _onDidClose = this._register(new Emitter<ISessionPartCloseEvent>());
	readonly onDidClose = this._onDidClose.event;

	constructor(
		readonly partId: string,
		private readonly onWillClose: () => void,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@ISessionsTitleService private readonly titleService: ISessionsTitleService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
	}

	async create(options?: IAuxiliaryWindowOpenOptions): Promise<SessionsPart> {
		const window = await this.auxiliaryWindowService.open({
			...options,
			containerClasses: {
				add: ['sessions-auxiliary-window', 'nosidebar', 'noauxiliarybar', 'nopanel', 'noeditorpane', 'nocustomviewgrid'],
				remove: ['phone-layout', 'nosessionspart', 'fullscreen', 'maximized', 'dock-detail-panel', 'modal-dialog-visible'],
			},
		});
		if (this._store.isDisposed || window.window.closed) {
			window.window.close();
			window.dispose();
			throw new CancellationError();
		}
		this._window = this._register(window);
		this._register(toDisposable(() => {
			if (!window.window.closed) {
				window.window.close();
			}
		}));
		const scopedContext = this._register(this.contextKeyService.createScoped(window.container));
		SessionsAuxiliaryWindowContext.bindTo(scopedContext).set(true);
		IsAuxiliaryWindowContext.bindTo(scopedContext).set(true);
		IsPhoneLayoutContext.bindTo(scopedContext).set(false);
		IsNewChatSessionContext.bindTo(scopedContext).set(false);
		CustomViewVisibleContext.bindTo(scopedContext).set(false);
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContext])));
		const container = $('.part.sessionspart.basepanel.right', { role: 'main' });
		container.classList.add(AGENTS_PART_CARD_CLASS);
		container.style.position = 'relative';
		window.container.appendChild(container);
		const part = this._part = this._register(scopedInstantiationService.createInstance(SessionsPart, this.partId));
		part.create(container);
		this._register(autorun(reader => {
			window.window.document.title = part.activeSession.read(reader)?.title.read(reader) ?? localize('sessionsWindowTitle', "Sessions");
		}));
		this._register(part.onDidFocusSession(id => this._onDidFocusSession.fire(id)));
		this._register(part.onDidInteractWithGrid(() => this._onDidInteractWithGrid.fire()));
		const titlebarInstantiationService = this._register(scopedInstantiationService.createChild(new ServiceCollection([ISessionContext, new SessionContext(part.activeSession)])));
		const titlebar = hasCustomTitlebar(this.configurationService)
			? this._register(this.titleService.createAuxiliarySessionsTitlebarPart(window.container, titlebarInstantiationService))
			: undefined;
		const activateChrome = (event: PointerEvent | FocusEvent) => {
			const session = part.activeSession.get();
			if (session && isHTMLElement(event.target) && !event.target.closest('.session-view')) {
				this._onDidFocusSession.fire(session.sessionId);
			}
		};
		this._register(addDisposableListener(window.container, 'pointerdown', activateChrome, true));
		this._register(addDisposableListener(window.container, 'focusin', activateChrome, true));
		if (titlebar) {
			this._register(titlebar.onDidChange(() => window.layout()));
		}
		this._register(window.onWillLayout(dimension => {
			const titleHeight = titlebar?.height ?? 0;
			titlebar?.layout(dimension.width, titleHeight, 0, 0);
			part.layout(dimension.width, dimension.height - titleHeight, titleHeight, 0);
		}));
		this._register(window.onBeforeUnload(event => {
			if (!this.lifecycleService.willShutdown) {
				const veto = part.getTransferVeto();
				if (veto) {
					event.veto(veto);
				}
			}
		}));
		this._register(Event.once(window.onUnload)(() => {
			if (!this._store.isDisposed) {
				if (!this.lifecycleService.willShutdown) {
					this.onWillClose();
				}
				this._onDidClose.fire({ partId: this.partId, shutdown: this.lifecycleService.willShutdown });
			}
		}));
		await window.whenStylesHaveLoaded;
		if (window.window.closed || this._store.isDisposed) {
			throw new CancellationError();
		}
		window.layout();
		return part;
	}

	close(): void {
		this._window?.window.close();
	}
}
