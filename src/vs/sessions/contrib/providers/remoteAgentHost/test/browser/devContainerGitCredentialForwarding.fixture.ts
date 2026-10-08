/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { assert } from '../../../../../../base/common/assert.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IChatInputNotification, IChatInputNotificationService } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { shortNameModels } from '../../../../../../workbench/test/browser/componentFixtures/chat/chatInput.fixture.js';
import { renderChatInput } from '../../../../../../workbench/test/browser/componentFixtures/chat/renderChatInput.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { DevContainerGitCredentialForwardingSettingId } from '../../../../../common/devContainerAgentHostService.js';
import { DevContainerGitCredentialForwarding } from '../../browser/devContainerGitCredentialForwarding.js';
import '../../../../chat/browser/media/chatView.css';
import '../../../../chat/browser/media/chatInput.css';

async function renderApproval(context: ComponentFixtureContext, width: number): Promise<void> {
	const changed = context.disposableStore.add(new Emitter<void>());
	let notification: IChatInputNotification | undefined;
	const notifications = new class extends mock<IChatInputNotificationService>() {
		override readonly onDidChange = changed.event;
		override setNotification(value: IChatInputNotification): void { notification = value; changed.fire(); }
		override deleteNotification(): void { notification = undefined; changed.fire(); }
		override refresh(): void { changed.fire(); }
		override getActiveNotification(filter?: (value: IChatInputNotification) => boolean): IChatInputNotification | undefined {
			return notification && (!filter || filter(notification)) ? notification : undefined;
		}
		override announceRendered(): void { }
	}();
	const address = 'devcontainer:fixture';
	const resource = URI.parse('opaque-chat:/devcontainer-fixture');
	const connections = new class extends mock<IAgentHostConnectionsService>() {
		override readonly onDidChangeSessionResolution = Event.None;
		override resolveSessionResourceIdentity() {
			return { connectionAuthority: 'fixture', connectionAddress: address, backendSession: URI.parse('ahp-session:/fixture') };
		}
	}();
	const configuration = new TestConfigurationService({ [DevContainerGitCredentialForwardingSettingId]: 'prompt' });
	context.disposableStore.add(configuration.onDidChangeConfigurationEmitter);
	const forwarding = context.disposableStore.add(new DevContainerGitCredentialForwarding(configuration, notifications, connections, new NullLogService()));
	void forwarding.request(URI.file('/workspaces/project'), 'fixture-container', address, CancellationToken.None).catch(onUnexpectedError);
	const commands = context.disposableStore.add(new TestInstantiationService());
	context.container.classList.add('agent-sessions-workbench');
	const sessionsPart = dom.append(context.container, dom.$('.part.sessionspart'));
	await renderChatInput({ ...context, container: sessionsPart }, {
		isSessionsWindow: true,
		sessionResource: resource,
		width,
		value: 'Fetch the latest changes.',
		models: shortNameModels,
		additionalServices: registration => {
			registration.defineInstance(IChatInputNotificationService, notifications);
			registration.defineInstance(ICommandService, new class extends mock<ICommandService>() {
				override readonly onWillExecuteCommand = Event.None;
				override readonly onDidExecuteCommand = Event.None;
				override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
					const command = CommandsRegistry.getCommand(id);
					assert(!!command, `Unknown fixture command: ${id}`);
					return commands.invokeFunction(command.handler, ...args) as T;
				}
			}());
		},
	});
	assert(!!notification && sessionsPart.textContent?.includes('Allow Git credential forwarding?'), 'The Git credential approval must be visible above the input.');
}

export default defineThemedFixtureGroup({ path: 'sessions/devContainerGitCredentials/' }, {
	Approval: defineComponentFixture({ render: context => renderApproval(context, 650) }),
	NarrowApproval: defineComponentFixture({ render: context => renderApproval(context, 360) }),
});
