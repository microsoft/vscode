/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { agentHostAuthority, toAgentHostContentUri, toAgentHostUri } from '../../../../../../../platform/agentHost/common/agentHostUri.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { IChatPetService } from '../../../../browser/chatPetService.js';
import { IChatToolRiskAssessmentService } from '../../../../browser/tools/chatToolRiskAssessmentService.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatMarkdownAnchorService, IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { CollapsibleListPool } from '../../../../browser/widget/chatContentParts/chatReferencesContentPart.js';
import { ChatModifiedFilesConfirmationSubPart, createModifiedFilePreviewEditorInput, findModifiedFileConfirmationEntry, getModifiedFilesSummaryLabel } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatModifiedFilesConfirmationSubPart.js';
import { IChatToolInvocation } from '../../../../common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';

suite('ChatModifiedFilesConfirmationSubPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	for (const authority of ['local', 'github-environment', agentHostAuthority('vscode-remote://ssh-remote+host')]) {
		for (const editKind of ['create', 'edit'] as const) {
			test(`renders and opens the ${editKind} confirmation file link on ${authority}`, async () => {
				const instantiationService = workbenchInstantiationService(undefined, store);
				instantiationService.stub(IChatMarkdownAnchorService, store.add(new ChatMarkdownAnchorService()));
				instantiationService.stub(ILanguageModelToolsService, { getTool: () => undefined });
				instantiationService.stub(IChatToolRiskAssessmentService, { isEnabled: () => false });
				instantiationService.stub(IChatPetService, { unlockAchievement: () => false });
				const opened = new DeferredPromise<void>();
				const openEditor = sinon.stub(instantiationService.get(IEditorService), 'openEditor').callsFake(async () => {
					opened.complete();
					return undefined;
				});
				const fileUri = URI.file('/tmp/test/host-approved.txt');
				const resource = toAgentHostUri(fileUri, authority);
				const modifiedContentUri = toAgentHostContentUri(URI.parse('agenthost-content:///session/proposed'), authority, fileUri);
				const originalContentUri = editKind === 'edit'
					? toAgentHostContentUri(URI.parse('agenthost-content:///session/original'), authority, fileUri)
					: undefined;
				const verb = editKind === 'create' ? 'Create' : 'Edit';
				const message = `${verb} [](${resource.toString()})`;
				const invocation = new ChatToolInvocation({
					confirmationMessages: {
						title: `${verb} file?`,
						message: editKind === 'create' ? message : new MarkdownString(message),
					},
					toolSpecificData: {
						kind: 'modifiedFilesConfirmation',
						options: ['Allow'],
						modifiedFiles: [{ uri: resource, editKind, originalContentUri, modifiedContentUri }],
					},
				}, {
					id: editKind,
					displayName: verb,
					modelDescription: verb,
					source: ToolDataSource.Internal,
				}, 'tool-call', undefined, {});
				const context = upcastPartial<IChatContentPartRenderContext>({
					element: upcastPartial<IChatResponseViewModel>({ sessionResource: URI.parse('chat-session://test/session') }),
				});
				const listPool = store.add(instantiationService.createInstance(CollapsibleListPool, Event.None, undefined, undefined));
				const part = store.add(instantiationService.createInstance(ChatModifiedFilesConfirmationSubPart, invocation, context, listPool));
				const renderedMessage = part.domNode.querySelector('.chat-modified-files-confirmation > .rendered-markdown');
				const link = renderedMessage?.querySelector<HTMLAnchorElement>('a.chat-inline-anchor-widget');
				assert.ok(link, 'The confirmation must retain its file link');

				link.click();
				await opened.p;
				await timeout(0);

				assert.deepStrictEqual({
					message: renderedMessage?.textContent?.trim(),
					target: link.dataset.href,
					editorInputs: openEditor.args,
					state: invocation.state.get().type,
				}, {
					message: `${verb} host-approved.txt`,
					target: resource.toString(),
					editorInputs: [[editKind === 'create' ? {
						label: 'host-approved.txt',
						original: { resource: undefined, contents: '' },
						modified: { resource: modifiedContentUri },
						options: { override: undefined, selection: undefined },
					} : {
						original: { resource: originalContentUri },
						modified: { resource: modifiedContentUri },
						options: { override: undefined, selection: undefined },
					}]],
					state: IChatToolInvocation.StateKind.WaitingForConfirmation,
				});
			});
		}
	}

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