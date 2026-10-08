/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentCanvasInfo, IAgentConnection, IAgentExtensionInventory } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { identityAgentHostResourceUriMapper } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { CopilotCustomizationsService } from '../../../browser/aiCustomization/copilotCustomizationsService.js';

suite('CopilotCustomizationsService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('routes extension and canvas operations through the active session host', async () => {
		const frontendSession = URI.parse('agent-host-copilotcli:/session-1');
		const backendSession = URI.parse('copilotcli:/session-1');
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
		const canvases: readonly IAgentCanvasInfo[] = [{
			canvasId: 'preview',
			extensionId: 'user:preview',
			displayName: 'Preview Canvas',
			description: 'Interactive preview.',
			requiresInput: false,
			actionCount: 1,
		}];
		const connection = new class extends mock<IAgentConnection>() {
			override readonly resourceUris = identityAgentHostResourceUriMapper;
			override listAgentExtensions(): Promise<IAgentExtensionInventory> {
				calls.push('listExtensions');
				return Promise.resolve(inventory);
			}
			override setAgentExtensionEnabled(extensionId: string, enabled: boolean, session?: URI): Promise<void> {
				calls.push(`setExtension:${extensionId}:${enabled}:${session?.toString()}`);
				return Promise.resolve();
			}
			override listSessionCanvases(session: URI): Promise<readonly IAgentCanvasInfo[]> {
				calls.push(`listCanvases:${session.toString()}`);
				return Promise.resolve(canvases);
			}
			override refreshSessionCanvases(session: URI): Promise<readonly IAgentCanvasInfo[]> {
				calls.push(`refreshCanvases:${session.toString()}`);
				return Promise.resolve(canvases);
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
		const service = disposables.add(new CopilotCustomizationsService(connections));
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		const listedExtensions = await service.listExtensions(frontendSession, CancellationToken.None);
		await service.setExtensionEnabled(frontendSession, 'user:preview', false);
		const listedCanvases = await service.listCanvases(frontendSession, CancellationToken.None);
		const refreshedCanvases = await service.refreshCanvases(frontendSession, CancellationToken.None);

		assert.deepStrictEqual({
			listedExtensions,
			listedCanvases,
			refreshedCanvases,
			calls,
			changeCount,
		}, {
			listedExtensions: inventory,
			listedCanvases: canvases,
			refreshedCanvases: canvases,
			calls: [
				'listExtensions',
				'setExtension:user:preview:false:copilotcli:/session-1',
				'listCanvases:copilotcli:/session-1',
				'refreshCanvases:copilotcli:/session-1',
			],
			changeCount: 1,
		});
	});

	test('uses the ambient host for extension inventory but requires session resolution for canvases', async () => {
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
		const service = disposables.add(new CopilotCustomizationsService(connections));
		const session = URI.parse('agent-host-copilotcli:/untitled');

		assert.deepStrictEqual(await service.listExtensions(session, CancellationToken.None), { mode: 'disabled', extensions: [] });
		await assert.rejects(service.listCanvases(session, CancellationToken.None), /not connected/);
	});
});
