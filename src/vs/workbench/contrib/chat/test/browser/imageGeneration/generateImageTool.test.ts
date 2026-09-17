/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { ExtUri, joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { GenerateImageToolId } from '../../../../../../platform/agentHost/common/imageGenerationConstants.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService, toWorkspaceFolder, Workspace } from '../../../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { GenerateImageTool, GenerateImageToolData } from '../../../browser/imageGeneration/generateImageTool.js';
import { IGeneratedImage, IImageGenerationConfiguration, IImageGenerationCredentialsService, IImageGenerationRequest, IImageGenerationService } from '../../../common/imageGeneration.js';
import { LanguageModelPartAudience } from '../../../common/languageModels.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { isToolResultInputOutputDetails, IToolInvocation, IToolInvocationContext } from '../../../common/tools/languageModelToolsService.js';

suite('GenerateImageTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const root = URI.file('/project');
	const localSession = LocalChatSessionUri.forSession('image-test');
	const configuration: IImageGenerationConfiguration = { endpoint: 'https://images.example.test', deployment: 'image-deployment' };
	const image: IGeneratedImage = { data: VSBuffer.fromString('image-service-result'), width: 1024, height: 1024, mimeType: 'image/png' };
	let tool: GenerateImageTool;
	let fileService: FileService;
	let workspace: Workspace;
	let hidden: boolean;
	let configured: boolean;
	let calls: Array<{ request: IImageGenerationRequest; configuration: IImageGenerationConfiguration }>;
	let duringGeneration: (() => Promise<void>) | undefined;
	let realPaths: ResourceMap<URI>;

	setup(async () => {
		const instantiationService = store.add(new TestInstantiationService());
		fileService = store.add(new FileService(new NullLogService()));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		await fileService.createFolder(root);
		realPaths = new ResourceMap();
		sinon.stub(fileService, 'realpath').callsFake(async uri => realPaths.get(uri) ?? uri);
		workspace = new Workspace('image-workspace', [toWorkspaceFolder(root)], false, null, () => false);
		hidden = false;
		configured = true;
		calls = [];
		duringGeneration = undefined;
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IUriIdentityService, { extUri: new ExtUri(() => false) });
		instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => workspace });
		instantiationService.stub(IChatEntitlementService, { get sentiment() { return { hidden }; } });
		instantiationService.stub(IImageGenerationCredentialsService, {
			get configuration() { return configured ? configuration : undefined; },
			whenReady: Promise.resolve(),
		});
		instantiationService.stub(IImageGenerationService, {
			generate: async (request, connection) => {
				calls.push({ request, configuration: connection });
				await duringGeneration?.();
				return image;
			},
		});
		tool = instantiationService.createInstance(GenerateImageTool);
	});

	teardown(() => sinon.restore());

	async function prepare(parameters: Record<string, unknown>, context: IToolInvocationContext = { sessionResource: localSession }, token = CancellationToken.None): Promise<IToolInvocation> {
		const prepared = await tool.prepareToolInvocation({
			parameters,
			toolCallId: 'image-call',
			chatSessionResource: context.sessionResource,
			workingDirectory: context.workingDirectory,
		}, token);
		return {
			callId: 'image-call',
			toolId: GenerateImageToolId,
			parameters,
			context,
			toolSpecificData: prepared.toolSpecificData,
		};
	}

	async function invoke(parameters: Record<string, unknown>, context?: IToolInvocationContext, token = CancellationToken.None) {
		return tool.invoke(await prepare(parameters, context, token), async () => 0, { report() { } }, token);
	}

	test('describes costly side effects and requires pre-approval', () => {
		assert.deepStrictEqual({
			approval: GenerateImageToolData.canRequestPreApproval,
			hasEndpointArgument: Object.hasOwn(GenerateImageToolData.inputSchema?.properties ?? {}, 'endpoint'),
			clauses: ['Azure usage charges', 'never overwritten', 'Do not retry automatically', 'editing existing images'].map(clause => GenerateImageToolData.modelDescription.includes(clause)),
		}, { approval: true, hasEndpointArgument: false, clauses: [true, true, true, true] });
	});

	test('prepares a disclosure of prompt, endpoint, deployment, and project destination', async () => {
		const prepared = await tool.prepareToolInvocation({
			parameters: { prompt: 'A green tree', outputPath: 'assets/tree.png' },
			toolCallId: 'image-call',
			chatSessionResource: localSession,
		}, CancellationToken.None);
		const message = prepared.confirmationMessages?.message;
		assert.deepStrictEqual({
			title: prepared.confirmationMessages?.title,
			describes: typeof message === 'string' ? ['A green tree', configuration.endpoint, configuration.deployment, 'Azure', joinPath(root, 'assets/tree.png').fsPath].map(value => message.includes(value)) : [],
			networkCalls: calls.length,
		}, { title: 'Generate an Image', describes: [true, true, true, true, true], networkCalls: 0 });
	});

	test('returns a durable user image and textual model result without creating a file', async () => {
		const result = await invoke({ prompt: 'A green tree' });
		assert.deepStrictEqual({
			calls,
			kinds: result.content.map(part => part.kind),
			imageAudience: result.content[1].kind === 'data' ? result.content[1].audience : undefined,
			specificData: result.toolSpecificData,
			error: result.toolResultError,
			details: isToolResultInputOutputDetails(result.toolResultDetails),
		}, {
			calls: [{ request: { prompt: 'A green tree', width: 1024, height: 1024 }, configuration }],
			kinds: ['text', 'data'],
			imageAudience: [LanguageModelPartAudience.User],
			specificData: { kind: 'generatedImage' },
			error: undefined,
			details: true,
		});
	});

	test('saves an optional file in the originating session worktree, not the active workspace', async () => {
		const worktree = URI.file('/session-worktree');
		await fileService.createFolder(worktree);
		const result = await invoke({ prompt: 'A tree', outputPath: 'assets/tree.png' }, {
			sessionResource: URI.from({ scheme: 'agent-host-copilotcli', path: '/image-test' }),
			workingDirectory: worktree,
		});
		assert.deepStrictEqual({
			data: (await fileService.readFile(joinPath(worktree, 'assets/tree.png'))).value.toString(),
			wrongProject: await fileService.exists(joinPath(root, 'assets/tree.png')),
			error: result.toolResultError,
		}, { data: image.data.toString(), wrongProject: false, error: undefined });
	});

	test('resolves explicit folder names in a multi-root workspace', async () => {
		const secondRoot = URI.file('/second');
		await fileService.createFolder(secondRoot);
		workspace.folders = [toWorkspaceFolder(root), toWorkspaceFolder(secondRoot)];
		await invoke({ prompt: 'A tree', outputPath: 'second/tree.png' });
		assert.deepStrictEqual({
			expected: await fileService.exists(joinPath(secondRoot, 'tree.png')),
			wrongRoot: await fileService.exists(joinPath(root, 'tree.png')),
		}, { expected: true, wrongRoot: false });
	});

	for (const parameters of [
		{ prompt: '' },
		{ prompt: 'tree', width: 1024 },
		{ prompt: 'tree', width: 2048, height: 2048 },
		{ prompt: 'tree', endpoint: 'https://different.example.test' },
		{ prompt: 'tree', outputPath: '../tree.png' },
		{ prompt: 'tree', outputPath: '/tree.png' },
		{ prompt: 'tree', outputPath: 'C:\\tree.png' },
		{ prompt: 'tree', outputPath: 'tree.jpg' },
	]) {
		test(`rejects invalid arguments before generation: ${JSON.stringify(parameters)}`, async () => {
			await assert.rejects(invoke(parameters));
			assert.strictEqual(calls.length, 0);
		});
	}

	test('rejects existing output files before generation', async () => {
		const output = joinPath(root, 'tree.png');
		await fileService.createFile(output, VSBuffer.fromString('existing'));
		await assert.rejects(invoke({ prompt: 'tree', outputPath: 'tree.png' }));
		assert.deepStrictEqual({ calls: calls.length, data: (await fileService.readFile(output)).value.toString() }, { calls: 0, data: 'existing' });
	});

	test('rejects output through a symlink outside the project', async () => {
		const link = joinPath(root, 'link');
		await fileService.createFolder(link);
		realPaths.set(link, URI.file('/outside'));
		await assert.rejects(invoke({ prompt: 'tree', outputPath: 'link/tree.png' }), /symbolic links/);
		assert.strictEqual(calls.length, 0);
	});

	test('does not switch project destinations after confirmation', async () => {
		const invocation = await prepare({ prompt: 'tree', outputPath: 'tree.png' });
		const other = URI.file('/other');
		await fileService.createFolder(other);
		workspace.folders = [toWorkspaceFolder(other)];
		await assert.rejects(tool.invoke(invocation, async () => 0, { report() { } }, CancellationToken.None), /destination changed/);
		assert.strictEqual(calls.length, 0);
	});

	test('preserves the generated image and reports a save conflict without regenerating', async () => {
		const output = joinPath(root, 'tree.png');
		duringGeneration = async () => { await fileService.createFile(output, VSBuffer.fromString('competing file')); };
		const result = await invoke({ prompt: 'tree', outputPath: 'tree.png' });
		assert.deepStrictEqual({
			calls: calls.length,
			data: (await fileService.readFile(output)).value.toString(),
			hasImage: result.content.some(part => part.kind === 'data'),
			failure: typeof result.toolResultError === 'string' && result.toolResultError.includes('could not be saved'),
			marker: result.toolSpecificData,
		}, { calls: 1, data: 'competing file', hasImage: true, failure: true, marker: { kind: 'generatedImage' } });
	});

	test('does not follow a project symlink retargeted while generating', async () => {
		const other = URI.file('/other');
		await fileService.createFolder(other);
		duringGeneration = async () => { realPaths.set(root, other); };
		const result = await invoke({ prompt: 'tree', outputPath: 'tree.png' });
		assert.deepStrictEqual({
			calls: calls.length,
			writtenOutside: await fileService.exists(joinPath(other, 'tree.png')),
			hasImage: result.content.some(part => part.kind === 'data'),
			failure: typeof result.toolResultError === 'string' && result.toolResultError.includes('destination changed'),
		}, { calls: 1, writtenOutside: false, hasImage: true, failure: true });
	});

	test('does not save when generation is cancelled', async () => {
		const cancellation = store.add(new CancellationTokenSource());
		duringGeneration = async () => cancellation.cancel();
		await assert.rejects(invoke({ prompt: 'tree', outputPath: 'tree.png' }, undefined, cancellation.token), /Canceled/);
		assert.strictEqual(await fileService.exists(joinPath(root, 'tree.png')), false);
	});

	test('rejects missing setup, disabled AI, and unprepared calls', async () => {
		configured = false;
		await assert.rejects(invoke({ prompt: 'tree' }), /Set Up Image Generation/);
		configured = true;
		hidden = true;
		await assert.rejects(invoke({ prompt: 'tree' }), /disabled/);
		hidden = false;
		await assert.rejects(tool.invoke({
			callId: 'unprepared', toolId: GenerateImageToolId, context: { sessionResource: localSession }, parameters: { prompt: 'tree' },
		}, async () => 0, { report() { } }, CancellationToken.None), /prepared/);
		assert.strictEqual(calls.length, 0);
	});

	test('rejects remote and headless contexts', async () => {
		await assert.rejects(invoke({ prompt: 'tree', outputPath: 'tree.png' }, { sessionResource: URI.parse('agent-host-copilotcli:/test') }), /working directory is unavailable/);
		await assert.rejects(invoke({ prompt: 'tree' }, { sessionResource: URI.parse('remote-agent-host-copilotcli://host/test') }), /local Copilot chat/);
		await assert.rejects(tool.prepareToolInvocation({
			toolCallId: 'headless', parameters: { prompt: 'tree' }, chatSessionResource: undefined,
		}, CancellationToken.None), /local Copilot chat/);
		assert.strictEqual(calls.length, 0);
	});
});
