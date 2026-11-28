/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { isChatContextPickerPickItem } from '../../../../../workbench/contrib/chat/browser/attachments/chatContextPickService.js';
import { IChatWidget } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ICopilotHomeService } from '../../../../../workbench/services/environment/common/copilotHomeService.js';
import { ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { SessionReferenceContextPickerPick } from '../../browser/sessionReferenceContextPicker.js';

suite('SessionReferenceContextPicker', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const remoteAddress = 'vscode-remote://wsl+Ubuntu';
	const remoteScheme = remoteAgentHostSessionTypeId(agentHostAuthority(remoteAddress), 'copilotcli');

	function session(resource: string, title: string, updatedAt: number): ISession {
		return upcastPartial<ISession>({
			resource: URI.parse(resource),
			title: observableValue('test', title),
			updatedAt: observableValue('test', new Date(updatedAt)),
			icon: Codicon.comment,
		});
	}

	const localCurrent = session('agent-host-copilotcli:/local-current', 'Local Current', 3);
	const remoteCurrent = session(`${remoteScheme}:/remote-current`, 'Remote Current', 3);
	const picker = new SessionReferenceContextPickerPick(
		upcastPartial<ISessionsManagementService>({
			getSessions: () => [
				session('agent-host-copilotcli:/older', 'Local Older', 1),
				localCurrent,
				session('copilotcli:/newest', 'Local Newest', 4),
				session('agent-host-claude:/unsupported', 'Unsupported', 5),
				session('remote-disconnected-copilotcli:/disconnected', 'Disconnected', 6),
				remoteCurrent,
				session(`${remoteScheme}:/remote-other`, 'Remote Other', 2),
			],
		}),
		upcastPartial<ICopilotHomeService>({ home: URI.file('/copilot') }),
		upcastPartial<IRemoteAgentHostService>({
			connections: [upcastPartial<IRemoteAgentHostConnectionInfo>({ address: remoteAddress, defaultDirectory: '/home/user' })],
		}),
	);

	async function getPicks(current: ISession) {
		const widget = upcastPartial<IChatWidget>({
			location: ChatAgentLocation.Chat,
			viewModel: { sessionResource: current.resource } as IChatWidget['viewModel'],
		});
		const picks = (await picker.asPicker(widget).picks) as unknown[];
		return picks.filter(isChatContextPickerPickItem);
	}

	test('lists attachable sessions on the current session\'s host, newest first, without the current session', async () => {
		const localPicks = await getPicks(localCurrent);
		const remotePicks = await getPicks(remoteCurrent);
		const attachment = await localPicks[0].asAttachment();

		assert.deepStrictEqual({
			local: localPicks.map(pick => pick.label),
			remote: remotePicks.map(pick => pick.label),
			attachment: JSON.parse(JSON.stringify(attachment)),
		}, {
			local: ['Local Newest', 'Local Older'],
			remote: ['Remote Other'],
			attachment: {
				kind: 'sessionReference',
				id: 'copilotcli:/newest',
				name: 'Local Newest',
				value: { $mid: 1, scheme: 'copilotcli', path: '/newest', external: 'copilotcli:/newest' },
				icon: { id: 'comment' },
			},
		});
	});
});
