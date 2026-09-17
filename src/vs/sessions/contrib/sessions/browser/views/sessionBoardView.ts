/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionBoardView.css';
import { $ } from '../../../../../base/browser/dom.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import type { SessionView } from '../../../../browser/parts/sessionView.js';
import { SessionsBoardFocusContext } from '../../../../common/contextkeys.js';
import { AbstractCustomView, ICustomViewViewport } from '../../../../services/customView/browser/customView.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionsBoardService, ISessionsBoardView } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { getSessionWorkViewLabel } from '../../../../services/sessions/common/sessionWorkQuery.js';
import { SessionWorkOverview } from './sessionWorkOverview.js';

export class SessionBoardView extends AbstractCustomView implements ISessionsBoardView {
	readonly title: IObservable<string>;
	override readonly maxWidth = Number.POSITIVE_INFINITY;
	private readonly renderStore = this._register(new MutableDisposable<DisposableStore>());
	private overview: SessionWorkOverview | undefined;
	private container: HTMLElement | undefined;
	private viewport: ICustomViewViewport | undefined;

	get sessions(): readonly ISession[] { return this.overview?.sessions ?? []; }

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISessionsBoardService boardService: ISessionsBoardService,
		@ISessionGroupsService groups: ISessionGroupsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
		const groupsChanged = observableSignalFromEvent(this, groups.onDidChange);
		this.title = derived(this, reader => {
			groupsChanged.read(reader);
			const options = boardService.options.read(reader);
			const label = getSessionWorkViewLabel(options.view ?? 'overview');
			const collection = options.collection ? groups.getGroup(options.collection) : undefined;
			return collection ? options.view === 'all' || options.view === 'overview'
				? collection.name : localize('sessionsBoard.collectionView', "{0}: {1}", collection.name, label) : label;
		});
		this._register(boardService.registerView(this));
	}

	render(container: HTMLElement): void {
		const store = new DisposableStore();
		this.renderStore.value = store;
		this.container = container;
		const element = $('.sessions-board-view');
		container.appendChild(element);
		store.add(toDisposable(() => { element.remove(); this.overview = undefined; }));
		const context = store.add(this.contextKeyService.createScoped(element));
		SessionsBoardFocusContext.bindTo(context).set(true);
		const instantiation = store.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, context])));
		this.overview = store.add(instantiation.createInstance(SessionWorkOverview));
		element.appendChild(this.overview.element);
	}

	layout(width: number, height: number): void {
		this.overview?.layout(width, height);
		if (this.viewport) { this.setViewport(this.viewport); }
	}
	override setViewport(viewport: ICustomViewViewport): void {
		this.viewport = viewport;
		if (this.overview && this.container) {
			const offset = this.overview.element.getBoundingClientRect().top - this.container.getBoundingClientRect().top;
			this.overview.setViewport({ top: viewport.top - offset, height: viewport.height, scrollBy: delta => viewport.scrollBy(delta) });
		}
	}
	override focus(): void { this.overview?.focus(); }
	focusSearch(): void { this.overview?.focusSearch(); }
	async startNewWork(): Promise<void> { await this.overview?.startNewWork(); }
	focusSession(sessionId: string | undefined): void { this.overview?.focusSession(sessionId); }
	getAccessibleContent(): string { return this.overview?.getAccessibleContent() ?? ''; }
	getAccessibilityHelp(): string { return this.overview?.getAccessibilityHelp() ?? ''; }
	getSessionView(_sessionId: string | undefined): SessionView | undefined { return undefined; }
	getFocusedSessionView(): SessionView | undefined { return undefined; }
	toggleMaximizeSession(sessionId: string | undefined): boolean | undefined { return this.overview?.toggleMaximizeSession(sessionId); }
	resizeCard(sessionId: string | undefined, widthChange: number, heightChange: number): void { this.overview?.resizeCard(sessionId, widthChange, heightChange); }
	resetLayout(): void { this.overview?.resetLayout(); }
}
