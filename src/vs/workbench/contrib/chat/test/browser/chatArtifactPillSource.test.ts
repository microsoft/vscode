/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { toAction } from '../../../../../base/common/actions.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IChatPillSection } from '../../../../browser/chatPills.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatArtifactPillSource, mergeChatArtifactSections } from '../../browser/chatArtifactPillSource.js';
import { IChatImageCarouselService } from '../../browser/chatImageCarouselService.js';
import { ChatMemoryFileResource } from '../../common/chatArtifactExtraction.js';
import { getGeneratedImageResources } from '../../common/chatImageExtraction.js';
import { IChatService, IChatToolInvocationSerialized } from '../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ChatResponseResource, IChatModel, IChatRequestModel, IChatResponseModel, IResponse } from '../../common/model/chatModel.js';
import { ChatToolInvocation } from '../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatArtifactsService, IChatArtifactsService } from '../../common/tools/chatArtifactsService.js';
import { ToolDataSource } from '../../common/tools/languageModelToolsService.js';

suite('ChatArtifactPillSource', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionResource = URI.parse('chat-session://test/images');
	const imageUri = URI.parse('vscode-agent-host://remote/opaque/image?version=1');

	function createSource(configureServices?: (instantiationService: ReturnType<typeof workbenchInstantiationService>) => void) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		const modelCreated = store.add(new Emitter<IChatModel>());
		const models = new ResourceMap<IChatModel>();
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			onDidCreateModel: modelCreated.event,
			getSession: resource => models.get(resource),
		}));
		const artifactsService = store.add(instantiationService.createInstance(ChatArtifactsService));
		instantiationService.stub(IChatArtifactsService, artifactsService);
		const openedImages: Parameters<IChatImageCarouselService['openCarouselAtResource']>[] = [];
		instantiationService.stub(IChatImageCarouselService, {
			openCarouselAtResource: async (...args) => { openedImages.push(args); },
		});
		const openedResources: string[] = [];
		instantiationService.stub(IOpenerService, {
			open: async resource => { openedResources.push(resource.toString()); return true; },
		});
		const errors: string[] = [];
		instantiationService.stub(INotificationService, {
			error: error => { errors.push(error instanceof Error ? error.message : String(error)); },
		});
		const copied: string[] = [];
		instantiationService.stub(IClipboardService, { writeText: async text => { copied.push(text); } });
		instantiationService.stub(ICommandService, { executeCommand: async () => undefined });
		configureServices?.(instantiationService);
		const currentSession = observableValue<URI | undefined>('session', sessionResource);
		const source = store.add(instantiationService.createInstance(ChatArtifactPillSource, currentSession));
		let sections: readonly IChatPillSection[] = [];
		store.add(autorun(reader => { sections = source.sections.read(reader); }));
		return {
			instantiationService, configuration, artifactsService, currentSession, source,
			openedImages, openedResources, errors, copied, sections: () => sections,
			setConfiguration: async (key: ChatConfiguration, value: boolean) => {
				await configuration.setUserConfiguration(key, value);
				configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: section => section === key }));
			},
			setTools: (tools: (ChatToolInvocation | IChatToolInvocationSerialized)[]) => {
				const response = upcastPartial<IResponse>({ value: tools });
				const model = upcastPartial<IChatModel>({
					sessionResource, onDidChange: Event.None,
					getRequests: () => [upcastPartial<IChatRequestModel>({
						response: upcastPartial<IChatResponseModel>({ id: 'response', onDidChange: Event.None, response }),
					})],
				});
				models.set(sessionResource, model);
				modelCreated.fire(model);
				return response;
			},
		};
	}

	test('live and restored generated images appear without enabling the legacy artifacts view', async () => {
		const harness = createSource();
		await harness.setConfiguration(ChatConfiguration.ArtifactsEnabled, false);
		const tool = new ChatToolInvocation({ invocationMessage: 'Generating image' }, {
			id: 'image_generation', displayName: 'Generate Image', modelDescription: 'Generate Image', source: ToolDataSource.Internal,
		}, 'image-call', undefined, {});
		const response = harness.setTools([tool]);
		const before = harness.sections();
		await tool.didExecuteTool({
			content: [], toolSpecificData: { kind: 'generatedImage' },
			toolResultDetails: { input: '', output: [{ type: 'ref', uri: imageUri, mimeType: 'image/jpeg' }] },
		});
		const snapshot = () => harness.sections().map(section => ({
			title: section.title,
			images: section.entries.map(entry => ({ label: entry.label, uri: entry.resource?.toString(), mime: entry.imagePreview?.mimeType })),
		}));
		const live = snapshot();
		harness.currentSession.set(undefined, undefined);
		harness.setTools([tool.toJSON()]);
		harness.currentSession.set(sessionResource, undefined);
		const restored = snapshot();
		const entry = harness.sections()[0].entries[0];
		harness.currentSession.set(URI.parse('chat-session://test/other'), undefined);
		entry.open();
		await timeout(0);
		const image = getGeneratedImageResources(response, sessionResource)[0];
		const expected = [{ title: 'Generated Images', images: [{ label: image.name, uri: imageUri.toString(), mime: 'image/jpeg' }] }];
		assert.deepStrictEqual({
			before, live, restored, afterSwitch: harness.sections(),
			opened: harness.openedImages.map(([uri, , options]) => ({ uri: uri.toString(), session: options?.sessionResource?.toString() })),
		}, {
			before: [], live: expected, restored: expected, afterSwitch: [],
			opened: [{ uri: imageUri.toString(), session: sessionResource.toString() }],
		});
	});

	for (const cancelled of [false, true]) {
		test(`pill save action keeps the suggested image name and original URI (cancelled=${cancelled})`, async () => {
			const target = URI.file('/saved/result.jpg');
			const reads: string[] = [];
			const writes: string[] = [];
			let suggested: string | undefined;
			const harness = createSource(instantiationService => {
				instantiationService.stub(IFileDialogService, {
					defaultFilePath: async () => URI.file('/saved'),
					showSaveDialog: async options => { suggested = options.defaultUri?.path; return cancelled ? undefined : target; },
				});
				instantiationService.stub(IFileService, {
					readFile: async resource => { reads.push(resource.toString()); return upcastPartial<IFileContent>({ value: VSBuffer.fromString('image') }); },
					writeFile: async resource => { writes.push(resource.toString()); return upcastPartial<IFileStatWithMetadata>({}); },
				});
			});
			await harness.setConfiguration(ChatConfiguration.ArtifactsEnabled, true);
			harness.artifactsService.getArtifacts(sessionResource).setAgentArtifacts([{
				label: 'Generated image', fileName: 'generated-image-a1b2c3d4e5f6.jpg', uri: imageUri.toString(), type: 'screenshot',
			}]);
			await harness.sections()[0].entries[0].toolbarActions![0].run();
			assert.deepStrictEqual({ suggested, reads, writes, errors: harness.errors }, {
				suggested: '/saved/generated-image-a1b2c3d4e5f6.jpg',
				reads: cancelled ? [] : [imageUri.toString()],
				writes: cancelled ? [] : [target.toString()],
				errors: [],
			});
		});
	}

	test('image preference and source-scoped clear actions are preserved', async () => {
		const harness = createSource();
		await harness.setConfiguration(ChatConfiguration.ArtifactsEnabled, true);
		await harness.setConfiguration(ChatConfiguration.ImageCarouselEnabled, false);
		const artifacts = harness.artifactsService.getArtifacts(sessionResource);
		artifacts.setSubagentArtifacts('child', 'Child', [{ label: 'Child image', uri: imageUri.toString(), type: 'screenshot' }]);
		artifacts.setAgentArtifacts([{ label: 'Parent file', uri: 'file:///parent.md', type: 'plan' }]);
		const imageEntry = harness.sections().flatMap(section => section.entries).find(entry => entry.label === 'Child image')!;
		imageEntry.open();
		await timeout(0);
		await imageEntry.promotedAction!.run();
		assert.deepStrictEqual({
			openedImages: harness.openedImages.length, openedResources: harness.openedResources,
			remaining: harness.sections().flatMap(section => section.entries.map(entry => entry.label)),
		}, { openedImages: 0, openedResources: [imageUri.toString()], remaining: ['Parent file'] });
	});

	test('group-only rules retain a single entry and open all known images in the originating chat', async () => {
		const harness = createSource();
		await harness.setConfiguration(ChatConfiguration.ArtifactsEnabled, true);
		const images = [0, 1].map(index => ({
			uri: URI.file(`/image-${index}.png`).toString(), label: `Image ${index}`, type: 'screenshot' as const, groupName: 'Screenshots', onlyShowGroup: true,
		}));
		harness.artifactsService.getArtifacts(sessionResource).setAgentArtifacts(images);
		const entries = harness.sections()[0].entries;
		entries[0].open();
		await timeout(0);
		assert.deepStrictEqual({
			labels: entries.map(entry => entry.label),
			opened: harness.openedImages.map(([uri, , options]) => ({
				first: uri.toString(), session: options?.sessionResource?.toString(), images: options?.additionalImages?.map(image => image.uri.toString()),
			})),
		}, {
			labels: ['Screenshots (2)'],
			opened: [{ first: images[0].uri, session: sessionResource.toString(), images: images.map(image => image.uri) }],
		});
	});

	test('unresolvable memory and failed saves surface errors', async () => {
		const harness = createSource(instantiationService => {
			instantiationService.stub(IFileDialogService, {
				defaultFilePath: async () => { throw new Error('Save failed'); },
			});
		});
		await harness.setConfiguration(ChatConfiguration.ArtifactsEnabled, true);
		harness.artifactsService.getArtifacts(sessionResource).setAgentArtifacts([{
			label: 'Memory', uri: ChatMemoryFileResource.createUri('/memory.md', sessionResource).toString(), type: 'plan',
		}]);
		harness.sections()[0].entries[0].open();
		await harness.sections()[0].entries[0].toolbarActions![0].run();
		await timeout(0);
		assert.deepStrictEqual(harness.errors.sort(), ['Save failed', 'The memory artifact could not be resolved.']);
	});

	test('deduplicates decorative image names while preserving recorded artifact removal', async () => {
		const oldUri = ChatResponseResource.createUri(sessionResource, 'tool', 0, 'image.png');
		const newUri = ChatResponseResource.createUri(sessionResource, 'tool', 0, 'generated-image-abc.png');
		let removed = false;
		const remove = toAction({ id: 'remove', label: 'Remove Artifact', run: () => { removed = true; } });
		const sections = mergeChatArtifactSections(
			[{ title: 'Files', entries: [{ id: 'recorded', label: 'image.png', resource: oldUri, promotedAction: remove, open: () => { } }] }],
			[{ title: 'Generated Images', entries: [{ id: 'generated', label: 'generated-image-abc.png', resource: newUri, open: () => { } }] }],
		);
		await sections[0].entries[0].promotedAction!.run();
		assert.deepStrictEqual({
			sections: sections.map(section => ({ title: section.title, entries: section.entries.map(entry => ({ id: entry.id, label: entry.label, resource: entry.resource?.toString() })) })),
			removed,
		}, {
			sections: [{ title: 'Generated Images', entries: [{ id: 'recorded', label: 'generated-image-abc.png', resource: newUri.toString() }] }],
			removed: true,
		});
	});
});
