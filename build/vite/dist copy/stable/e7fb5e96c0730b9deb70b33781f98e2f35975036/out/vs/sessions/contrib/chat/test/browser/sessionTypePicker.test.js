/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISessionsManagementService } from '../../../sessions/browser/sessionsManagementService.js';
import { SessionTypePicker } from '../../browser/sessionTypePicker.js';
function createActiveSession(sessionType) {
    const chat = {
        resource: URI.parse(`test:///chat/${sessionType}`),
        createdAt: new Date(),
        title: constObservable('Chat'),
        updatedAt: constObservable(new Date()),
        status: constObservable(0 /* SessionStatus.Untitled */),
        changes: constObservable([]),
        modelId: constObservable(undefined),
        mode: constObservable(undefined),
        isArchived: constObservable(false),
        isRead: constObservable(true),
        description: constObservable(undefined),
        lastTurnEnd: constObservable(undefined),
    };
    return {
        sessionId: `provider:${sessionType}`,
        resource: URI.parse(`test:///session/${sessionType}`),
        providerId: 'provider',
        sessionType,
        icon: Codicon.copilot,
        createdAt: new Date(),
        workspace: constObservable(undefined),
        title: constObservable('Session'),
        updatedAt: constObservable(new Date()),
        status: constObservable(0 /* SessionStatus.Untitled */),
        changes: constObservable([]),
        modelId: constObservable(undefined),
        mode: constObservable(undefined),
        loading: constObservable(false),
        isArchived: constObservable(false),
        isRead: constObservable(true),
        description: constObservable(undefined),
        lastTurnEnd: constObservable(undefined),
        gitHubInfo: constObservable(undefined),
        chats: constObservable([chat]),
        mainChat: chat,
        activeChat: constObservable(chat),
    };
}
suite('SessionTypePicker', () => {
    const disposables = new DisposableStore();
    let sessionTypes;
    let activeSession;
    let instantiationService;
    setup(() => {
        sessionTypes = [];
        activeSession = observableValue('activeSession', undefined);
        instantiationService = disposables.add(new TestInstantiationService());
        instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => { }, show: () => { } });
        instantiationService.stub(ISessionsManagementService, {
            activeSession,
            getSessionTypes: () => sessionTypes,
            setSessionType: () => {
                throw new Error('Not implemented');
            },
        });
    });
    teardown(() => {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('hides the picker when only one session type is available', () => {
        sessionTypes = [{ id: 'copilotcli', label: 'Copilot CLI', icon: Codicon.copilot }];
        activeSession.set(createActiveSession('copilotcli'), undefined);
        const picker = disposables.add(instantiationService.createInstance(SessionTypePicker));
        const container = document.createElement('div');
        picker.render(container);
        const slot = container.querySelector('.sessions-chat-picker-slot');
        assert.ok(slot);
        assert.strictEqual(slot.style.display, 'none');
    });
    test('shows the picker when multiple session types are available', () => {
        sessionTypes = [
            { id: 'copilotcli', label: 'Copilot CLI', icon: Codicon.copilot },
            { id: 'copilot-cloud-agent', label: 'Cloud', icon: Codicon.cloud },
        ];
        activeSession.set(createActiveSession('copilotcli'), undefined);
        const picker = disposables.add(instantiationService.createInstance(SessionTypePicker));
        const container = document.createElement('div');
        picker.render(container);
        const slot = container.querySelector('.sessions-chat-picker-slot');
        assert.ok(slot);
        assert.strictEqual(slot.style.display, '');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvblR5cGVQaWNrZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvc2Vzc2lvblR5cGVQaWNrZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsZUFBZSxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQWtCLDBCQUEwQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFHcEgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFdkUsU0FBUyxtQkFBbUIsQ0FBQyxXQUFtQjtJQUMvQyxNQUFNLElBQUksR0FBRztRQUNaLFFBQVEsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixXQUFXLEVBQUUsQ0FBQztRQUNsRCxTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUU7UUFDckIsS0FBSyxFQUFFLGVBQWUsQ0FBQyxNQUFNLENBQUM7UUFDOUIsU0FBUyxFQUFFLGVBQWUsQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ3RDLE1BQU0sRUFBRSxlQUFlLGdD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