/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { Event } from '../../../../../../../base/common/event.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ConfirmationOptionKind } from '../../../../../../../platform/agentHost/common/state/protocol/state.js';
import { WorkbenchList } from '../../../../../../../platform/list/browser/listService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatToolRiskAssessmentService } from '../../../../browser/tools/chatToolRiskAssessmentService.js';
import { IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { CollapsibleListPool, IChatCollapsibleListItem } from '../../../../browser/widget/chatContentParts/chatReferencesContentPart.js';
import { ChatModifiedFilesConfirmationSubPart, createModifiedFilePreviewEditorInput, findModifiedFileConfirmationEntry, getModifiedFilesSummaryLabel } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatModifiedFilesConfirmationSubPart.js';
import { IChatToolInvocation, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';

suite('ChatModifiedFilesConfirmationSubPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('projected file approvals preserve protocol option IDs and restore Lead focus', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ILanguageModelToolsService, new class extends mock<ILanguageModelToolsService>() {
			override getTool() { return undefined; }
		}());
		instantiationService.stub(IChatToolRiskAssessmentService, new class extends mock<IChatToolRiskAssessmentService>() {
			override isEnabled() { return false; }
		}());
		instantiationService.stub(IChatMarkdownAnchorService, new class extends mock<IChatMarkdownAnchorService>() { }());
		const node = mainWindow.document.createElement('div');
		const list = new class extends mock<WorkbenchList<IChatCollapsibleListItem>>() {
			override get onDidOpen() { return Event.None; }
			override get length() { return 0; }
			override getHTMLElement() { return node; }
			override layout() { }
			override splice() { }
		}();
		const pool = new class extends mock<CollapsibleListPool>() {
			override get() { return { object: list, isStale: () => false, dispose: () => { } }; }
		}();
		let focusedLead = 0;
		let active = true;
		const context = new class extends mock<IChatContentPartRenderContext>() {
			override readonly element = new class extends mock<IChatResponseViewModel>() {
				override readonly sessionResource = URI.parse('agent-host-copilotcli:/team#worker');
			}();
			override readonly isRequestActive = () => active;
			override readonly focusAfterAction = () => focusedLead++;
		}();
		const invocation = new ChatToolInvocation({
			invocationMessage: 'Edit csv.js',
			confirmationMessages: {
				title: 'Write file?',
				customOptions: [
					{ id: 'allow-once', label: 'Allow Once', kind: ConfirmationOptionKind.Approve },
					{ id: 'skip', label: 'Skip', kind: ConfirmationOptionKind.Deny },
				],
			},
			toolSpecificData: { kind: 'modifiedFilesConfirmation', options: ['Allow'], modifiedFiles: [] },
		}, { id: 'edit', source: ToolDataSource.Internal, displayName: 'Edit', modelDescription: 'Edit' }, 'tool', undefined, undefined);
		const part = store.add(instantiationService.createInstance(ChatModifiedFilesConfirmationSubPart, invocation, context, pool));
		const buttons = [...part.domNode.querySelectorAll<HTMLElement>('.monaco-button')];
		const allow = buttons.find(button => button.textContent === 'Allow Once');
		assert.ok(allow);
		active = false;
		allow.click();
		const staleState = invocation.state.get().type;
		active = true;
		const confirmation = IChatToolInvocation.awaitConfirmation(invocation);
		allow.click();
		assert.deepStrictEqual({
			staleState,
			confirmed: await confirmation,
			focusedLead,
		}, {
			staleState: IChatToolInvocation.StateKind.WaitingForConfirmation,
			confirmed: { type: ToolConfirmKind.UserAction, selectedButton: 'allow-once', selectedButtonKind: ConfirmationOptionKind.Approve },
			focusedLead: 1,
		});
	});

	test('creates editor inputs for pending file changes', () => {
		const resource = URI.file('/workspace/package.json');
		const originalUri = URI.parse('vscode-agent-host://local/package.json?original');
		const modifiedContentUri = URI.parse('vscode-agent-host://local/package.json?proposed');
		const options = { pinned: true };

		assert.deepStrictEqual({
			create: createModifiedFilePreviewEditorInput(resource, undefined, modifiedContentUri, undefined, options),
			edit: createModifiedFilePreviewEditorInput(resource, originalUri, modifiedContentUri, 'package.json', options),
			fallback: createModifiedFilePreviewEditorInput(resource, undefined, undefined, 'package.json', options),
		}, {
			create: {
				label: 'package.json',
				original: { resource: undefined, contents: '' },
				modified: { resource: modifiedContentUri },
				options,
			},
			edit: {
				original: { resource: originalUri },
				modified: { resource: modifiedContentUri },
				options,
			},
			fallback: { resource, options },
		});
	});

	test('distinguishes created files in the confirmation summary', () => {
		const created = { uri: URI.file('/workspace/new.ts'), editKind: 'create' as const };
		const edited = { uri: URI.file('/workspace/existing.ts'), editKind: 'edit' as const };

		assert.deepStrictEqual({
			oneCreated: getModifiedFilesSummaryLabel([created]),
			manyCreated: getModifiedFilesSummaryLabel([created, { ...created, uri: URI.file('/workspace/other.ts') }]),
			mixed: getModifiedFilesSummaryLabel([created, edited]),
		}, {
			oneCreated: '1 file created',
			manyCreated: '2 files created',
			mixed: '2 files changed',
		});
	});

	test('finds the proposed edit referenced by the confirmation message pill', () => {
		const resource = URI.file('/workspace/package.json');
		const originalContentUri = URI.parse('vscode-agent-host://local/package.json?original');
		const modifiedContentUri = URI.parse('vscode-agent-host://local/package.json?proposed');
		const file = {
			uri: resource,
			editKind: 'edit' as const,
			originalContentUri,
			modifiedContentUri,
			title: 'package.json',
		};

		assert.deepStrictEqual(
			findModifiedFileConfirmationEntry([file], URI.file('/workspace/package.json')),
			file,
		);
	});
});