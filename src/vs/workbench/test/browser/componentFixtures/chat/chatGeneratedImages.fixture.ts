/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
// eslint-disable-next-line local/code-import-patterns, local/code-amd-node-module
import { z } from 'zod';
import { DeferredPromise, retry } from '../../../../../base/common/async.js';
import { decodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { localize } from '../../../../../nls.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ChatProgressAnimation, CollapsedToolsDisplayMode, ThinkingDisplayMode } from '../../../../contrib/chat/common/constants.js';
import { ChatRequestModel } from '../../../../contrib/chat/common/model/chatModel.js';
import { ChatToolInvocation } from '../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatRequestTextPart } from '../../../../contrib/chat/common/requestParser/chatParserTypes.js';
import { CopilotToolId } from '../../../../contrib/chat/common/tools/copilotToolIds.js';
import { TestFileService } from '../../../common/workbenchTestServices.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { IFixtureMessage, renderChatWidget } from './chatWidget.fixture.js';

function createImage(width: number, height: number): string {
	const canvas = dom.$<HTMLCanvasElement>('canvas', { width, height });
	const context = canvas.getContext('2d')!;
	context.fillStyle = '#3f687c';
	context.fillRect(0, 0, width, height);
	context.fillStyle = '#e8c789';
	context.beginPath();
	context.arc(width * 0.65, height * 0.3, Math.min(width, height) * 0.15, 0, Math.PI * 2);
	context.fill();
	context.fillStyle = '#c9dfd3';
	context.beginPath();
	context.moveTo(0, height);
	context.lineTo(width * 0.4, height * 0.5);
	context.lineTo(width, height);
	context.fill();
	return canvas.toDataURL('image/png').split(',')[1];
}

async function renderGeneratedImage(context: ComponentFixtureContext, options: { width?: number; height?: number; landscape?: boolean; multiple?: boolean; progress?: ChatProgressAnimation; running?: boolean; responseComplete?: boolean; toolId?: string; reducedMotion?: boolean; failed?: boolean; earlierAttempt?: 'running' | 'failed' } = {}): Promise<void> {
	context.container.classList.add(options.reducedMotion ? 'monaco-reduce-motion' : 'monaco-enable-motion');
	const image = createImage(options.landscape ? 1600 : 800, options.landscape ? 800 : 1600);
	const failureDetails = {
		input: '{"prompt":"Draw an abstract mountain landscape"}',
		output: [{ type: 'embed' as const, value: 'Image generation returned no usable image.', isText: true, mimeType: 'text/plain' }],
		isError: true,
	};
	const tool: NonNullable<IFixtureMessage['assistant']>[number] = {
		kind: 'tool',
		toolId: options.toolId ?? CopilotToolId.GenerateImage,
		displayName: 'Generate Image',
		invocationMessage: 'Generating image',
		pastTenseMessage: options.running ? undefined : options.failed ? 'Generated image failed' : 'Generated image',
		complete: !options.running,
		toolSpecificData: options.running || options.failed ? undefined : { kind: 'generatedImage' },
		resultDetails: options.running ? undefined : options.failed ? failureDetails : {
			input: '{"prompt":"Draw an abstract mountain landscape"}',
			output: Array.from({ length: options.multiple ? 2 : 1 }, () => ({ type: 'embed' as const, value: image, mimeType: 'image/png' })),
		},
	};
	await renderChatWidget(context, {
		width: options.width ?? 760,
		height: options.height ?? (options.running ? 560 : 720),
		listHeight: options.height ?? (options.running ? 560 : 720),
		inputVisible: false,
		thinkingStyle: ThinkingDisplayMode.Collapsed,
		collapsedTools: CollapsedToolsDisplayMode.Always,
		persistentProgress: options.progress ?? ChatProgressAnimation.Off,
		collapseCompletedResponses: true,
		menuItems: MenuRegistry.getMenuItems(MenuId.ChatToolOutputResourceToolbar).filter(isIMenuItem).map(item => ({ menuId: MenuId.ChatToolOutputResourceToolbar, item })),
		messages: [{
			user: 'Generate an abstract mountain landscape',
			responseComplete: options.responseComplete ?? (!options.running && options.earlierAttempt !== 'running'),
			assistant: [
				{ kind: 'thinking', text: 'Planning the composition.' },
				...(options.earlierAttempt ? [{
					...tool,
					pastTenseMessage: options.earlierAttempt === 'failed' ? 'Generated image failed' : undefined,
					complete: options.earlierAttempt === 'failed',
					toolSpecificData: undefined,
					resultDetails: options.earlierAttempt === 'failed' ? failureDetails : undefined,
				}] : []),
				tool,
				...(!options.running && !options.failed ? [{ kind: 'markdown' as const, text: 'Here is the generated image.' }] : []),
			],
		}],
	});
	if (!options.running && !options.failed) {
		await retry(async () => {
			const images = [...context.container.querySelectorAll<HTMLImageElement>('.chat-generated-image-result img')];
			if (images.length !== (options.multiple ? 2 : 1)) {
				throw new Error('Generated image previews are not ready');
			}
			await Promise.all(images.map(image => image.decode()));
		}, 50, 20);
	}
}

const previewInput = z.object({
	enableAnimations: z.boolean().default(true),
	harness: z.enum(['Copilot', 'Codex']).default('Copilot'),
	state: z.enum(['Generating', 'Completed', 'Failed']).default('Generating'),
	earlierAttempt: z.enum(['None', 'Generating', 'Failed']).default('None'),
	narrow: z.boolean().default(false),
	reducedMotion: z.boolean().default(false),
});

const loadingLifecycleInput = z.object({
	enableAnimations: z.boolean().default(false),
	harness: z.enum(['Copilot', 'Codex']).default('Copilot'),
	source: z.enum(['Embedded', 'Referenced']).default('Embedded'),
	viewportHeight: z.number().min(240).max(900).default(300),
});

async function renderImageLoadingLifecycle(context: ComponentFixtureContext): Promise<void> {
	const { container, disposableStore } = context;
	const input = loadingLifecycleInput.parse(context.input);
	const controls = dom.append(container, dom.$('div'));
	controls.style.display = 'flex';
	controls.style.gap = 'var(--vscode-spacing-size80)';
	controls.style.marginBottom = 'var(--vscode-spacing-size120)';
	const createButton = (label: string) => {
		const button = disposableStore.add(new Button(controls, defaultButtonStyles));
		button.label = label;
		return button;
	};
	const completeButton = createButton(localize('generatedImage.fixture.complete', "Complete Generation"));
	const loadButton = input.source === 'Referenced' ? createButton(localize('generatedImage.fixture.load', "Load Image")) : undefined;
	const followupButton = createButton(localize('generatedImage.fixture.followup', "Send Follow-Up"));
	const completeFollowupButton = createButton(localize('generatedImage.fixture.completeFollowup', "Complete Follow-Up"));
	followupButton.enabled = false;
	completeFollowupButton.enabled = false;
	if (loadButton) {
		loadButton.enabled = false;
	}

	const chatContainer = dom.append(container, dom.$('div'));
	chatContainer.dataset.imageReadCount = '0';
	chatContainer.dataset.imageLoadCount = '0';
	disposableStore.add(dom.addDisposableListener(chatContainer, 'load', event => {
		if (dom.isHTMLElement(event.target) && event.target.matches('.chat-generated-image-result img')) {
			chatContainer.dataset.imageLoadCount = String(Number(chatContainer.dataset.imageLoadCount) + 1);
		}
	}, true));
	const image = createImage(800, 1200);
	const imageResource = URI.file('/fixture/generated-image.png');
	const pendingImage = new DeferredPromise<VSBuffer>();
	disposableStore.add(toDisposable(() => {
		if (!pendingImage.isSettled) {
			void pendingImage.complete(decodeBase64(image));
		}
	}));
	if (loadButton) {
		disposableStore.add(loadButton.onDidClick(() => {
			loadButton.enabled = false;
			void pendingImage.complete(decodeBase64(image));
		}));
	}

	await renderChatWidget({ ...context, container: chatContainer }, {
		width: 760,
		height: input.viewportHeight,
		listHeight: input.viewportHeight,
		defaultElementHeight: 200,
		inputVisible: false,
		persistentProgress: ChatProgressAnimation.Weave,
		collapseCompletedResponses: true,
		menuItems: MenuRegistry.getMenuItems(MenuId.ChatToolOutputResourceToolbar).filter(isIMenuItem).map(item => ({ menuId: MenuId.ChatToolOutputResourceToolbar, item })),
		additionalServices: registration => {
			registration.defineInstance(IFileService, disposableStore.add(new class extends TestFileService {
				override async readFile(resource: URI) {
					const file = await super.readFile(resource);
					if (!isEqual(resource, imageResource)) {
						return file;
					}
					chatContainer.dataset.imageReadCount = String(Number(chatContainer.dataset.imageReadCount) + 1);
					return { ...file, value: await pendingImage.p };
				}
			}()));
		},
		messages: [{
			user: 'Generate an abstract mountain landscape',
			responseComplete: false,
			assistant: [{ kind: 'thinking', text: 'Planning the composition.' }, {
				kind: 'tool',
				toolId: input.harness === 'Copilot' ? 'image_generation' : 'image_gen.imagegen',
				displayName: 'Generate Image',
				invocationMessage: 'Generating image',
				complete: false,
			}],
		}],
		onRendered: ({ model, listWidget }) => {
			let pendingFollowup: ChatRequestModel | undefined;
			const request = model.getRequests()[0];
			const tool = request.response?.response.value.find(part => part.kind === 'toolInvocation');
			if (!(tool instanceof ChatToolInvocation)) {
				throw new Error('The image generation fixture did not create its tool invocation.');
			}
			disposableStore.add(completeButton.onDidClick(async () => {
				completeButton.enabled = false;
				await tool.didExecuteTool({
					content: [],
					toolSpecificData: { kind: 'generatedImage' },
					toolResultDetails: {
						input: '{}',
						output: [input.source === 'Referenced'
							? { type: 'ref', uri: imageResource, mimeType: 'image/png' }
							: { type: 'embed', value: image, mimeType: 'image/png' }],
					},
				});
				model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Task completed: Generated the requested image.') });
				request.response?.complete();
				followupButton.enabled = true;
				if (loadButton) {
					loadButton.enabled = true;
				}
			}));
			disposableStore.add(followupButton.onDidClick(() => {
				followupButton.enabled = false;
				completeFollowupButton.enabled = true;
				const text = 'Describe the image.';
				pendingFollowup = model.addRequest({
					text,
					parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)],
				}, { variables: [] }, 0);
				listWidget.refresh();
				listWidget.scrollToEnd();
			}));
			disposableStore.add(completeFollowupButton.onDidClick(() => {
				if (!pendingFollowup) {
					throw new Error('The image loading fixture has no pending follow-up.');
				}
				model.acceptResponseProgress(pendingFollowup, { kind: 'markdownContent', content: new MarkdownString('A sun above an abstract mountain landscape.') });
				pendingFollowup.response?.complete();
				pendingFollowup = undefined;
				completeFollowupButton.enabled = false;
				followupButton.enabled = true;
			}));
		},
	});
}

export default defineThemedFixtureGroup({ path: 'chat/generatedImages/' }, {
	LoadingLifecycle: defineComponentFixture({
		virtualTime: { enabled: false },
		inputSchema: loadingLifecycleInput,
		render: renderImageLoadingLifecycle,
	}),
	Lifecycle: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		inputSchema: z.object({ enableAnimations: z.boolean().default(true) }),
		render: async context => {
			context.container.style.display = 'flex';
			context.container.style.gap = 'var(--vscode-spacing-size160)';
			for (const state of ['Generating', 'Generated', 'Failed'] as const) {
				const column = dom.append(context.container, dom.$('section'));
				const heading = dom.append(column, dom.$('h2', undefined, state));
				heading.style.fontSize = 'var(--vscode-fontSize-body1)';
				heading.style.fontWeight = 'var(--vscode-fontWeight-semiBold)';
				heading.style.margin = '0 0 var(--vscode-spacing-size120)';
				const container = dom.append(column, dom.$('div'));
				await renderGeneratedImage({ ...context, container }, {
					width: 360,
					height: 560,
					landscape: true,
					toolId: 'image_generation',
					running: state === 'Generating',
					failed: state === 'Failed',
					progress: ChatProgressAnimation.Weave,
				});
			}
		},
	}),
	Preview: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'animated' },
		inputSchema: previewInput,
		render: context => {
			const input = previewInput.parse(context.input);
			return renderGeneratedImage(context, {
				toolId: input.harness === 'Copilot' ? 'image_generation' : 'image_gen.imagegen',
				running: input.state === 'Generating',
				failed: input.state === 'Failed',
				earlierAttempt: input.earlierAttempt === 'None' ? undefined : input.earlierAttempt === 'Generating' ? 'running' : 'failed',
				width: input.narrow ? 360 : 760,
				reducedMotion: input.reducedMotion,
				progress: ChatProgressAnimation.Weave,
				landscape: true,
			});
		},
	}),
	Portrait: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderGeneratedImage(context) }),
	Landscape: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderGeneratedImage(context, { landscape: true }) }),
	Narrow: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderGeneratedImage(context, { width: 360, landscape: true }) }),
	Gallery: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderGeneratedImage(context, { multiple: true }) }),
	PersistentProgress: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderGeneratedImage(context, { progress: ChatProgressAnimation.Weave }) }),
	Running: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderGeneratedImage(context, { running: true }) }),
	CopilotGenerating: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'animated' },
		expectedVisualDescriptions: ['An unframed field of fine, open wave contours fills the normal image-loading area. Individual lines ripple in staggered phases while the overall field stays still, with softly faded edges and no panel background. No unfinished tool header or tool icon is visible; Generating image appears in the persistent footer below. Reduced motion and high contrast show still contours.'],
		render: context => renderGeneratedImage(context, { toolId: 'image_generation', running: true, progress: ChatProgressAnimation.Weave }),
	}),
	CodexGenerating: defineComponentFixture({
		labels: { kind: 'animated' },
		render: context => renderGeneratedImage(context, { toolId: 'image_gen.imagegen', running: true, progress: ChatProgressAnimation.Weave }),
	}),
	CopilotOverlapping: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		inputSchema: z.object({ enableAnimations: z.boolean().default(true) }),
		expectedVisualDescriptions: ['Two concurrent image-generation attempts share exactly one unframed wave placeholder and one Generating image footer. There is no second placeholder, empty tool row, or tool header.'],
		render: context => renderGeneratedImage(context, { toolId: 'image_generation', running: true, earlierAttempt: 'running', progress: ChatProgressAnimation.Weave }),
	}),
	CodexOverlapping: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		inputSchema: z.object({ enableAnimations: z.boolean().default(true) }),
		render: context => renderGeneratedImage(context, { toolId: 'image_gen.imagegen', running: true, earlierAttempt: 'running', progress: ChatProgressAnimation.Weave }),
	}),
	GeneratingAfterFailure: defineComponentFixture({
		labels: { kind: 'animated' },
		render: context => renderGeneratedImage(context, { toolId: 'image_generation', running: true, earlierAttempt: 'failed', progress: ChatProgressAnimation.Weave }),
	}),
	CompletedAfterFailure: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderGeneratedImage(context, { toolId: 'image_generation', earlierAttempt: 'failed', landscape: true, progress: ChatProgressAnimation.Weave }),
	}),
	GeneratingNarrow: defineComponentFixture({
		labels: { kind: 'animated' },
		render: context => renderGeneratedImage(context, { width: 360, toolId: 'image_gen.imagegen', running: true, progress: ChatProgressAnimation.Weave }),
	}),
	GeneratingReducedMotion: defineComponentFixture({
		render: context => renderGeneratedImage(context, { toolId: 'image_generation', running: true, reducedMotion: true, progress: ChatProgressAnimation.Weave }),
	}),
	Failed: defineComponentFixture({
		expectedVisualDescriptions: ['A Generated image failed tool dropdown with an error indicator remains available to inspect the prompt and failure output. There are no waves or large generated images.'],
		render: context => renderGeneratedImage(context, { toolId: 'image_generation', failed: true, progress: ChatProgressAnimation.Weave }),
	}),
	CompletedTool: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		expectedVisualDescriptions: ['A Generated image tool dropdown appears above the large generated image and its Save action. The image stays visible with the dropdown collapsed, and there is no generation waves placeholder.'],
		render: context => renderGeneratedImage(context, { responseComplete: false }),
	}),
});
