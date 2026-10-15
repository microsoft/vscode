/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostEnablementService } from '../../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { NullManagedSettingsService } from '../../../../../../../platform/policy/common/copilotManagedSettings.js';
import { IProgressService } from '../../../../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, IUntypedEditorReplacement } from '../../../../../../services/editor/common/editorService.js';
import { AccountPolicyGateState, IAccountPolicyGateService } from '../../../../../../services/policies/common/accountPolicyService.js';
import { TestContextService } from '../../../../../../test/common/workbenchTestServices.js';
import { retargetMovedChatEditors } from '../../../../browser/agentSessions/agentHost/agentHostChatMoveEditors.js';
import { ChatEditorInput } from '../../../../browser/widgetHosts/editor/chatEditorInput.js';
import { IChatService } from '../../../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../common/chatSessionsService.js';

suite('retargetMovedChatEditors', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function chatEditor(resource: URI): ChatEditorInput {
		const policyGate: IAccountPolicyGateService = { _serviceBrand: undefined, gateInfo: { state: AccountPolicyGateState.Inactive }, onDidChangeGateInfo: Event.None, whenInitialized: async () => { } };
		return disposables.add(new ChatEditorInput(
			resource, {},
			upcastPartial<IChatService>({}),
			upcastPartial<IDialogService>({}),
			upcastPartial<IConfigurationService>({}),
			upcastPartial<IChatSessionsService>({}),
			upcastPartial<IInstantiationService>({}),
			upcastPartial<IStorageService>({}),
			new NullLogService(),
			new TestContextService(),
			upcastPartial<IAgentHostEnablementService>({}),
			upcastPartial<IAgentHostConnectionsService>({}),
			NullTelemetryService,
			upcastPartial<IProgressService>({}),
			new NullManagedSettingsService(),
			policyGate,
		));
	}

	test('replaces each chat editor of the moved chat in place by one of its new resource', async () => {
		const from = URI.parse('agent-host-copilot:/source#mover');
		const to = URI.parse('agent-host-copilot:/target#mover');
		const other = chatEditor(URI.parse('agent-host-copilot:/source#other'));
		const groups = [
			upcastPartial<IEditorGroup>({ id: 1, editors: [other, chatEditor(from)] }),
			upcastPartial<IEditorGroup>({ id: 2, editors: [] }),
			upcastPartial<IEditorGroup>({ id: 3, editors: [chatEditor(from)] }),
		];
		const replaced: { group: number; editor: string | undefined; replacement: unknown }[] = [];
		const editorService = upcastPartial<IEditorService>({
			replaceEditors: async (replacements: IUntypedEditorReplacement[], group: IEditorGroup | number) => {
				for (const { editor, replacement } of replacements) {
					replaced.push({ group: typeof group === 'number' ? group : group.id, editor: editor.resource?.toString(), replacement });
				}
			},
		});

		await retargetMovedChatEditors(upcastPartial<IEditorGroupsService>({ groups }), editorService, from, to);

		const replacement = { resource: to, options: { override: ChatEditorInput.EditorID, pinned: true, preserveFocus: true } };
		assert.deepStrictEqual(replaced, [
			{ group: 1, editor: from.toString(), replacement },
			{ group: 3, editor: from.toString(), replacement },
		]);
	});
});
