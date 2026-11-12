/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { computeLocalModelContextKeyValues, showLocalModelDetails } from '../../../browser/agentSessions/agentHost/localModelActions.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import type { IModelPickerOpenOptions } from '../../../browser/widget/input/modelPicker/modelPickerWidget.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { createStatus, installedFamily, offeredFamily, otherFamily } from './localModelTestUtils.js';

suite('LocalModelContextKeys', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('derive from the status of the current chat\'s local agent host; nothing without status', () => {
		const offered = createStatus([offeredFamily]);
		const busy = createStatus([
			{ ...installedFamily, install: { ...installedFamily.install!, update: { contentId: 'c2', downloadBytes: 1 } } },
			{ ...otherFamily, operation: { id: 'op', kind: 'update', state: 'error', resumeOnStartup: false, error: { code: 'runtimeTooOld', message: 'Too old', actions: ['getLlamaCpp', 'openSettings', 'retry'] } } },
			{ ...offeredFamily, familyId: 'paused', operation: { id: 'op2', kind: 'setup', state: 'paused', pausedReason: 'user', resumeOnStartup: false } },
		], { active: { familyId: installedFamily.familyId, contentId: 'c1', servingGeneration: 1, server: 'ready' } });

		assert.deepStrictEqual({
			none: computeLocalModelContextKeyValues(undefined),
			empty: computeLocalModelContextKeyValues(createStatus([])),
			offered: computeLocalModelContextKeyValues(offered),
			busy: computeLocalModelContextKeyValues(busy),
		}, {
			none: { visible: false, canSetUp: false, hasOperation: false, hasPausedOperation: false, hasFailedOperation: false, hasInstalled: false, hasUpdate: false, active: false },
			empty: { visible: false, canSetUp: false, hasOperation: false, hasPausedOperation: false, hasFailedOperation: false, hasInstalled: false, hasUpdate: false, active: false },
			offered: { visible: true, canSetUp: true, hasOperation: false, hasPausedOperation: false, hasFailedOperation: false, hasInstalled: false, hasUpdate: false, active: false },
			busy: { visible: true, canSetUp: false, hasOperation: true, hasPausedOperation: true, hasFailedOperation: true, hasInstalled: true, hasUpdate: true, active: true },
		});
	});
});

suite('showLocalModelDetails', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/** A chat widget of `sessionType` whose model picker records how it was opened. */
	function createWidget(name: string, sessionType: string, opened: string[]): IChatWidget {
		return upcastPartial<IChatWidget>({
			viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: URI.from({ scheme: sessionType, path: `/${name}` }) }),
			input: upcastPartial<IChatWidget['input']>({
				getModelPickerControl: () => ({ element: upcastPartial<HTMLElement>({}), select: () => false, open: (options: IModelPickerOpenOptions) => opened.push(`${name}:${options.localModelFamilyId}`) }),
			}),
		});
	}

	/** Opens a new chat as `opens` returns it (`'throw'`: fails), recording the session types it is asked for. */
	function createWidgetService(lastFocused: IChatWidget | undefined, widgets: IChatWidget[], opens: IChatWidget | undefined | 'throw', calls: string[]): IChatWidgetService {
		return upcastPartial<IChatWidgetService>({
			lastFocusedWidget: lastFocused,
			getAllWidgets: () => widgets,
			reveal: async widget => { calls.push(`reveal:${widget.viewModel?.sessionResource.path}`); return true; },
			revealWidget: async () => { calls.push('revealChatView'); return lastFocused; },
			openSession: async (resource: URI) => {
				calls.push(`newChat:${resource.scheme}:${resource.path.startsWith('/untitled-')}`);
				if (opens === 'throw') {
					throw new Error('agent host unavailable');
				}
				return opens;
			},
		});
	}

	test('opens the picker of the last focused on-device chat, else any open one, else a new chat on the local agent host; never an incompatible one', async () => {
		const opened: string[] = [];
		const calls: string[] = [];
		const local = createWidget('local', SessionType.AgentHostCopilot, opened);
		const other = createWidget('other', 'vscode-chat-session', opened);
		const started = createWidget('started', SessionType.AgentHostCopilot, opened);
		const show = (service: IChatWidgetService, familyId: string) => showLocalModelDetails(service, familyId, new NullLogService());
		const results = [
			await show(createWidgetService(local, [other, local], started, calls), 'example-flash'),
			await show(createWidgetService(other, [other, local], started, calls), 'mini'),
			await show(createWidgetService(other, [other], started, calls), 'qwen'),
			// The chat view comes back with a chat that can't list on-device models.
			await show(createWidgetService(other, [other], other, calls), 'incompatible'),
			await show(createWidgetService(undefined, [], 'throw', calls), 'unavailable'),
		];
		const newChat = `newChat:${SessionType.AgentHostCopilot}:true`;
		assert.deepStrictEqual({ results, calls, opened }, {
			results: [true, true, true, false, false],
			calls: ['reveal:/local', 'reveal:/local', newChat, newChat, newChat],
			opened: ['local:example-flash', 'local:mini', 'started:qwen'],
		});
	});
});
