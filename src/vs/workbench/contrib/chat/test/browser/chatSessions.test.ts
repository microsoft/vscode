/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { LocalChatSessionsProvider } from '../../browser/chatSessions.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatSessionItem } from '../../common/chatSessionsService.js';
import { IChatService } from '../../common/chatService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';

class MockChatWidgetService implements IChatWidgetService {
	readonly onDidAddWidget: Event<IChatWidget> = Event.None;
	readonly _serviceBrand: undefined;
	readonly lastFocusedWidget: IChatWidget | undefined = undefined;

	private widgets: IChatWidget[] = [];

	constructor(widgets: IChatWidget[] = []) {
		this.widgets = widgets;
	}

	getWidgetByInputUri(uri: URI): IChatWidget | undefined {
		return undefined;
	}

	getWidgetBySessionId(sessionId: string): IChatWidget | undefined {
		return undefined;
	}

	getWidgetsByLocations(location: ChatAgentLocation): ReadonlyArray<IChatWidget> {
		return this.widgets.filter(w => w.location === location);
	}

	getAllWidgets(): ReadonlyArray<IChatWidget> {
		return this.widgets;
	}
}

class MockChatService implements IChatService {
	readonly _serviceBrand: undefined;
	
	// Implement required methods as no-ops for testing
	onDidPerformUserAction = Event.None;
	onDidDisposeSession = Event.None;
	transferredSessionData = undefined;

	isEnabled(): boolean { return true; }
	hasSessions(): boolean { return false; }
	getOrRestoreSession(sessionId: string): Promise<any> { return Promise.resolve(undefined); }
	loadSessionFromContent(content: any): Promise<any> { return Promise.resolve(undefined); }
	startSession(location: ChatAgentLocation, token: CancellationToken): any { return undefined; }
	getSession(sessionId: string): any { return undefined; }
	getSessionId(sessionProviderId: string): string | undefined { return undefined; }
	clearSession(sessionId: string): Promise<void> { return Promise.resolve(); }
	addRequest(sessionId: string, request: any): Promise<any> { return Promise.resolve(undefined); }
	sendRequest(sessionId: string, message: string): Promise<any> { return Promise.resolve(undefined); }
	removeRequest(sessionId: string, requestId: string): Promise<void> { return Promise.resolve(); }
	cancelCurrentRequestForSession(sessionId: string): void { }
	clearAllHistoryEntries(): void { }
	getHistory(): any[] { return []; }
	removeHistoryEntry(sessionId: string): void { }
	onDidChangeHistoryEntries = Event.None;
	transferChatSession(transferredSessionData: any, toWorkspace: URI): void { }
	loadSessionForResource(resource: URI, location: ChatAgentLocation, token: CancellationToken): Promise<any> { return Promise.resolve(undefined); }
	isPersistedSessionEmpty(sessionId: string): boolean { return true; }
}

class MockEditorGroupsService implements IEditorGroupsService {
	readonly _serviceBrand: undefined;

	// Implement with empty groups for testing
	get groups() { return []; }
	get activeGroup() { return undefined as any; }
	get sideGroup() { return undefined as any; }

	// Implement required methods as no-ops
	onDidAddGroup = Event.None;
	onDidRemoveGroup = Event.None;
	onDidMoveGroup = Event.None;
	onDidActivateGroup = Event.None;
	onDidChangeGroupIndex = Event.None;
	onDidChangeGroupLocked = Event.None;
	onDidChangeActiveGroup = Event.None;

	getGroup(identifier: any): any { return undefined; }
	getGroups(order?: any): any[] { return []; }
	activateGroup(group: any): any { return undefined; }
	getSize(group: any): any { return undefined; }
	setSize(group: any, size: any): void { }
	arrangeGroups(arrangement: any, target?: any): void { }
	applyLayout(layout: any): void { }
	setGroupOrientation(orientation: any): void { }
	findGroup(scope: any, source?: any, wrap?: boolean): any { return undefined; }
	addGroup(location: any, direction: any, options?: any): any { return undefined; }
	removeGroup(group: any): void { }
	moveGroup(group: any, location: any, direction: any): any { return undefined; }
	mergeGroup(group: any, target: any, options?: any): any { return undefined; }
	mergeAllGroups(target?: any): any { return undefined; }
	copyGroup(group: any, location: any, direction: any): any { return undefined; }
	createEditorDropTarget(container: HTMLElement, delegate: any): any { return undefined; }
}

class MockChatSessionsService {
	readonly _serviceBrand: undefined;

	onDidChangeItemsProviders = Event.None;
	onDidChangeSessionItems = Event.None;
	onDidChangeAvailability = Event.None;

	getAllChatSessionItemProviders() { return []; }
	getAllChatSessionContributions() { return []; }
	registerChatSessionItemProvider(provider: any) { return Disposable.None; }
	canResolveItemProvider(type: string): Promise<boolean> { return Promise.resolve(true); }
	notifySessionItemsChanged(sessionType: string): void { }
	getEditableData(sessionId: string): any { return undefined; }
}

suite('ChatSessions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('LocalChatSessionsProvider always shows widget entry', async () => {
		const mockChatWidgetService = new MockChatWidgetService([]);
		const mockChatService = new MockChatService();
		const mockEditorGroupsService = new MockEditorGroupsService();
		const mockChatSessionsService = new MockChatSessionsService();

		const provider = disposables.add(new (LocalChatSessionsProvider as any)(
			mockEditorGroupsService,
			mockChatWidgetService,
			mockChatService,
			mockChatSessionsService
		));

		const items = await provider.provideChatSessionItems(CancellationToken.None);

		// Should have at least the widget entry and the history entry
		assert.ok(items.length >= 2, 'Should have widget and history entries');

		const widgetEntry = items.find((item: IChatSessionItem) => item.id === 'workbench.panel.chat.view.copilot');
		assert.ok(widgetEntry, 'Should always have a widget entry');
		assert.strictEqual(widgetEntry?.label, 'Chat', 'Widget entry should have "Chat" label');
		assert.strictEqual(widgetEntry?.description, 'Chat View', 'Widget entry should have "Chat View" description');
		assert.strictEqual(widgetEntry?.iconPath, Codicon.chatSparkle, 'Widget entry should have chat sparkle icon');
	});

	test('LocalChatSessionsProvider shows widget entry even when no widget exists', async () => {
		// Create a provider with no widgets
		const mockChatWidgetService = new MockChatWidgetService([]);
		const mockChatService = new MockChatService();
		const mockEditorGroupsService = new MockEditorGroupsService();
		const mockChatSessionsService = new MockChatSessionsService();

		const provider = disposables.add(new (LocalChatSessionsProvider as any)(
			mockEditorGroupsService,
			mockChatWidgetService,
			mockChatService,
			mockChatSessionsService
		));

		const items = await provider.provideChatSessionItems(CancellationToken.None);

		const widgetEntry = items.find((item: IChatSessionItem) => item.id === 'workbench.panel.chat.view.copilot');
		assert.ok(widgetEntry, 'Should show widget entry even when no widget exists');
		
		// Widget should be undefined in this case
		assert.strictEqual((widgetEntry as any).widget, undefined, 'Widget property should be undefined when no widget exists');
	});

	test('LocalChatSessionsProvider includes history entry', async () => {
		const mockChatWidgetService = new MockChatWidgetService([]);
		const mockChatService = new MockChatService();
		const mockEditorGroupsService = new MockEditorGroupsService();
		const mockChatSessionsService = new MockChatSessionsService();

		const provider = disposables.add(new (LocalChatSessionsProvider as any)(
			mockEditorGroupsService,
			mockChatWidgetService,
			mockChatService,
			mockChatSessionsService
		));

		const items = await provider.provideChatSessionItems(CancellationToken.None);

		const historyEntry = items.find((item: IChatSessionItem) => item.id === 'show-history');
		assert.ok(historyEntry, 'Should always have a history entry');
		assert.strictEqual(historyEntry?.label, 'History', 'History entry should have "History" label');
	});

	test('LocalChatSessionsProvider places widget entry first regardless of timestamp', async () => {
		const mockChatWidgetService = new MockChatWidgetService([]);
		const mockChatService = new MockChatService();
		const mockEditorGroupsService = new MockEditorGroupsService();
		const mockChatSessionsService = new MockChatSessionsService();

		const provider = disposables.add(new (LocalChatSessionsProvider as any)(
			mockEditorGroupsService,
			mockChatWidgetService,
			mockChatService,
			mockChatSessionsService
		));

		const items = await provider.provideChatSessionItems(CancellationToken.None);

		// Widget entry should always be first (except for any potential editor sessions with newer timestamps)
		// Since there are no editors in this test, the widget should be first
		assert.ok(items.length >= 1, 'Should have at least one item');
		
		// Find the first non-history item (since history is always last)
		const nonHistoryItems = items.filter((item: IChatSessionItem) => item.id !== 'show-history');
		assert.ok(nonHistoryItems.length > 0, 'Should have at least one non-history item');
		
		// The first non-history item should be the widget
		assert.strictEqual(nonHistoryItems[0].id, 'workbench.panel.chat.view.copilot', 'Widget entry should be first');
	});
});