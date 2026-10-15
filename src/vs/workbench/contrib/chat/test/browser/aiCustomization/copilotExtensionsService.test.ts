/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection, IAgentExtensionInventory } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { identityAgentHostResourceUriMapper } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { CopilotExtensionsService } from '../../../browser/aiCustomization/copilotExtensionsService.js';

suite('CopilotExtensionsService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('routes inventory globally and reconciles the selected exact chat after enablement changes', async () => {
		const frontendSession = URI.parse('agent-host-copilotcli:/session-1');
		const backendSession = URI.parse('copilotcli:/session-1');
		const backendChat = URI.parse('vendor-chat://opaque.example/threads/chat-1');
		const calls: string[] = [];
		const inventory: IAgentExtensionInventory = {
			mode: 'load_and_augment',
			extensions: [{
				id: 'user:preview',
				name: 'Preview',
				resource: URI.file('/extensions/preview/extension.mjs'),
				source: 'user',
				enabled: true,
			}],
		};
		const connection = new class extends mock<IAgentConnection>() {
			override readonly resourceUris = identityAgentHostResourceUriMapper;
			override listAgentExtensions(): Promise<IAgentExtensionInventory> {
				calls.push('listExtensions');
				return Promise.resolve(inventory);
			}
			override setAgentExtensionEnabled(extensionId: string, enabled: boolean, session?: URI, chat?: URI): Promise<void> {
				calls.push(`setExtension:${extensionId}:${enabled}:${session?.toString()}:${chat?.toString()}`);
				return Promise.resolve();
			}
		}();
		const resolution: IAgentHostSessionResolution = {
			connection,
			connectionAuthority: 'local',
			backendSession,
		};
		const connections = new class extends mock<IAgentHostConnectionsService>() {
			override readonly ambientConnection = connection;
			override resolveSessionResource(sessionResource: URI): IAgentHostSessionResolution | undefined {
				return sessionResource.toString() === frontendSession.toString() ? resolution : undefined;
			}
		}();
		const customizationService = new class extends mock<IAgentHostCustomizationService>() {
			override getBackendChatResource(sessionResource: URI): URI | undefined {
				return sessionResource.toString() === frontendSession.toString() ? backendChat : undefined;
			}
		}();
		const service = disposables.add(new CopilotExtensionsService(connections, customizationService));
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		const listed = await service.listExtensions(frontendSession, CancellationToken.None);
		await service.setExtensionEnabled(frontendSession, 'user:preview', false);

		assert.deepStrictEqual({
			listed,
			calls,
			changeCount,
		}, {
			listed: inventory,
			calls: [
				'listExtensions',
				'setExtension:user:preview:false:copilotcli:/session-1:vendor-chat://opaque.example/threads/chat-1',
			],
			changeCount: 1,
		});
	});

	test('uses the ambient host when no session has materialized', async () => {
		const connection = new class extends mock<IAgentConnection>() {
			override readonly resourceUris = identityAgentHostResourceUriMapper;
			override listAgentExtensions(): Promise<IAgentExtensionInventory> {
				return Promise.resolve({ mode: 'disabled', extensions: [] });
			}
		}();
		const connections = new class extends mock<IAgentHostConnectionsService>() {
			override readonly ambientConnection = connection;
			override resolveSessionResource(): undefined { return undefined; }
			override resolveSessionResourceIdentity(): undefined { return undefined; }
		}();
		const service = disposables.add(new CopilotExtensionsService(connections, new class extends mock<IAgentHostCustomizationService>() { }()));

		assert.deepStrictEqual(
			await service.listExtensions(URI.parse('agent-host-copilotcli:/untitled'), CancellationToken.None),
			{ mode: 'disabled', extensions: [] },
		);
	});
});
