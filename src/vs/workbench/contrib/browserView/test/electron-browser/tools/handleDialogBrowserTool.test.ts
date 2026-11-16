/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IPlaywrightService } from '../../../../../../platform/browserView/common/playwrightService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IChatToolRiskAssessmentService } from '../../../../chat/browser/tools/chatToolRiskAssessmentService.js';
import { LanguageModelToolsConfirmationService } from '../../../../chat/browser/tools/languageModelToolsConfirmationService.js';
import { LanguageModelToolsService } from '../../../../chat/browser/tools/languageModelToolsService.js';
import { ConfirmedReason, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../../chat/common/chatService/chatService.js';
import { ChatConfiguration } from '../../../../chat/common/constants.js';
import { IChatModel, IChatRequestModel } from '../../../../chat/common/model/chatModel.js';
import { ChatToolInvocation } from '../../../../chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { LocalChatSessionUri } from '../../../../chat/common/model/chatUri.js';
import { ILanguageModelToolsConfirmationService } from '../../../../chat/common/tools/languageModelToolsConfirmationService.js';
import { IToolInvocation } from '../../../../chat/common/tools/languageModelToolsService.js';
import { IToolResultCompressor } from '../../../../chat/common/tools/toolResultCompressor.js';
import { MockChatService } from '../../../../chat/test/common/chatService/mockChatService.js';
import { HandleDialogBrowserTool, HandleDialogBrowserToolConfirmationContribution, HandleDialogBrowserToolData, HandleDialogBrowserToolId } from '../../../electron-browser/tools/handleDialogBrowserTool.js';

suite('HandleDialogBrowserTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const tool = new HandleDialogBrowserTool(upcastPartial<IPlaywrightService>({}));

	async function prepare(parameters: object) {
		return tool.prepareToolInvocation({
			parameters,
			toolCallId: 'call-1',
			chatSessionResource: undefined,
		}, CancellationToken.None);
	}

	test('requires input-dependent confirmation for uploaded files', async () => {
		const prepared = await prepare({
			pageId: 'page-1',
			selectFiles: ['/workspace/.env', '/outside/credentials.json'],
		});
		const message = prepared?.confirmationMessages?.message;

		assert.deepStrictEqual({
			title: prepared?.confirmationMessages?.title,
			messageContainsFiles: typeof message !== 'string'
				&& message?.value.includes('/workspace/.env')
				&& message.value.includes('/outside/credentials.json'),
			allowAutoConfirm: prepared?.confirmationMessages?.allowAutoConfirm,
		}, {
			title: 'Upload Files?',
			messageContainsFiles: true,
			allowAutoConfirm: true,
		});
	});

	test('does not confirm file chooser dismissal or modal handling', async () => {
		const results = await Promise.all([
			prepare({ pageId: 'page-1', selectFiles: [] }),
			prepare({ pageId: 'page-1', acceptModal: true }),
		]);

		assert.deepStrictEqual(results.map(result => result?.confirmationMessages), [undefined, undefined]);
	});

	suite('upload approval flow', () => {
		const sessionResource = LocalChatSessionUri.forSession('upload');
		let service: LanguageModelToolsService;
		let confirmationService: LanguageModelToolsConfirmationService;
		let chatService: MockChatService;
		let uploads: { sessionId: string; pageId: string; files: string[] }[];
		let callId: number;

		setup(() => {
			uploads = [];
			callId = 0;
			const configurationService = new TestConfigurationService();
			configurationService.setUserConfiguration(ChatConfiguration.GlobalAutoApprove, false);
			const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, store);
			chatService = new MockChatService();
			chatService.addSession(upcastPartial<IChatModel>({
				sessionId: 'upload',
				sessionResource,
				workingDirectory: URI.file('/workspace'),
				getRequests: () => [upcastPartial<IChatRequestModel>({ id: 'upload-request' })],
			}));
			instantiationService.stub(IChatService, chatService);
			instantiationService.stub(IToolResultCompressor, upcastPartial<IToolResultCompressor>({ maybeCompress: () => undefined }));
			instantiationService.stub(IChatToolRiskAssessmentService, upcastPartial<IChatToolRiskAssessmentService>({ isEnabled: () => false }));
			instantiationService.stub(IPlaywrightService, upcastPartial<IPlaywrightService>({
				replyToFileChooser: async (sessionId, pageId, files) => {
					uploads.push({ sessionId, pageId, files });
					return { summary: 'Selected files' };
				},
			}));
			confirmationService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
			instantiationService.stub(ILanguageModelToolsConfirmationService, confirmationService);
			const contribution = store.add(instantiationService.createInstance(HandleDialogBrowserToolConfirmationContribution));
			store.add(confirmationService.registerConfirmationContribution(HandleDialogBrowserToolId, contribution));
			service = store.add(instantiationService.createInstance(LanguageModelToolsService));
			store.add(service.registerTool(HandleDialogBrowserToolData, instantiationService.createInstance(HandleDialogBrowserTool)));
		});

		async function startUpload(files: string[], overrides: Partial<Pick<IToolInvocation, 'preApproved' | 'preToolUseResult'>> = {}) {
			const published = new DeferredPromise<ChatToolInvocation>();
			chatService.appendProgress = (_request, progress) => {
				if (progress instanceof ChatToolInvocation) {
					void published.complete(progress);
				}
			};
			const cancellation = new CancellationTokenSource();
			store.add(toDisposable(() => cancellation.dispose(true)));
			const result = service.invokeTool({
				callId: String(++callId),
				toolId: HandleDialogBrowserToolId,
				parameters: { pageId: 'page-1', selectFiles: files },
				context: { sessionResource },
				...overrides,
			}, async () => 0, cancellation.token);
			const invocation = await Promise.race([
				published.p,
				result.then(() => { throw new Error('Upload completed without publishing its invocation'); }),
			]);
			return { invocation, result };
		}

		test('does not select files until the upload is approved', async () => {
			const { invocation, result } = await startUpload(['/external/file.txt']);
			const beforeApproval = { state: invocation.state.get().type, uploads: [...uploads] };
			IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction });
			await result;

			assert.deepStrictEqual({ beforeApproval, uploads }, {
				beforeApproval: { state: IChatToolInvocation.StateKind.WaitingForConfirmation, uploads: [] },
				uploads: [{ sessionId: sessionResource.toString(), pageId: 'page-1', files: ['/external/file.txt'] }],
			});
		});

		test('denying an upload never selects files', async () => {
			const { invocation, result } = await startUpload(['/external/file.txt']);
			const rejected = assert.rejects(result, isCancellationError);
			IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.Denied });
			await rejected;
			assert.deepStrictEqual(uploads, []);
		});

		test('non-array file selections throw validation errors without selecting files', async () => {
			const inputs = ['/external/file.txt', { length: 1 }, 42, null];
			for (const selectFiles of inputs) {
				await assert.rejects(service.invokeTool({
					callId: String(++callId),
					toolId: HandleDialogBrowserToolId,
					parameters: { pageId: 'page-1', selectFiles },
					context: { sessionResource },
				}, async () => 0, CancellationToken.None), {
					message: 'Invalid parameters. Either \'selectFiles\' or \'acceptModal\' must be provided.',
				});
			}
			assert.deepStrictEqual(uploads, []);
		});

		test('invalid uploads cannot create folder grants or select files, even with pre-approval', async () => {
			const pathError = 'Invalid parameters. \'selectFiles\' must contain only nonempty absolute file paths.';
			const conflictError = 'Invalid parameters. \'selectFiles\' cannot be used with \'acceptModal\' or \'promptText\'.';
			const inputs = [
				{ parameters: { pageId: 'page-1', selectFiles: [''] }, error: pathError },
				{ parameters: { pageId: 'page-1', selectFiles: ['file.txt'] }, error: pathError },
				{ parameters: { pageId: 'page-1', selectFiles: ['../file.txt'] }, error: pathError },
				{ parameters: { pageId: 'page-1', selectFiles: ['/external/file.txt', ''] }, error: pathError },
				{ parameters: { pageId: 'page-1', selectFiles: [null] }, error: pathError },
				{ parameters: { pageId: 'page-1', selectFiles: [42] }, error: pathError },
				{ parameters: { pageId: 'page-1', selectFiles: ['/external/file.txt'], acceptModal: true }, error: conflictError },
				{ parameters: { pageId: 'page-1', selectFiles: ['/external/file.txt'], promptText: 'text' }, error: conflictError },
				{ parameters: { selectFiles: ['/external/file.txt'] }, error: 'No page ID provided. Use \'open_browser_page\' first.' },
			];
			for (const { parameters, error } of inputs) {
				const ref = {
					toolId: HandleDialogBrowserToolId,
					source: HandleDialogBrowserToolData.source,
					parameters,
					chatSessionResource: sessionResource,
				};
				const actions = confirmationService.getPreConfirmActions(ref);
				for (const action of actions) {
					await action.select();
				}
				await assert.rejects(prepare(parameters), { message: error });
				for (const preApproved of [undefined, { type: ToolConfirmKind.UserAction } satisfies ConfirmedReason]) {
					await assert.rejects(service.invokeTool({
						callId: String(++callId),
						toolId: HandleDialogBrowserToolId,
						parameters,
						context: { sessionResource },
						preApproved,
					}, async () => 0, CancellationToken.None), { message: error });
				}
				const result = await tool.invoke({
					callId: String(++callId),
					toolId: HandleDialogBrowserToolId,
					parameters,
					context: { sessionResource },
				}, async () => 0, { report: () => { } }, CancellationToken.None);
				assert.deepStrictEqual({
					actionCount: actions.length,
					error: result.toolResultError,
					uploads,
				}, {
					actionCount: 0,
					error,
					uploads: [],
				});
			}

			const { invocation, result } = await startUpload(['/private/example-secret.txt']);
			const state = invocation.state.get().type;
			const rejected = assert.rejects(result, isCancellationError);
			IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.Denied });
			await rejected;
			assert.deepStrictEqual({ state, uploads }, { state: IChatToolInvocation.StateKind.WaitingForConfirmation, uploads: [] });
		});

		test('respects caller pre-approval without entering confirmation', async () => {
			const reasons: ConfirmedReason[] = [
				{ type: ToolConfirmKind.Setting, id: 'autoApprove' },
				{ type: ToolConfirmKind.UserAction },
				{ type: ToolConfirmKind.ConfirmationNotNeeded },
			];
			const waiting: boolean[] = [];
			for (const preApproved of reasons) {
				const { invocation, result } = await startUpload(['/external/file.txt'], { preApproved });
				waiting.push(invocation.state.get().type === IChatToolInvocation.StateKind.WaitingForConfirmation);
				IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction });
				await result;
			}
			assert.deepStrictEqual({ waiting, uploads: uploads.length }, { waiting: [false, false, false], uploads: 3 });
		});

		test('an explicit hook ask still requires approval despite caller pre-approval', async () => {
			const { invocation, result } = await startUpload(['/external/file.txt'], {
				preApproved: { type: ToolConfirmKind.Setting, id: 'autoApprove' },
				preToolUseResult: { permissionDecision: 'ask' },
			});
			const state = invocation.state.get().type;
			const rejected = assert.rejects(result, isCancellationError);
			IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.Denied });
			await rejected;
			assert.deepStrictEqual({ state, uploads }, { state: IChatToolInvocation.StateKind.WaitingForConfirmation, uploads: [] });
		});

		test('upload-specific folder approval also covers subsequent mixed workspace uploads', async () => {
			const files = ['/external/one/file.txt', '/external/two/file.txt'];
			const first = await startUpload(files);
			const actions = confirmationService.getPreConfirmActions({
				toolId: HandleDialogBrowserToolId,
				source: HandleDialogBrowserToolData.source,
				parameters: { pageId: 'page-1', selectFiles: files },
				chatSessionResource: sessionResource,
			});
			assert.strictEqual(actions.length, 1);
			await actions[0].select();
			IChatToolInvocation.confirmWith(first.invocation, { type: ToolConfirmKind.UserAction });
			await first.result;

			const next = await startUpload(['/workspace/file.txt', '/external/one/another.txt', '/external/two/another.txt']);
			const waiting = next.invocation.state.get().type === IChatToolInvocation.StateKind.WaitingForConfirmation;
			IChatToolInvocation.confirmWith(next.invocation, { type: ToolConfirmKind.UserAction });
			await next.result;
			assert.deepStrictEqual({ label: actions[0].label, detail: actions[0].detail, waiting, uploads: uploads.length }, {
				label: 'Allow Uploads from These Folders in This Session',
				detail: 'Allow files from these folders to be uploaded to browser pages without further confirmation in this chat session.',
				waiting: false,
				uploads: 2,
			});
		});

		test('multiple files in one folder offer a single-folder upload grant', () => {
			const actions = confirmationService.getPreConfirmActions({
				toolId: HandleDialogBrowserToolId,
				source: HandleDialogBrowserToolData.source,
				parameters: { pageId: 'page-1', selectFiles: ['/external/one.txt', '/external/two.txt'] },
				chatSessionResource: sessionResource,
			});
			assert.deepStrictEqual(actions.map(({ label, detail }) => ({ label, detail })), [{
				label: 'Allow Uploads from This Folder in This Session',
				detail: 'Allow files from this folder to be uploaded to browser pages without further confirmation in this chat session.',
			}]);
		});

		test('dismissing a file chooser does not require upload approval', async () => {
			const { invocation, result } = await startUpload([]);
			const waiting = invocation.state.get().type === IChatToolInvocation.StateKind.WaitingForConfirmation;
			IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction });
			await result;
			assert.deepStrictEqual({ waiting, uploads }, {
				waiting: false,
				uploads: [{ sessionId: sessionResource.toString(), pageId: 'page-1', files: [] }],
			});
		});
	});
});
