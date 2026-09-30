/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ISessionCollection, ISessionCollectionsService, SessionCollectionsUndo } from '../../../../services/sessions/browser/sessionCollectionsService.js';
import { SessionPaletteColor } from '../../../../services/sessions/common/sessionColors.js';
import { ISessionCollectionsSwitcherDelegate, SessionCollectionAttention, SessionCollectionTitleButton, SessionCollectionsIconStrip, SessionCollectionsTabs } from '../../browser/sessionCollectionsSwitcher.js';

class FixtureCollectionsService extends Disposable implements ISessionCollectionsService {
	declare readonly _serviceBrand: undefined;

	private readonly collectionsValue = observableValue<readonly ISessionCollection[]>(this, [
		{ id: 'engineering', name: 'Engineering', icon: 'graph', color: SessionPaletteColor.Blue },
		{ id: 'personal', name: 'Personal', icon: 'heart', color: SessionPaletteColor.Pink },
		{ id: 'misc', name: 'Misc', icon: 'layers', color: SessionPaletteColor.Grey },
	]);
	readonly collections = this.collectionsValue;
	readonly defaultCollectionId = constObservable('engineering');
	private readonly activeCollectionValue = observableValue<string>(this, 'engineering');
	readonly activeCollectionId = this.activeCollectionValue;
	private readonly onDidChangeMembershipEmitter = this._register(new Emitter<void>());
	readonly onDidChangeMembership = this.onDidChangeMembershipEmitter.event;

	getCollection(collectionId: string): ISessionCollection | undefined {
		return this.collections.get().find(collection => collection.id === collectionId);
	}

	setActiveCollection(collectionId: string): void {
		this.activeCollectionValue.set(collectionId, undefined);
	}

	createCollection(): ISessionCollection {
		return this.collections.get()[0];
	}

	updateCollection(): void { }
	moveCollection(): void { }
	deleteCollection(): SessionCollectionsUndo | undefined { return undefined; }
	getSessionCollection(): string { return 'engineering'; }
	getGroupCollection(): string { return 'engineering'; }
	getWorkspaceCollection(): string { return 'engineering'; }
	moveSessionsToCollection(): SessionCollectionsUndo { return () => { }; }
	moveGroupToCollection(): SessionCollectionsUndo { return () => { }; }
	moveWorkspaceToCollection(): SessionCollectionsUndo { return () => { }; }
	getLastSession(): URI | undefined { return undefined; }
	setLastSession(): void { }
}

class FixtureDelegate implements ISessionCollectionsSwitcherDelegate {

	constructor(private readonly collectionsService: FixtureCollectionsService) { }

	switchToCollection(collectionId: string): void {
		this.collectionsService.setActiveCollection(collectionId);
	}

	showNewCollectionEditor(): void { }
	showEditCollectionEditor(): void { }
	showCollectionMenu(): void { }

	getCollectionAttention(collectionId: string): SessionCollectionAttention {
		if (collectionId === 'personal') {
			return SessionCollectionAttention.NeedsInput;
		}
		if (collectionId === 'misc') {
			return SessionCollectionAttention.Unread;
		}
		return SessionCollectionAttention.None;
	}

	getCollectionKeybindingLabel(index: number): string | undefined {
		return index < 9 ? `⌃${index + 1}` : undefined;
	}

	getCollectionKeybindingAriaLabel(index: number): string | undefined {
		return index < 9 ? `Control+${index + 1}` : undefined;
	}

	registerCollectionAnchor(): IDisposable {
		return toDisposable(() => { });
	}

	hasDraggedCollectionItems(): boolean {
		return false;
	}

	moveDraggedItemsToCollection(): boolean {
		return false;
	}
}

function addSection(container: HTMLElement, label: string): HTMLElement {
	const section = DOM.append(container, DOM.$('.session-collections-fixture-section'));
	section.style.display = 'flex';
	section.style.flexDirection = 'column';
	section.style.gap = '6px';
	section.style.marginBottom = '16px';
	DOM.append(section, DOM.$('.session-collections-fixture-label', undefined, label));
	const surface = DOM.append(section, DOM.$('.session-collections-fixture-surface'));
	surface.style.display = 'flex';
	surface.style.minWidth = '0';
	return surface;
}

function renderFixture({ container, disposableStore, theme }: ComponentFixtureContext): void {
	container.style.width = '440px';
	container.style.padding = '16px';
	container.style.background = 'var(--vscode-sideBar-background)';
	container.style.color = 'var(--vscode-foreground)';
	container.classList.add('session-collections-fixture');

	const collectionsService = disposableStore.add(new FixtureCollectionsService());
	const delegate = new FixtureDelegate(collectionsService);
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IContextKeyService, ContextKeyService);
			reg.defineInstance(ISessionCollectionsService, collectionsService);
		},
	});

	disposableStore.add(instantiationService.createInstance(SessionCollectionsIconStrip, addSection(container, 'Title bar strip'), delegate));
	disposableStore.add(instantiationService.createInstance(SessionCollectionsTabs, addSection(container, 'Tabs'), delegate));
	disposableStore.add(instantiationService.createInstance(SessionCollectionTitleButton, addSection(container, 'Header title'), { shouldShow: () => true }, delegate));
}

export default defineThemedFixtureGroup({ path: 'sessions/collections' }, {
	Switchers: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		render: renderFixture,
	}),
});
