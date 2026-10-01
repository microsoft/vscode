/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IRadioOptionItem, Radio } from '../../../../../base/browser/ui/radio/radio.js';
// eslint-disable-next-line local/code-import-patterns, local/code-amd-node-module
import { z } from 'zod';
import { DeferredPromise, retry } from '../../../../../base/common/async.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { localize } from '../../../../../nls.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ChatProgressAnimation, CollapsedToolsDisplayMode, ThinkingDisplayMode } from '../../../../contrib/chat/common/constants.js';
import { ChatRequestModel } from '../../../../contrib/chat/common/model/chatModel.js';
import { ChatToolInvocation } from '../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatRequestTextPart } from '../../../../contrib/chat/common/requestParser/chatParserTypes.js';
import { TestFileService } from '../../../common/workbenchTestServices.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { fixtureResourceUri, readFixtureBinaryResource } from '../fixtureResourceLoader.js';
import { FixtureMotionAccessibilityService } from './chatFixtureUtils.js';
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
		toolId: options.toolId ?? 'image_generation',
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
		additionalServices: registration => registration.defineInstance(IAccessibilityService, new FixtureMotionAccessibilityService(context.container, context.disposableStore)),
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
	harness: z.enum(['Copilot', 'Codex', 'Mock']).default('Copilot'),
	source: z.enum(['Embedded', 'Referenced']).default('Embedded'),
	viewportHeight: z.number().min(240).max(900).default(300),
	sampleImage: z.boolean().default(false),
	reducedMotion: z.boolean().default(false),
	narrow: z.boolean().default(false),
});

/** Base64 image data and its MIME type, for previewing the reveal with any image. */
interface IFixtureImageData {
	readonly data: string;
	readonly mimeType: string;
}

async function renderImageLoadingLifecycle(context: ComponentFixtureContext, customImage?: IFixtureImageData): Promise<void> {
	const { container, disposableStore } = context;
	const input = loadingLifecycleInput.parse(context.input);
	container.classList.add(input.reducedMotion ? 'monaco-reduce-motion' : 'monaco-enable-motion');
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
	const image = customImage?.data ?? (input.sampleImage
		? encodeBase64(VSBuffer.wrap(new Uint8Array(await readFixtureBinaryResource(fixtureResourceUri('src/vs/platform/agentHost/node/copilot/media/imageGenerationMock.png')))))
		: createImage(800, 1200));
	const mimeType = customImage?.mimeType ?? 'image/png';
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
		width: input.narrow ? 360 : 760,
		height: input.viewportHeight,
		listHeight: input.viewportHeight,
		defaultElementHeight: 200,
		inputVisible: false,
		persistentProgress: ChatProgressAnimation.Draw,
		collapseCompletedResponses: true,
		menuItems: MenuRegistry.getMenuItems(MenuId.ChatToolOutputResourceToolbar).filter(isIMenuItem).map(item => ({ menuId: MenuId.ChatToolOutputResourceToolbar, item })),
		additionalServices: registration => {
			registration.defineInstance(IAccessibilityService, new FixtureMotionAccessibilityService(container, disposableStore));
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
				toolId: input.harness === 'Mock' ? 'generate_image_mock' : input.harness === 'Copilot' ? 'image_generation' : 'image_gen.imagegen',
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
							? { type: 'ref', uri: imageResource, mimeType }
							: { type: 'embed', value: image, mimeType }],
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

/** An option of a reveal lab's knob. */
interface ILabOption {
	readonly text: string;
	readonly tooltip?: string;
}

/** A knob of a reveal lab: a labeled row of options, one of which is selected. */
interface ILabKnob {
	readonly label: string;
	readonly options: readonly ILabOption[];
	/** Index of the option that is selected at first. */
	readonly active?: number;
	/** Whether the knob spans every column of the lab's controls. */
	readonly wide?: boolean;
}

/** An image to preview a reveal with, or the bundled sample when it has no data. */
interface ILabImage extends ILabOption {
	readonly image?: IFixtureImageData;
}

/** Images uploaded to any reveal lab, which every lab then offers for the rest of the session. */
const labUploads: ILabImage[] = [];

/** Appends a labeled row with a segmented picker to a reveal lab's controls. */
function appendLabPicker(controls: HTMLElement, store: DisposableStore, label: string, items: readonly IRadioOptionItem[], active = 0, wide = false): { picker: Radio; row: HTMLElement } {
	const cell = dom.append(controls, dom.$('div'));
	cell.style.minWidth = '0';
	if (wide) {
		cell.style.gridColumn = '1 / -1';
	}
	const heading = dom.append(cell, dom.$('div', undefined, label));
	heading.style.fontSize = 'var(--vscode-fontSize-label2)';
	heading.style.color = 'var(--vscode-descriptionForeground)';
	heading.style.marginBottom = 'var(--vscode-spacing-size40)';
	const row = dom.append(cell, dom.$('div'));
	row.style.display = 'flex';
	row.style.flexWrap = 'wrap';
	row.style.alignItems = 'center';
	row.style.gap = 'var(--vscode-spacing-size80)';
	row.style.marginBottom = 'var(--vscode-spacing-size80)';
	const picker = store.add(new Radio({
		items: items.map((item, index) => ({ ...item, ariaLabel: item.ariaLabel ?? item.text, isActive: index === active })),
		ariaLabel: label,
		className: 'segmented',
	}));
	row.appendChild(picker.domNode);
	picker.domNode.style.flexWrap = 'wrap';
	return { picker, row };
}

/**
 * Renders a lab that previews the image-generation mock's loading and reveal: a picker for each
 * knob, a picker of images that also takes uploads, and the preview, which restarts whenever any
 * of them changes. `apply` styles the preview for the selected option of every knob and returns
 * a description of them, and `onDidSelect` may select options of other knobs when one changes.
 */
async function renderRevealLab(context: ComponentFixtureContext, options: {
	readonly knobs: readonly ILabKnob[];
	readonly images: readonly ILabImage[];
	/** Columns that the knobs are laid out in when there is room. */
	readonly columns?: number;
	readonly apply: (preview: HTMLElement, selected: readonly number[]) => string;
	readonly onDidSelect?: (knob: number, selected: number[]) => void;
}): Promise<void> {
	const { disposableStore } = context;
	const input = loadingLifecycleInput.parse(context.input);
	const controls = dom.append(context.container, dom.$('div'));
	controls.style.width = input.narrow ? '360px' : '760px';
	controls.style.maxWidth = '100%';
	controls.style.display = 'grid';
	controls.style.gridTemplateColumns = (options.columns ?? 1) > 1 ? `repeat(auto-fill, minmax(${Math.floor(720 / (options.columns ?? 1))}px, 1fr))` : '1fr';
	controls.style.columnGap = 'var(--vscode-spacing-size160)';
	const selected = options.knobs.map(knob => knob.active ?? 0);
	const pickers = options.knobs.map((knob, index) => appendLabPicker(controls, disposableStore, knob.label, knob.options, selected[index], knob.wide).picker);

	const images = [...options.images, ...labUploads];
	let image = images[0];
	const shortName = (name: string) => name.length > 20 ? `${name.slice(0, 19)}…` : name;
	const imageItems = (active: number) => images.map((item, index) => ({ text: shortName(item.text), tooltip: item.tooltip, ariaLabel: item.text, isActive: index === active }));
	const { picker: imagePicker, row: imageRow } = appendLabPicker(controls, disposableStore, localize('generatedImage.fixture.image', "Image"), imageItems(0));
	const fileInput = dom.append(imageRow, dom.$<HTMLInputElement>('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', multiple: '', tabindex: '-1', 'aria-hidden': 'true' }));
	fileInput.style.display = 'none';
	const upload = disposableStore.add(new Button(imageRow, { ...defaultButtonStyles, secondary: true }));
	upload.label = localize('generatedImage.fixture.upload', "Upload Images...");
	upload.element.style.width = 'fit-content';

	const description = dom.append(controls, dom.$('div'));
	description.style.gridColumn = '1 / -1';
	description.style.color = 'var(--vscode-descriptionForeground)';
	description.style.fontSize = 'var(--vscode-fontSize-body2)';
	description.style.marginBottom = 'var(--vscode-spacing-size120)';
	const restartRow = dom.append(controls, dom.$('div'));
	restartRow.style.gridColumn = '1 / -1';
	const restart = disposableStore.add(new Button(restartRow, { ...defaultButtonStyles, secondary: true }));
	restart.label = localize('generatedImage.fixture.restart', "Restart Preview");
	restart.element.style.width = 'fit-content';
	restart.element.style.marginBottom = 'var(--vscode-spacing-size80)';

	const preview = dom.append(context.container, dom.$('div'));
	const previewStore = disposableStore.add(new DisposableStore());
	const allPickers = [...pickers, imagePicker];
	const render = async () => {
		restart.enabled = false;
		upload.enabled = false;
		allPickers.forEach(picker => picker.setEnabled(false));
		try {
			previewStore.clear();
			dom.clearNode(preview);
			preview.className = '';
			preview.removeAttribute('style');
			description.textContent = options.apply(preview, selected);
			await renderImageLoadingLifecycle({
				...context,
				container: preview,
				disposableStore: previewStore,
				input: { ...input, harness: 'Mock', sampleImage: true, viewportHeight: 720 },
			}, image.image);
		} finally {
			restart.enabled = true;
			upload.enabled = true;
			allPickers.forEach(picker => picker.setEnabled(true));
		}
	};
	disposableStore.add(restart.onDidClick(render));
	pickers.forEach((picker, knob) => disposableStore.add(picker.onDidSelect(async index => {
		selected[knob] = index;
		const before = [...selected];
		options.onDidSelect?.(knob, selected);
		selected.forEach((value, other) => {
			if (value !== before[other]) {
				pickers[other].setActiveItem(value);
			}
		});
		await render();
	})));
	disposableStore.add(imagePicker.onDidSelect(async index => {
		image = images[index];
		await render();
	}));
	disposableStore.add(upload.onDidClick(() => fileInput.click()));
	disposableStore.add(dom.addDisposableListener(fileInput, 'change', async () => {
		const files = [...fileInput.files ?? []];
		fileInput.value = '';
		if (!files.length) {
			return;
		}
		const first = images.length;
		for (const file of files) {
			const uploaded = { text: file.name, tooltip: file.name, image: { data: encodeBase64(VSBuffer.wrap(new Uint8Array(await file.arrayBuffer()))), mimeType: file.type || 'image/png' } };
			labUploads.push(uploaded);
			images.push(uploaded);
		}
		image = images[first];
		imagePicker.setItems(imageItems(first));
		await render();
	}));
	await render();
}

/** The bundled sample, which is square, and a wide landscape. */
function sampleLabImages(): ILabImage[] {
	return [
		{ text: localize('generatedImage.fixture.sampleImage', "Sample"), tooltip: localize('generatedImage.fixture.sampleImage.detail', "The bundled sample image.") },
		{ text: localize('generatedImage.fixture.mountainsImage', "Mountains"), tooltip: localize('generatedImage.fixture.mountainsImage.detail', "A wide landscape with a few bold shapes."), image: { data: createImage(1600, 900), mimeType: 'image/png' } },
	];
}

export default defineThemedFixtureGroup({ path: 'chat/generatedImages/' }, {
	CometReveal: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'animated' },
		inputSchema: z.object({
			enableAnimations: z.boolean().default(true),
			reducedMotion: z.boolean().default(false),
			narrow: z.boolean().default(false),
			source: z.enum(['Embedded', 'Referenced']).default('Embedded'),
		}),
		render: context => {
			// Each reveal belongs to a family whose loader it continues best; switching family picks that loader.
			const treatments = [
				{ id: 'blue-scan', family: 'comet', text: localize('generatedImage.fixture.blueScan', "Blue Scan"), tooltip: localize('generatedImage.fixture.blueScan.detail', "The line traces the frame, then a feathered blue veil leaves a sharp image behind.") },
				{ id: 'frosted-scan', family: 'comet', text: localize('generatedImage.fixture.frostedScan', "Frosted Scan"), tooltip: localize('generatedImage.fixture.frostedScan.detail', "The line traces the frame, then a deeper frosted blur clears with just a hint of blue.") },
				{ id: 'gentle-focus', family: 'comet', text: localize('generatedImage.fixture.gentleFocus', "Gentle Focus"), tooltip: localize('generatedImage.fixture.gentleFocus.detail', "The line traces the frame, then a quiet, low-blur dissolve brings the image into focus.") },
				{ id: 'dither-resolve', family: 'dither', text: localize('generatedImage.fixture.ditherResolve', "Dither Resolve"), tooltip: localize('generatedImage.fixture.ditherResolve.detail', "The band opens into the frame, then the wave sweeps across and develops the image as blocky dithered pixels that sharpen, take on the image's palette, and then its true colors.") },
				{ id: 'dither-print', family: 'dither', text: localize('generatedImage.fixture.ditherPrint', "Dither Print"), tooltip: localize('generatedImage.fixture.ditherPrint.detail', "The band becomes a print head that prints the image line by line, then finer passes sharpen it and bring in its palette and colors.") },
				{ id: 'dither-bloom', family: 'dither', text: localize('generatedImage.fixture.ditherBloom', "Dither Bloom"), tooltip: localize('generatedImage.fixture.ditherBloom.detail', "The image blooms out of the wave's head, and each ring that follows sharpens it or adds its colors.") },
				{ id: 'ascii-resolve', family: 'glyphs', text: localize('generatedImage.fixture.asciiResolve', "ASCII Resolve"), tooltip: localize('generatedImage.fixture.asciiResolve.detail', "The band opens into the frame, then the glyph wave draws the image in glyphs that get finer, take on its palette, and then its true colors.") },
				{ id: 'ascii-decode', family: 'glyphs', text: localize('generatedImage.fixture.asciiDecode', "ASCII Decode"), tooltip: localize('generatedImage.fixture.asciiDecode.detail', "Scrambled glyphs spread from the wave's head and lock into a glyph drawing of the image, which decodes again finer and in color.") },
			];
			const loadingLines = [
				{ id: 'comet', text: localize('generatedImage.fixture.comet', "Comet"), tooltip: localize('generatedImage.fixture.comet.detail', "Comet pairs a fine bright head with a long, fading tail.") },
				{ id: 'dither', text: localize('generatedImage.fixture.ditherWave', "Dither Wave"), tooltip: localize('generatedImage.fixture.ditherWave.detail', "Dither Wave sweeps a one-bit dithered wave through a short band of twinkling pixels.") },
				{ id: 'glyphs', text: localize('generatedImage.fixture.glyphWave', "Glyph Wave"), tooltip: localize('generatedImage.fixture.glyphWave.detail', "Glyph Wave sweeps a wave of denser glyphs through a short band of flickering binary digits.") },
			];
			const speeds = [0.25, 0.5, 1, 2].map(value => ({ value, text: localize('generatedImage.fixture.speedValue', "{0}×", value) }));
			let family = treatments[0].family;
			return renderRevealLab(context, {
				knobs: [
					{ label: localize('generatedImage.fixture.treatment', "Image reveal"), options: treatments },
					{ label: localize('generatedImage.fixture.loading', "Loading"), options: loadingLines },
					{ label: localize('generatedImage.fixture.speed', "Speed"), options: speeds, active: speeds.findIndex(speed => speed.value === 1) },
				],
				images: sampleLabImages(),
				apply: (preview, [treatment, line, speed]) => {
					preview.classList.add(`chat-image-reveal-variant-${treatments[treatment].id}`, `chat-image-line-variant-${loadingLines[line].id}`);
					// A speed of 0.5× plays every loading and reveal motion twice as long.
					preview.style.setProperty('--chat-image-motion-scale', String(1 / speeds[speed].value));
					return localize('generatedImage.fixture.selectionDescription', "{0} {1}", loadingLines[line].tooltip, treatments[treatment].tooltip);
				},
				onDidSelect: (knob, selected) => {
					if (knob === 0 && treatments[selected[0]].family !== family) {
						family = treatments[selected[0]].family;
						selected[1] = loadingLines.findIndex(line => line.id === family);
					}
				},
			});
		},
	}),
	GlyphRevealV2: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		inputSchema: z.object({
			enableAnimations: z.boolean().default(true),
			reducedMotion: z.boolean().default(false),
			narrow: z.boolean().default(false),
		}),
		render: context => {
			const loaders = [
				{ id: 'wave', text: localize('generatedImage.lab.wave', "Glyph Wave"), tooltip: localize('generatedImage.lab.wave.detail', "A dense wave of glyphs sweeps through binary digits that spell HAPPY_CODING!.") },
				{ id: 'comets', text: localize('generatedImage.lab.comets', "Comets"), tooltip: localize('generatedImage.lab.comets.detail', "Short streaks of glyphs race along the band, each at its own speed, and leave lit digits in their wake.") },
				{ id: 'stream', text: localize('generatedImage.lab.stream', "Bit Stream"), tooltip: localize('generatedImage.lab.stream.detail', "Each row shifts the bits of HAPPY_CODING! along at its own tempo, and every few bytes one is lit.") },
				{ id: 'ripples', text: localize('generatedImage.lab.ripples', "Ripples"), tooltip: localize('generatedImage.lab.ripples.detail', "Drops land in the band and spread rings of glyphs that light the digits they pass.") },
				{ id: 'typewriter', text: localize('generatedImage.lab.typewriter', "Typewriter"), tooltip: localize('generatedImage.lab.typewriter.detail', "A cursor types HAPPY_CODING! out in binary, a few characters to a line, and the lines scroll.") },
				{ id: 'tide', text: localize('generatedImage.lab.tide', "Tide"), tooltip: localize('generatedImage.lab.tide.detail', "Broad, soft swells of brighter digits roll through the band, and a few glyphs sparkle on their crests.") },
			];
			const reveals = [
				{ id: 'ascii-resolve', text: localize('generatedImage.lab.asciiResolve', "ASCII Resolve"), tooltip: localize('generatedImage.lab.asciiResolve.detail', "The frame grows from the band to the image's width and height, then glyph waves draw the image, each pass sharper than the last, before it gets finer and takes on its palette and colors.") },
				{ id: 'ascii-decode', text: localize('generatedImage.lab.asciiDecode', "ASCII Decode"), tooltip: localize('generatedImage.lab.asciiDecode.detail', "The frame grows from the band to the image's width and height while scrambled glyphs spread and lock into a drawing of the image, which decodes again finer and in color.") },
			];
			const directions = [
				{ id: 'right', text: localize('generatedImage.lab.right', "Right") },
				{ id: 'left', text: localize('generatedImage.lab.left', "Left") },
				{ id: 'down', text: localize('generatedImage.lab.down', "Down") },
				{ id: 'up', text: localize('generatedImage.lab.up', "Up") },
				{ id: 'diagonal', text: localize('generatedImage.lab.diagonal', "Diagonal") },
				{ id: 'outward', text: localize('generatedImage.lab.outward', "Outward") },
				{ id: 'alternate', text: localize('generatedImage.lab.alternate', "Back and Forth") },
			];
			const densities = [
				{ value: 0, text: localize('generatedImage.lab.sparse', "Sparse") },
				{ value: 0.25, text: localize('generatedImage.lab.light', "Light") },
				{ value: 0.5, text: localize('generatedImage.lab.medium', "Medium") },
				{ value: 0.75, text: localize('generatedImage.lab.dense', "Dense") },
				{ value: 1, text: localize('generatedImage.lab.full', "Full") },
			];
			const pixels = (value: number) => localize('generatedImage.lab.pixels', "{0}px", value);
			const sizes = [6, 8, 10, 12].map(value => ({ value, text: pixels(value) }));
			const passes = [1, 2, 3, 4, 5, 6].map(value => ({ value, text: String(value), tooltip: localize('generatedImage.lab.passes.detail', "How many glyph waves ASCII Resolve sweeps before the image shows.") }));
			const widths = [240, 320, 400].map(value => ({ value, text: pixels(value) }));
			const speeds = [0.25, 0.5, 1, 2, 3].map(value => ({ value, text: localize('generatedImage.lab.speedValue', "{0}×", value) }));
			const normalSpeed = speeds.findIndex(speed => speed.value === 1);
			const resizeOrders = [
				{ id: 'width-first', text: localize('generatedImage.lab.widthFirst', "Width First"), tooltip: localize('generatedImage.lab.widthFirst.detail', "The frame grows or narrows to the image's width, and then opens to its height.") },
				{ id: 'height-first', text: localize('generatedImage.lab.heightFirst', "Height First"), tooltip: localize('generatedImage.lab.heightFirst.detail', "The frame opens to the image's height, and then grows or narrows to its width.") },
				{ id: 'together', text: localize('generatedImage.lab.together', "Together"), tooltip: localize('generatedImage.lab.together.detail', "The frame changes its width and height at once.") },
			];
			return renderRevealLab(context, {
				columns: 2,
				knobs: [
					{ label: localize('generatedImage.lab.loading', "Loading"), options: loaders, wide: true },
					{ label: localize('generatedImage.lab.reveal', "Image Reveal"), options: reveals },
					{ label: localize('generatedImage.lab.passes', "Passes"), options: passes, active: 2 },
					{ label: localize('generatedImage.lab.direction', "Direction"), options: directions, wide: true },
					{ label: localize('generatedImage.lab.density', "Density"), options: densities, active: 2 },
					{ label: localize('generatedImage.lab.glyphSize', "Glyph Size"), options: sizes, active: 2 },
					{ label: localize('generatedImage.lab.startSpeed', "Start Speed"), options: speeds, active: normalSpeed },
					{ label: localize('generatedImage.lab.endSpeed', "End Speed"), options: speeds, active: normalSpeed },
					{ label: localize('generatedImage.lab.loadingWidth', "Loading Width"), options: widths, active: 1 },
					{ label: localize('generatedImage.lab.resize', "Resize"), options: resizeOrders },
				],
				images: [
					...sampleLabImages(),
					{ text: localize('generatedImage.lab.portraitImage', "Portrait"), tooltip: localize('generatedImage.lab.portraitImage.detail', "A tall image, narrower than the band, so the frame narrows onto it."), image: { data: createImage(900, 1350), mimeType: 'image/png' } },
					{ text: localize('generatedImage.lab.panoramaImage', "Panorama"), tooltip: localize('generatedImage.lab.panoramaImage.detail', "A very wide image, so the frame grows well past the band."), image: { data: createImage(2400, 900), mimeType: 'image/png' } },
				],
				apply: (preview, [loader, reveal, pass, direction, density, size, start, end, width, order]) => {
					// Images keep their own size, so the frame grows or narrows from the fixed-width band to fit them.
					preview.classList.add(`chat-image-reveal-variant-${reveals[reveal].id}`, 'chat-image-line-variant-glyphs', 'chat-image-natural-size');
					const glyphSize = sizes[size].value;
					preview.style.setProperty('--chat-image-glyph-loader', loaders[loader].id);
					preview.style.setProperty('--chat-image-glyph-direction', directions[direction].id);
					preview.style.setProperty('--chat-image-glyph-fill', String(densities[density].value));
					preview.style.setProperty('--chat-image-glyph-size', `${glyphSize}px`);
					// The band holds whole rows of glyphs, about 48 pixels' worth.
					preview.style.setProperty('--chat-image-loading-height', `${glyphSize * Math.round(48 / glyphSize)}px`);
					preview.style.setProperty('--chat-image-loading-width', `${widths[width].value}px`);
					preview.style.setProperty('--chat-image-reveal-resize-order', resizeOrders[order].id);
					preview.style.setProperty('--chat-image-reveal-passes', String(passes[pass].value));
					// The loading band moves at the start speed, and the reveal eases from it to the end speed.
					preview.style.setProperty('--chat-image-motion-scale', String(1 / speeds[start].value));
					preview.style.setProperty('--chat-image-motion-scale-end', String(1 / speeds[end].value));
					return localize('generatedImage.lab.description', "{0} {1}", loaders[loader].tooltip, reveals[reveal].tooltip);
				},
			});
		},
	}),
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
					progress: ChatProgressAnimation.Draw,
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
				progress: ChatProgressAnimation.Draw,
				landscape: true,
			});
		},
	}),
	Portrait: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderGeneratedImage(context) }),
	Landscape: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderGeneratedImage(context, { landscape: true }) }),
	Narrow: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderGeneratedImage(context, { width: 360, landscape: true }) }),
	Gallery: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderGeneratedImage(context, { multiple: true }) }),
	PersistentProgress: defineComponentFixture({ virtualTime: { enabled: false }, render: context => renderGeneratedImage(context, { progress: ChatProgressAnimation.Draw }) }),
	Running: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderGeneratedImage(context, { running: true }) }),
	CopilotGenerating: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'animated' },
		expectedVisualDescriptions: ['An unframed area of small monospace binary digits, as tall as a generated image and a little wider than tall, with swells of denser accent-colored glyphs rolling through it like water and edges that fade out unevenly, without a panel background. No unfinished tool header or tool icon is visible; Generating image appears in the persistent footer below. Reduced motion and high contrast show one still composition.'],
		render: context => renderGeneratedImage(context, { toolId: 'image_generation', running: true, progress: ChatProgressAnimation.Draw }),
	}),
	CodexGenerating: defineComponentFixture({
		labels: { kind: 'animated' },
		render: context => renderGeneratedImage(context, { toolId: 'image_gen.imagegen', running: true, progress: ChatProgressAnimation.Draw }),
	}),
	CopilotOverlapping: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		inputSchema: z.object({ enableAnimations: z.boolean().default(true) }),
		expectedVisualDescriptions: ['Two concurrent image-generation attempts share exactly one unframed binary-digit placeholder and one Generating image footer. There is no second placeholder, empty tool row, or tool header.'],
		render: context => renderGeneratedImage(context, { toolId: 'image_generation', running: true, earlierAttempt: 'running', progress: ChatProgressAnimation.Draw }),
	}),
	CodexOverlapping: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		inputSchema: z.object({ enableAnimations: z.boolean().default(true) }),
		render: context => renderGeneratedImage(context, { toolId: 'image_gen.imagegen', running: true, earlierAttempt: 'running', progress: ChatProgressAnimation.Draw }),
	}),
	GeneratingAfterFailure: defineComponentFixture({
		labels: { kind: 'animated' },
		render: context => renderGeneratedImage(context, { toolId: 'image_generation', running: true, earlierAttempt: 'failed', progress: ChatProgressAnimation.Draw }),
	}),
	CompletedAfterFailure: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderGeneratedImage(context, { toolId: 'image_generation', earlierAttempt: 'failed', landscape: true, progress: ChatProgressAnimation.Draw }),
	}),
	GeneratingNarrow: defineComponentFixture({
		labels: { kind: 'animated' },
		render: context => renderGeneratedImage(context, { width: 360, toolId: 'image_gen.imagegen', running: true, progress: ChatProgressAnimation.Draw }),
	}),
	GeneratingReducedMotion: defineComponentFixture({
		render: context => renderGeneratedImage(context, { toolId: 'image_generation', running: true, reducedMotion: true, progress: ChatProgressAnimation.Draw }),
	}),
	Failed: defineComponentFixture({
		expectedVisualDescriptions: ['A Generated image failed tool dropdown with an error indicator remains available to inspect the prompt and failure output. There is no generation placeholder or large generated image.'],
		render: context => renderGeneratedImage(context, { toolId: 'image_generation', failed: true, progress: ChatProgressAnimation.Draw }),
	}),
	CompletedTool: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		expectedVisualDescriptions: ['A Generated image tool dropdown appears above the large generated image and its Save action. The image stays visible with the dropdown collapsed, and there is no generation placeholder.'],
		render: context => renderGeneratedImage(context, { responseComplete: false }),
	}),
});
