/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { ActiveChatHarnessSyncContribution } from '../../../browser/aiCustomization/customizationHarnessService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { CustomizationHarnessServiceBase, ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { Target } from '../../../common/promptSyntax/promptTypes.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { MockPromptsService } from '../../common/promptSyntax/service/mockPromptsService.js';

suite('CustomizationHarnessService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks the focused chat session harness', () => {
		const focusedSessionChanged = disposables.add(new Emitter<void>());
		let sessionResource = URI.parse('vscode-chat-session://local/session');
		const widgetService = new class extends mock<IChatWidgetService>() {
			override readonly onDidChangeFocusedSession = focusedSessionChanged.event;
			override get lastFocusedWidget(): IChatWidget {
				return new class extends mock<IChatWidget>() {
					override readonly viewModel = new class extends mock<NonNullable<IChatWidget['viewModel']>>() {
						override readonly sessionResource = sessionResource;
					}();
				}();
			}
		}();
		const service: ICustomizationHarnessService = disposables.add(new CustomizationHarnessServiceBase([], SessionType.Local, new MockPromptsService()));
		disposables.add(service.registerExternalHarness({
			id: 'agent-host-copilotcli',
			label: 'Copilot',
			icon: ThemeIcon.fromId('copilot'),
			customAgentTarget: Target.GitHubCopilot,
		}));
		disposables.add(new ActiveChatHarnessSyncContribution(widgetService, service));

		sessionResource = URI.parse('agent-host-copilotcli:/session');
		focusedSessionChanged.fire();

		assert.deepStrictEqual({
			activeHarness: service.activeHarness.get(),
			activeSessionResource: service.activeSessionResource.get().toString(),
			activeTarget: service.getActiveDescriptor().customAgentTarget,
		}, {
			activeHarness: 'agent-host-copilotcli',
			activeSessionResource: 'agent-host-copilotcli:/session',
			activeTarget: Target.GitHubCopilot,
		});
	});
});
