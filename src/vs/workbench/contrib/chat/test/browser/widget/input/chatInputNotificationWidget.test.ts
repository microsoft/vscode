/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ICommandEvent, ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { SyncDescriptor } from '../../../../../../../platform/instantiation/common/descriptors.js';
import { getSingletonServiceDescriptors } from '../../../../../../../platform/instantiation/common/extensions.js';
import { ServiceCollection } from '../../../../../../../platform/instantiation/common/serviceCollection.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from '../../../../browser/widget/input/chatInputNotificationService.js';
import { ChatInputNotificationWidget } from '../../../../browser/widget/input/chatInputNotificationWidget.js';
import { localChatSessionType, SessionType } from '../../../../common/chatSessionsService.js';

class TestCommandService implements ICommandService {
	declare readonly _serviceBrand: undefined;

	readonly onWillExecuteCommand: Event<ICommandEvent> = Event.None;
	readonly onDidExecuteCommand: Event<ICommandEvent> = Event.None;

	async executeCommand(): Promise<undefined> {
		return undefined;
	}
}

suite('ChatInputNotificationWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createNotificationService(): IChatInputNotificationService {
		const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IChatInputNotificationService)?.[1];
		assert.ok(descriptor);
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(ICommandService, new TestCommandService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		const childInstantiationService = store.add(instantiationService.createChild(new ServiceCollection(
			[IChatInputNotificationService, new SyncDescriptor(descriptor.ctor, descriptor.staticArguments)]
		)));
		const notificationService = childInstantiationService.get(IChatInputNotificationService);
		store.add(notificationService as IChatInputNotificationService & IDisposable);
		return notificationService;
	}

	test('rerender applies session type filter when pending delegation target changes', () => {
		let currentSessionType = localChatSessionType;
		const notificationService = createNotificationService();
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IChatInputNotificationService, notificationService);
		instantiationService.stub(ICommandService, new TestCommandService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, () => currentSessionType));

		notificationService.setNotification({
			id: 'local-only',
			severity: ChatInputNotificationSeverity.Info,
			message: 'Local only',
			description: undefined,
			actions: [],
			dismissible: false,
			autoDismissOnMessage: false,
			sessionTypes: [localChatSessionType],
		});

		assert.strictEqual(widget.domNode.querySelector('.chat-input-notification')?.textContent, 'Local only');

		currentSessionType = SessionType.AgentHostCopilot;
		widget.rerender();
		assert.strictEqual(widget.domNode.querySelector('.chat-input-notification'), null);

		currentSessionType = localChatSessionType;
		widget.rerender();
		assert.strictEqual(widget.domNode.querySelector('.chat-input-notification')?.textContent, 'Local only');
	});
});
