/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { TestLifecycleService, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { GrowthSessionController, GrowthSessionOpenerParticipant } from '../../../browser/chatSetup/chatSetupGrowthSession.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { MockChatWidgetService } from '../widget/mockChatWidget.js';
class TestMockChatWidgetService extends MockChatWidgetService {
    constructor() {
        super(...arguments);
        this._onDidAddWidget = new Emitter();
        this.onDidAddWidget = this._onDidAddWidget.event;
    }
    fireDidAddWidget() {
        this._onDidAddWidget.fire(undefined);
    }
    dispose() {
        this._onDidAddWidget.dispose();
    }
}
suite('GrowthSessionController', () => {
    const disposables = new DisposableStore();
    let instantiationService;
    let mockWidgetService;
    setup(() => {
        instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
        mockWidgetService = new TestMockChatWidgetService();
        disposables.add({ dispose: () => mockWidgetService.dispose() });
        const mockLifecycleService = disposables.add(new TestLifecycleService());
        instantiationService.stub(IChatWidgetService, mockWidgetService);
        instantiationService.stub(ILifecycleService, mockLifecycleService);
    });
    teardown(() => {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('should return a single NeedsInput session item', () => {
        const controller = disposables.add(instantiationService.createInstance(GrowthSessionController));
        const items = controller.items;
        assert.strictEqual(items.length, 1);
        assert.strictEqual(items[0].status, 3 /* ChatSessionStatus.NeedsInput */);
        assert.strictEqual(items[0].label, 'Try Copilot');
        assert.ok(items[0].resource.scheme === AgentSessionProviders.Growth);
    });
    test('should return empty items after dismiss', async () => {
        const controller = disposables.add(instantiationService.createInstance(GrowthSessionController));
        assert.strictEqual(controller.items.length, 1);
        // Allow the lifecycle.when() promise to resolve and register the listener
        await new Promise(r => setTimeout(r, 0));
        // Fire widget add — should dismiss
        mockWidgetService.fireDidAddWidget();
        assert.strictEqual(controller.items.length, 0);
    });
    test('should fire onDidChangeChatSessionItems on dismiss', async () => {
        const controller = disposables.add(instantiationService.createInstance(GrowthSessionController));
        let fired = false;
        disposables.add(controller.onDidChangeChatSessionItems(() => {
            fired = true;
        }));
        await new Promise(r => setTimeout(r, 0));
        mockWidgetService.fireDidAddWidget();
        assert.strictEqual(fired, true);
    });
    test('should not fire onDidChangeChatSessionItems twice', async () => {
        const controller = disposables.add(instantiationService.createInstance(GrowthSessionController));
        let fireCount = 0;
        disposables.add(controller.onDidChangeChatSessionItems(() => {
            fireCount++;
        }));
        await new Promise(r => setTimeout(r, 0));
        mockWidgetService.fireDidAddWidget();
        mockWidgetService.fireDidAddWidget();
        assert.strictEqual(fireCount, 1);
    });
    test('refresh is a no-op', async () => {
        const controller = disposables.add(instantiationService.createInstance(GrowthSessionController));
        await controller.refresh();
        assert.strictEqual(controller.items.length, 1);
    });
});
suite('GrowthSessionOpenerParticipant', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('should return false for non-Growth sessions', async () => {
        const participant = new GrowthSessionOpenerParticipant();
        const session = {
            providerType: AgentSessionProviders.Local,
            providerLabel: 'Local',
            resource: URI.parse('local://session-1'),
            status: 1 /* ChatSessionStatus.Completed */,
            label: 'Test Session',
            icon: Codicon.vm,
            timing: { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined },
            isArchived: () => false,
            setArchived: () => { },
            isPinned: () => false,
            setPinned: () => { },
            isRead: () => true,
            isMarkedUnread: () => false,
            setRead: () => { },
        };
        // The participant checks providerType before touching the accessor,
        // so a stub accessor is sufficient for this test path.
        const stubAccessor = { get: () => undefined };
        const result = await participant.handleOpenSession(stubAccessor, session);
        assert.strictEqual(result, false);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNldHVwR3Jvd3RoU2Vzc2lvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvY2hhdFNldHVwL2NoYXRTZXR1cEdyb3d0aFNlc3Npb24udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXRHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRTNILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRXhGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQy9ILE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzNFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBR3BFLE1BQU0seUJBQTBCLFNBQVEscUJBQXFCO0lBQTdEOztRQUVrQixvQkFBZSxHQUFHLElBQUksT0FBTyxFQUFlLENBQUM7UUFDNUMsbUJBQWMsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FB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