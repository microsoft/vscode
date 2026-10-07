/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { extractArtifactsFromResponse } from '../../common/chatArtifactExtraction.js';
import { getGeneratedImageResources } from '../../common/chatImageExtraction.js';
import { IChatService, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../common/chatService/chatService.js';
import { ChatResponseResource, IChatModel, IChatRequestModel, IChatResponseModel, IResponse } from '../../common/model/chatModel.js';
import { ChatToolInvocation } from '../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatArtifactsService } from '../../common/tools/chatArtifactsService.js';
import { IToolResultInputOutputDetails, ToolDataSource } from '../../common/tools/languageModelToolsService.js';

suite('Chat generated image artifacts', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionResource = URI.parse('chat-session://test/generated-images');
	const referencedImage = URI.parse('vscode-agent-host://remote/generated-images/image?version=1');
	const details: IToolResultInputOutputDetails = {
		input: 'Draw two images',
		output: [
			{ type: 'ref', uri: referencedImage, mimeType: 'image/png' },
			{ type: 'embed', value: 'AQID', mimeType: 'image/png' },
			{ type: 'embed', value: 'Description', mimeType: 'image/png', isText: true },
		],
	};

	function imageTool(overrides: Partial<IChatToolInvocationSerialized> = {}): IChatToolInvocationSerialized {
		return {
			kind: 'toolInvocationSerialized',
			toolCallId: 'image-call',
			toolId: 'image_generation',
			toolSpecificData: { kind: 'generatedImage' },
			invocationMessage: 'Generating images',
			pastTenseMessage: 'Generated images',
			originMessage: undefined,
			presentation: undefined,
			isConfirmed: true,
			isComplete: true,
			source: ToolDataSource.Internal,
			resultDetails: details,
			...overrides,
		};
	}

	test('surfaces restored generated images without rules and does not duplicate matching rules', () => {
		const response = upcastPartial<IResponse>({ value: [imageTool()] });
		const withoutRules = extractArtifactsFromResponse(response, sessionResource, {}, {});
		const withRules = extractArtifactsFromResponse(response, sessionResource, { 'image/*': { groupName: 'Images' } }, {});

		assert.deepStrictEqual([withoutRules, withRules].map(artifacts => artifacts.map(artifact => ({
			uri: artifact.uri,
			type: artifact.type,
			toolCallId: artifact.toolCallId,
			dataPartIndex: artifact.dataPartIndex,
		}))), [0, 1].map(() => [
			{ uri: referencedImage.toString(), type: 'screenshot', toolCallId: 'image-call', dataPartIndex: 0 },
			{ uri: ChatResponseResource.createUri(sessionResource, 'image-call', 1, 'generated-image.png').toString(), type: 'screenshot', toolCallId: 'image-call', dataPartIndex: 1 },
		]));
	});

	test('does not promote ordinary, failed, denied, or cancelled tool images to generated artifacts', () => {
		const response = upcastPartial<IResponse>({
			value: [
				imageTool({ toolSpecificData: undefined }),
				imageTool({ resultDetails: { ...details, isError: true } }),
				imageTool({ resultError: 'Generation failed' }),
				imageTool({ isConfirmed: { type: ToolConfirmKind.Denied } }),
				imageTool({ isConfirmed: { type: ToolConfirmKind.Skipped } }),
			],
		});
		assert.deepStrictEqual(getGeneratedImageResources(response, sessionResource), []);
	});

	for (const confirmResults of [false, true]) {
		test(`updates artifacts when a running tool completes before its response does (confirmResults=${confirmResults})`, async () => {
			const invocation = new ChatToolInvocation({
				invocationMessage: 'Generating images',
				toolSpecificData: { kind: 'input', rawInput: 'Draw two images', imageGeneration: {} },
				confirmationMessages: confirmResults ? { confirmResults: true } : undefined,
			}, { id: 'image_generation', displayName: 'Generate Image', modelDescription: 'Generate Image', source: ToolDataSource.Internal }, 'image-call', undefined, {});
			const response = upcastPartial<IChatResponseModel>({
				id: 'response',
				onDidChange: Event.None,
				response: upcastPartial<IResponse>({ value: [invocation] }),
			});
			const model = upcastPartial<IChatModel>({
				sessionResource,
				onDidChange: Event.None,
				getRequests: () => [upcastPartial<IChatRequestModel>({ response })],
			});
			const configuration = new TestConfigurationService();
			store.add(configuration.onDidChangeConfigurationEmitter);
			const service = store.add(new ChatArtifactsService(store.add(new InMemoryStorageService()), upcastPartial<IChatService>({
				onDidCreateModel: Event.None,
				getSession: () => model,
			}), configuration));
			let artifacts: string[] = [];
			store.add(autorun(reader => {
				artifacts = service.getArtifacts(sessionResource).artifactGroups.read(reader).flatMap(group => group.artifacts.map(artifact => artifact.uri));
			}));
			const before = artifacts;
			await invocation.didExecuteTool({ content: [], toolSpecificData: { kind: 'generatedImage' }, toolResultDetails: details });
			const beforeConfirmation = confirmResults ? artifacts : undefined;
			if (confirmResults) {
				IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction });
			}

			assert.deepStrictEqual({ before, beforeConfirmation, artifacts }, {
				before: [],
				beforeConfirmation: confirmResults ? [] : undefined,
				artifacts: [referencedImage.toString(), ChatResponseResource.createUri(sessionResource, 'image-call', 1, 'generated-image.png').toString()],
			});
		});
	}
});
