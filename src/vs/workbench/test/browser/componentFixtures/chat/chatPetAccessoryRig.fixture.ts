/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { allChatPetAccessories, chatPetAccessories, ChatPetAccessoryIds, getChatPetAccessory, type ChatPetAccessoryId, type IChatPetAccessory } from '../../../../contrib/chat/browser/chatPetAchievements.js';
import { drawChatPetComposite, drawChatPetEyeAccessory, getChatPetAccessoryImageSource, hasChatPetAccessoryImageDimensions, hasChatPetBodyImageDimensions } from '../../../../contrib/chat/browser/widget/chatPetAccessoryRenderer.js';
import { getChatPetFrameDurations, getChatPetSpriteName, doesChatPetStateTrackCursor, CHAT_PET_SING_FIXED_ORIENTATION_DECORATIONS, drawChatPetAchievementStar, type ChatPetState } from '../../../../contrib/chat/browser/widget/chatPetWidget.js';
import { getChatPetReducedMotionRigFrame } from '../../../../contrib/chat/browser/widget/chatPetAccessoryRig.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { configureChatPetFixtureFileRoot } from './chatPetFixtureUtils.js';

interface IRigPreview {
	readonly label: string;
	readonly state: ChatPetState;
	readonly bodyName: string;
	readonly frameWidth: number;
	readonly frameHeight: number;
	readonly frameCount: number;
	readonly frameIndex: number;
	readonly rigFrameIndex?: number;
	readonly facing?: 'left' | 'right';
	readonly fixedOrientation?: boolean;
	readonly rotation?: number;
	readonly accessoryId?: ChatPetAccessoryId;
}

const previews: readonly IRigPreview[] = [
	{ label: 'Idle', state: 'idle', bodyName: 'buddy-idle-stable-tracking-96', frameWidth: 96, frameHeight: 96, frameCount: 50, frameIndex: 0 },
	{ label: 'Idle bob', state: 'idle', bodyName: 'buddy-idle-stable-tracking-96', frameWidth: 96, frameHeight: 96, frameCount: 50, frameIndex: 20 },
	{ label: 'Sleep', state: 'sleep', bodyName: 'buddy-sleep-stable-96', frameWidth: 120, frameHeight: 96, frameCount: 8, frameIndex: 0 },
	{ label: 'Wake upright', state: 'waking', bodyName: 'buddy-waking-stable-96', frameWidth: 120, frameHeight: 96, frameCount: 8, frameIndex: 3 },
	{ label: 'Jump rise', state: 'jump', bodyName: 'buddy-jump-stable-96', frameWidth: 96, frameHeight: 96, frameCount: 6, frameIndex: 1 },
	{ label: 'Jump fall', state: 'jump', bodyName: 'buddy-jump-stable-96', frameWidth: 96, frameHeight: 96, frameCount: 6, frameIndex: 4 },
	{ label: 'Dizzy', state: 'dizzy', bodyName: 'buddy-dizzy-stable-128', frameWidth: 96, frameHeight: 128, frameCount: 8, frameIndex: 0 },
	{ label: 'Sing right', state: 'sing', bodyName: 'buddy-sing-stable-124', frameWidth: 164, frameHeight: 124, frameCount: 4, frameIndex: 2, fixedOrientation: true },
	{ label: 'Sing left', state: 'sing', bodyName: 'buddy-sing-stable-124', frameWidth: 164, frameHeight: 124, frameCount: 4, frameIndex: 2, facing: 'left', fixedOrientation: true },
	{ label: 'Worry right', state: 'worry', bodyName: 'buddy-worry-stable-96', frameWidth: 96, frameHeight: 96, frameCount: 2, frameIndex: 0, accessoryId: ChatPetAccessoryIds.BaseballCap },
	{ label: 'Worry left', state: 'worry', bodyName: 'buddy-worry-stable-96', frameWidth: 96, frameHeight: 96, frameCount: 2, frameIndex: 1, accessoryId: ChatPetAccessoryIds.BaseballCap },
	{ label: 'Rare icon side view', state: 'complete', bodyName: 'buddy-idle-stable-96', frameWidth: 96, frameHeight: 96, frameCount: 1, frameIndex: 0, rotation: 90, accessoryId: ChatPetAccessoryIds.BaseballCap },
	{ label: 'Wall impact', state: 'wallImpact', bodyName: 'buddy-wall-impact-stable-96', frameWidth: 96, frameHeight: 96, frameCount: 1, frameIndex: 0 },
	{ label: 'Splat impact', state: 'splat', bodyName: 'buddy-splat-stable-96', frameWidth: 96, frameHeight: 96, frameCount: 4, frameIndex: 0 },
	{ label: 'Splat recovery', state: 'splat', bodyName: 'buddy-splat-stable-96', frameWidth: 96, frameHeight: 96, frameCount: 4, frameIndex: 3 },
	{ label: 'Love (no accessory)', state: 'love', bodyName: 'buddy-love-stable-96', frameWidth: 96, frameHeight: 96, frameCount: 1, frameIndex: 0, rigFrameIndex: 5 },
	{ label: 'Splat reduced motion', state: 'splat', bodyName: 'buddy-splat-stable-96', frameWidth: 96, frameHeight: 96, frameCount: 1, frameIndex: 0, rigFrameIndex: 3 },
];

interface IChatPetProductionAccessoryPreview {
	readonly accessoryId: ChatPetAccessoryId;
	readonly shape: string;
}

interface IChatPetFixtureFrame {
	readonly state: ChatPetState;
	readonly frameWidth: number;
	readonly frameHeight: number;
	readonly bodyFrameIndex: number;
	readonly rigFrameIndex: number;
}

const productionAccessoryPreviews: readonly IChatPetProductionAccessoryPreview[] = [
	{
		accessoryId: ChatPetAccessoryIds.CowboyHat,
		shape: 'Low rounded crown with a broad curved brim',
	},
	{
		accessoryId: ChatPetAccessoryIds.StrawHat,
		shape: 'Tall golden crown with a red band and asymmetric brim',
	},
	{
		accessoryId: ChatPetAccessoryIds.BambooHat,
		shape: 'Wide tiered bamboo hat with warm gold shading',
	},
	{
		accessoryId: ChatPetAccessoryIds.PinkPartyHat,
		shape: 'Pink leaning party cone with a gold pom',
	},
	{
		accessoryId: ChatPetAccessoryIds.BaseballCap,
		shape: 'Paneled red crown with a long side-facing bill',
	},
	{
		accessoryId: ChatPetAccessoryIds.PropellerHat,
		shape: 'Multicolor beanie with a full-width gold propeller',
	},
	{
		accessoryId: ChatPetAccessoryIds.TopHatMonocle,
		shape: 'Extra-tall striped crown with a full-width brim and monocle',
	},
	{
		accessoryId: ChatPetAccessoryIds.PartyHat,
		shape: 'Single sloped cone with a centered pom and broad band',
	},
	{
		accessoryId: ChatPetAccessoryIds.SailorHat,
		shape: 'White Dixie-cup cap with a balanced crown and subtle forward brim',
	},
	{
		accessoryId: ChatPetAccessoryIds.DarkSailorHat,
		shape: 'White sailor cap with a dark band and gold accent',
	},
	{
		accessoryId: ChatPetAccessoryIds.SpinnerHat,
		shape: 'Domed beanie with a wide multicolor propeller',
	},
	{
		accessoryId: ChatPetAccessoryIds.ConstructionHardHat,
		shape: 'Low ribbed safety dome with a full-width brim',
	},
	{
		accessoryId: ChatPetAccessoryIds.WhiteChefHat,
		shape: 'Tall white toque with a pleated lower crown',
	},
	{
		accessoryId: ChatPetAccessoryIds.FirefighterHelmet,
		shape: 'Rounded red helmet with a gold shield and neck guard',
	},
	{
		accessoryId: ChatPetAccessoryIds.Crown,
		shape: 'Gold crown with tall points and jewel highlights',
	},
	{
		accessoryId: ChatPetAccessoryIds.WizardHat,
		shape: 'Wide purple leaning hat with a floating gold star',
	},
	{
		accessoryId: ChatPetAccessoryIds.ArtistBeret,
		shape: 'Tilted berry beret with a raised stem and dark band',
	},
];

const allChatPetStates: readonly ChatPetState[] = [
	'idle',
	'sleep',
	'waking',
	'typing',
	'rendering',
	'achievementUnlocked',
	'buttonPress',
	'complete',
	'love',
	'clapping',
	'jump',
	'cool',
	'yapping',
	'yappingMouthOpen',
	'sing',
	'speechless',
	'worry',
	'dizzy',
	'falling',
	'wallImpact',
	'splat',
	'onTheRun',
	'searching',
	'searchingDown',
];

export default defineThemedFixtureGroup({ path: 'chat/chatPetAccessoryRig/' }, {
	CriticalPoses: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: renderCriticalPoses,
	}),
	AllRuntimeStates: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: renderAllRuntimeStates,
	}),
	AllAccessoriesFacing: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: renderAllAccessoriesFacing,
	}),
	CoveredAntennaeComparison: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: renderCoveredAntennaeComparison,
	}),
	LiveEyeLayering: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: renderLiveEyeLayering,
	}),
	AchievementUnlockStar: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderAchievementUnlockStar,
	}),
});

async function renderCriticalPoses(ctx: ComponentFixtureContext): Promise<void> {
	configureChatPetFixtureFileRoot(ctx.disposableStore);

	ctx.container.style.width = '1100px';
	ctx.container.style.height = '760px';
	ctx.container.style.boxSizing = 'border-box';
	ctx.container.style.padding = '24px';
	ctx.container.style.overflow = 'auto';
	ctx.container.style.background = 'var(--vscode-editor-background)';
	ctx.container.style.color = 'var(--vscode-foreground)';

	const heading = DOM.append(ctx.container, DOM.$('h1'));
	heading.textContent = 'Accessory rig critical poses';
	heading.style.margin = '0 0 8px';
	const description = DOM.append(ctx.container, DOM.$('p'));
	description.textContent = 'One accessory atlas rendered through body-owned attachment tracks.';
	description.style.margin = '0 0 20px';
	description.style.color = 'var(--vscode-descriptionForeground)';

	const grid = DOM.append(ctx.container, DOM.$('.chat-pet-accessory-rig-grid'));
	grid.style.display = 'grid';
	grid.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
	grid.style.gap = '16px';

	const accessoryImages = new Map<ChatPetAccessoryId, HTMLImageElement>();
	await Promise.all([...new Set(previews.map(preview => preview.accessoryId ?? ChatPetAccessoryIds.TopHatMonocle))].map(async accessoryId => {
		const accessory = getChatPetAccessory(accessoryId);
		const source = getChatPetAccessoryImageSource(accessory);
		const image = await loadImage(source.url);
		if (!hasChatPetAccessoryImageDimensions(image, source)) {
			throw new Error(`Invalid accessory atlas dimensions: ${source.url}`);
		}
		accessoryImages.set(accessoryId, image);
	}));

	const bodyImages = await Promise.all(previews.map(async preview => {
		const bodyUrl = FileAccess.asBrowserUri(`vs/workbench/contrib/chat/browser/widget/media/chatPet/${preview.bodyName}${preview.frameCount > 1 ? '.spritesheet' : ''}.png`).toString(true);
		const bodyImage = await loadImage(bodyUrl);
		if (!hasChatPetBodyImageDimensions(bodyImage, preview.frameWidth, preview.frameHeight, preview.frameCount)) {
			throw new Error(`Invalid fixture body dimensions: ${bodyUrl}`);
		}
		return bodyImage;
	}));

	for (let index = 0; index < previews.length; index++) {
		const preview = previews[index];
		const bodyImage = bodyImages[index];
		const accessory = getChatPetAccessory(preview.accessoryId ?? ChatPetAccessoryIds.TopHatMonocle);
		const accessoryImage = accessoryImages.get(accessory.id);
		if (!accessoryImage) {
			throw new Error(`Missing fixture accessory image: ${accessory.id}`);
		}
		const card = DOM.append(grid, DOM.$('.chat-pet-accessory-rig-card'));
		card.style.minWidth = '0';
		card.style.padding = '12px';
		card.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-editorWidget-border)';
		card.style.borderRadius = 'var(--vscode-cornerRadius-medium)';
		card.style.background = 'var(--vscode-editorWidget-background)';

		const label = DOM.append(card, DOM.$('h2'));
		label.textContent = preview.label;
		label.style.margin = '0 0 8px';
		label.style.fontSize = 'var(--vscode-fontSize-heading3)';

		const canvas = DOM.append(card, DOM.$('canvas')) as HTMLCanvasElement;
		canvas.width = preview.frameWidth;
		canvas.height = preview.frameHeight;
		canvas.style.display = 'block';
		canvas.style.margin = '0 auto';
		canvas.style.width = `${preview.frameWidth / 2}px`;
		canvas.style.height = `${preview.frameHeight / 2}px`;
		canvas.style.imageRendering = 'pixelated';
		canvas.style.transform = preview.rotation ? `rotate(${preview.rotation}deg)` : '';
		canvas.setAttribute('aria-hidden', 'true');
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Canvas rendering context unavailable.');
		}
		context.imageSmoothingEnabled = false;
		drawChatPetComposite(
			context,
			bodyImage,
			accessoryImage,
			preview.frameIndex,
			preview.rigFrameIndex ?? preview.frameIndex,
			preview.frameWidth,
			preview.frameHeight,
			preview.facing ?? 'right',
			preview.state,
			preview.fixedOrientation ? CHAT_PET_SING_FIXED_ORIENTATION_DECORATIONS : undefined,
			true,
			accessory.eyeAccessoryMirrorsWithFacing !== false,
			accessory.coversAntennae === true,
		);
	}
}

async function renderAllRuntimeStates(ctx: ComponentFixtureContext): Promise<void> {
	configureChatPetFixtureFileRoot(ctx.disposableStore);
	ctx.container.style.width = '1360px';
	ctx.container.style.height = '1000px';
	ctx.container.style.boxSizing = 'border-box';
	ctx.container.style.padding = '24px';
	ctx.container.style.overflow = 'auto';
	ctx.container.style.background = 'var(--vscode-editor-background)';
	ctx.container.style.color = 'var(--vscode-foreground)';

	const heading = DOM.append(ctx.container, DOM.$('h1'));
	heading.textContent = 'All animation states';
	heading.style.margin = '0 0 8px';
	const description = DOM.append(ctx.container, DOM.$('p'));
	description.textContent = 'Every runtime state, composed with every accessory in both facing directions. Frames use the reduced-motion representative pose so the complete set can be compared at once.';
	description.style.margin = '0 0 20px';
	description.style.color = 'var(--vscode-descriptionForeground)';

	const bodySources = allChatPetStates.map(getAllRuntimeStateBodySource);
	const bodyImages = await Promise.all(bodySources.map(async source => {
		const image = await loadImage(source.url);
		if (!hasChatPetBodyImageDimensions(image, source.frameWidth, source.frameHeight, source.frameCount)) {
			throw new Error(`Invalid all-state fixture body dimensions: ${source.url}`);
		}
		return image;
	}));
	const atlasImages = await Promise.all(chatPetAccessories.map(async accessory => {
		const source = getChatPetAccessoryImageSource(accessory);
		const image = await loadImage(source.url);
		if (!hasChatPetAccessoryImageDimensions(image, source)) {
			throw new Error(`Invalid accessory atlas dimensions: ${source.url}`);
		}
		return image;
	}));

	const gallery = DOM.append(ctx.container, DOM.$('.chat-pet-all-runtime-states'));
	gallery.style.display = 'grid';
	gallery.style.gridTemplateColumns = `180px repeat(${chatPetAccessories.length}, minmax(150px, 1fr))`;
	gallery.style.gap = '8px';
	gallery.style.alignItems = 'start';

	const stateHeader = DOM.append(gallery, DOM.$('.chat-pet-all-runtime-state-header'));
	stateHeader.textContent = 'State';
	stateHeader.style.position = 'sticky';
	stateHeader.style.top = '0';
	stateHeader.style.zIndex = '1';
	stateHeader.style.padding = '10px';
	stateHeader.style.background = 'var(--vscode-editorWidget-background)';
	stateHeader.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-editorWidget-border)';
	for (const accessory of chatPetAccessories) {
		const accessoryHeader = DOM.append(gallery, DOM.$('.chat-pet-all-runtime-accessory-header'));
		accessoryHeader.textContent = accessory.label;
		accessoryHeader.style.position = 'sticky';
		accessoryHeader.style.top = '0';
		accessoryHeader.style.zIndex = '1';
		accessoryHeader.style.padding = '10px';
		accessoryHeader.style.background = 'var(--vscode-editorWidget-background)';
		accessoryHeader.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-editorWidget-border)';
		accessoryHeader.style.fontWeight = '600';
	}

	for (let stateIndex = 0; stateIndex < allChatPetStates.length; stateIndex++) {
		const state = allChatPetStates[stateIndex];
		const source = bodySources[stateIndex];
		const bodyImage = bodyImages[stateIndex];
		const stateLabel = DOM.append(gallery, DOM.$('.chat-pet-all-runtime-state-label'));
		stateLabel.textContent = `${getChatPetStateLabel(state)} (frame ${source.frameIndex + 1}/${source.frameCount})`;
		stateLabel.style.position = 'sticky';
		stateLabel.style.left = '0';
		stateLabel.style.padding = '10px';
		stateLabel.style.background = 'var(--vscode-editor-background)';
		stateLabel.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-editorWidget-border)';
		stateLabel.style.fontWeight = '600';

		for (let accessoryIndex = 0; accessoryIndex < chatPetAccessories.length; accessoryIndex++) {
			const accessory = chatPetAccessories[accessoryIndex];
			const atlasImage = atlasImages[accessoryIndex];
			const cell = DOM.append(gallery, DOM.$('.chat-pet-all-runtime-state-cell'));
			cell.style.display = 'flex';
			cell.style.justifyContent = 'space-around';
			cell.style.gap = '8px';
			cell.style.padding = '8px';
			cell.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-editorWidget-border)';
			cell.style.borderRadius = 'var(--vscode-cornerRadius-medium)';
			cell.style.background = 'var(--vscode-editorWidget-background)';

			for (const facing of ['right', 'left'] as const) {
				const direction = DOM.append(cell, DOM.$('.chat-pet-all-runtime-direction'));
				direction.style.display = 'flex';
				direction.style.flexDirection = 'column';
				direction.style.alignItems = 'center';
				direction.style.gap = '4px';
				const displayScale = Math.min(0.5, 68 / source.frameWidth);
				const displayWidth = source.frameWidth * displayScale;
				const displayHeight = source.frameHeight * displayScale;
				const stage = DOM.append(direction, DOM.$('.chat-pet-all-runtime-stage'));
				stage.style.position = 'relative';
				stage.style.width = `${displayWidth}px`;
				stage.style.height = `${displayHeight}px`;
				const bodyCanvas = DOM.append(stage, DOM.$('canvas')) as HTMLCanvasElement;
				bodyCanvas.width = source.frameWidth;
				bodyCanvas.height = source.frameHeight;
				bodyCanvas.style.display = 'block';
				bodyCanvas.style.width = `${displayWidth}px`;
				bodyCanvas.style.height = `${displayHeight}px`;
				bodyCanvas.style.imageRendering = 'pixelated';
				bodyCanvas.style.transform = facing === 'left' && !source.fixedOrientationDecorations ? 'scaleX(-1)' : '';
				bodyCanvas.setAttribute('aria-hidden', 'true');
				const context = bodyCanvas.getContext('2d');
				if (!context) {
					throw new Error('All-state fixture canvas context unavailable.');
				}
				context.imageSmoothingEnabled = false;
				drawChatPetComposite(
					context,
					bodyImage,
					atlasImage,
					source.frameIndex,
					source.rigFrameIndex,
					source.frameWidth,
					source.frameHeight,
					source.fixedOrientationDecorations ? facing : 'right',
					state,
					source.fixedOrientationDecorations,
					false,
					accessory.eyeAccessoryMirrorsWithFacing !== false,
					accessory.coversAntennae === true,
				);
				const eyeCanvas = DOM.append(stage, DOM.$('canvas')) as HTMLCanvasElement;
				eyeCanvas.width = source.frameWidth;
				eyeCanvas.height = source.frameHeight;
				eyeCanvas.style.position = 'absolute';
				eyeCanvas.style.inset = '0';
				eyeCanvas.style.width = `${displayWidth}px`;
				eyeCanvas.style.height = `${displayHeight}px`;
				eyeCanvas.style.imageRendering = 'pixelated';
				const mirrorsWithFacing = accessory.eyeAccessoryMirrorsWithFacing !== false;
				eyeCanvas.style.transform = facing === 'left' && mirrorsWithFacing && !source.fixedOrientationDecorations ? 'scaleX(-1)' : '';
				eyeCanvas.setAttribute('aria-hidden', 'true');
				const eyeContext = eyeCanvas.getContext('2d');
				if (!eyeContext) {
					throw new Error('All-state fixture eye accessory canvas unavailable.');
				}
				eyeContext.imageSmoothingEnabled = false;
				const eyeFacing = source.fixedOrientationDecorations || !mirrorsWithFacing ? facing : 'right';
				drawChatPetEyeAccessory(eyeContext, atlasImage, state, source.rigFrameIndex, eyeFacing, mirrorsWithFacing);
				const facingLabel = DOM.append(direction, DOM.$('span'));
				facingLabel.textContent = facing === 'right' ? 'Right' : 'Left';
				facingLabel.style.fontSize = 'var(--vscode-fontSize-small)';
				facingLabel.style.color = 'var(--vscode-descriptionForeground)';
			}
		}
	}
}

async function renderAllAccessoriesFacing(ctx: ComponentFixtureContext): Promise<void> {
	configureChatPetFixtureFileRoot(ctx.disposableStore);
	ctx.container.style.width = '900px';
	ctx.container.style.height = '1320px';
	ctx.container.style.boxSizing = 'border-box';
	ctx.container.style.padding = '24px';
	ctx.container.style.overflow = 'auto';
	ctx.container.style.background = 'var(--vscode-editor-background)';
	ctx.container.style.color = 'var(--vscode-foreground)';

	const heading = DOM.append(ctx.container, DOM.$('h1'));
	heading.textContent = 'Accessory facing';
	heading.style.margin = '0 0 8px';
	const description = DOM.append(ctx.container, DOM.$('p'));
	description.textContent = 'Canonical right-facing art mirrors with the pet for left-facing poses.';
	description.style.margin = '0 0 20px';
	description.style.color = 'var(--vscode-descriptionForeground)';

	const bodyUrl = FileAccess.asBrowserUri('vs/workbench/contrib/chat/browser/widget/media/chatPet/buddy-idle-stable-96.png').toString(true);
	const bodyImage = await loadImage(bodyUrl);
	if (!hasChatPetBodyImageDimensions(bodyImage, 96, 96, 1)) {
		throw new Error(`Invalid fixture body dimensions: ${bodyUrl}`);
	}
	const atlasImages = await Promise.all(chatPetAccessories.map(async accessory => {
		const source = getChatPetAccessoryImageSource(accessory);
		const image = await loadImage(source.url);
		if (!hasChatPetAccessoryImageDimensions(image, source)) {
			throw new Error(`Invalid accessory atlas dimensions: ${source.url}`);
		}
		return image;
	}));

	const grid = DOM.append(ctx.container, DOM.$('.chat-pet-accessory-facing-grid'));
	grid.style.display = 'grid';
	grid.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
	grid.style.gap = '16px';
	for (let index = 0; index < chatPetAccessories.length; index++) {
		const accessory = chatPetAccessories[index];
		const atlasImage = atlasImages[index];
		const card = DOM.append(grid, DOM.$('.chat-pet-accessory-facing-card'));
		card.style.padding = '12px';
		card.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-editorWidget-border)';
		card.style.borderRadius = 'var(--vscode-cornerRadius-medium)';
		card.style.background = 'var(--vscode-editorWidget-background)';
		const label = DOM.append(card, DOM.$('h2'));
		label.textContent = accessory.label;
		label.style.margin = '0 0 12px';
		label.style.fontSize = 'var(--vscode-fontSize-heading3)';
		const directions = DOM.append(card, DOM.$('.chat-pet-accessory-facing-directions'));
		directions.style.display = 'flex';
		directions.style.justifyContent = 'space-around';
		for (const facing of ['right', 'left'] as const) {
			const preview = DOM.append(directions, DOM.$('.chat-pet-accessory-facing-preview'));
			preview.style.textAlign = 'center';
			const stage = DOM.append(preview, DOM.$('.chat-pet-accessory-facing-stage'));
			stage.style.position = 'relative';
			stage.style.width = '72px';
			stage.style.height = '72px';
			const bodyCanvas = DOM.append(stage, DOM.$('canvas')) as HTMLCanvasElement;
			bodyCanvas.width = 96;
			bodyCanvas.height = 96;
			bodyCanvas.style.display = 'block';
			bodyCanvas.style.width = '72px';
			bodyCanvas.style.height = '72px';
			bodyCanvas.style.imageRendering = 'pixelated';
			bodyCanvas.style.transform = facing === 'left' ? 'scaleX(-1)' : '';
			bodyCanvas.setAttribute('aria-hidden', 'true');
			const bodyContext = bodyCanvas.getContext('2d');
			if (!bodyContext) {
				throw new Error('Canvas rendering context unavailable.');
			}
			bodyContext.imageSmoothingEnabled = false;
			drawChatPetComposite(bodyContext, bodyImage, atlasImage, 0, 0, 96, 96, 'right', 'idle', undefined, false, true, accessory.coversAntennae === true);
			const eyeCanvas = DOM.append(stage, DOM.$('canvas')) as HTMLCanvasElement;
			eyeCanvas.width = 96;
			eyeCanvas.height = 96;
			eyeCanvas.style.position = 'absolute';
			eyeCanvas.style.inset = '0';
			eyeCanvas.style.width = '72px';
			eyeCanvas.style.height = '72px';
			eyeCanvas.style.imageRendering = 'pixelated';
			const mirrorsWithFacing = accessory.eyeAccessoryMirrorsWithFacing !== false;
			eyeCanvas.style.transform = facing === 'left' && mirrorsWithFacing ? 'scaleX(-1)' : '';
			eyeCanvas.setAttribute('aria-hidden', 'true');
			const eyeContext = eyeCanvas.getContext('2d');
			if (!eyeContext) {
				throw new Error('Eye accessory canvas unavailable.');
			}
			eyeContext.imageSmoothingEnabled = false;
			const eyeFacing = facing === 'left' && !mirrorsWithFacing ? 'left' : 'right';
			drawChatPetEyeAccessory(eyeContext, atlasImage, 'idle', 0, eyeFacing, mirrorsWithFacing);
			const facingLabel = DOM.append(preview, DOM.$('span'));
			facingLabel.textContent = facing === 'right' ? 'Right' : 'Left';
		}
	}
}

async function renderCoveredAntennaeComparison(ctx: ComponentFixtureContext): Promise<void> {
	configureChatPetFixtureFileRoot(ctx.disposableStore);
	ctx.container.style.width = '1240px';
	ctx.container.style.height = '2240px';
	ctx.container.style.boxSizing = 'border-box';
	ctx.container.style.padding = '24px';
	ctx.container.style.overflow = 'auto';
	ctx.container.style.background = 'var(--vscode-editor-background)';
	ctx.container.style.color = 'var(--vscode-foreground)';

	const heading = DOM.append(ctx.container, DOM.$('h1'));
	heading.textContent = 'Production accessory motion';
	heading.style.margin = '0 0 8px';
	const description = DOM.append(ctx.container, DOM.$('p'));
	description.textContent = `All ${productionAccessoryPreviews.length} achievement rewards use body-owned attachment tracks and transparent antenna occlusion in both directions.`;
	description.style.margin = '0 0 20px';
	description.style.color = 'var(--vscode-descriptionForeground)';

	const idleBodyUrl = FileAccess.asBrowserUri('vs/workbench/contrib/chat/browser/widget/media/chatPet/buddy-idle-stable-96.png').toString(true);
	const sleepBodyUrl = FileAccess.asBrowserUri('vs/workbench/contrib/chat/browser/widget/media/chatPet/buddy-sleep-stable-96.png').toString(true);
	const jumpBodyUrl = FileAccess.asBrowserUri('vs/workbench/contrib/chat/browser/widget/media/chatPet/buddy-jump-stable-96.spritesheet.png').toString(true);
	const fallingBodyUrl = FileAccess.asBrowserUri('vs/workbench/contrib/chat/browser/widget/media/chatPet/buddy-falling-stable-96.spritesheet.png').toString(true);
	const impactBodyUrl = FileAccess.asBrowserUri('vs/workbench/contrib/chat/browser/widget/media/chatPet/buddy-wall-impact-stable-96.png').toString(true);
	const [idleBodyImage, sleepBodyImage, jumpBodyImage, fallingBodyImage, impactBodyImage] = await Promise.all([
		loadImage(idleBodyUrl),
		loadImage(sleepBodyUrl),
		loadImage(jumpBodyUrl),
		loadImage(fallingBodyUrl),
		loadImage(impactBodyUrl),
	]);
	if (!hasChatPetBodyImageDimensions(idleBodyImage, 96, 96, 1)
		|| !hasChatPetBodyImageDimensions(sleepBodyImage, 120, 96, 1)
		|| !hasChatPetBodyImageDimensions(jumpBodyImage, 96, 96, 6)
		|| !hasChatPetBodyImageDimensions(fallingBodyImage, 96, 96, 6)
		|| !hasChatPetBodyImageDimensions(impactBodyImage, 96, 96, 1)) {
		throw new Error('Invalid covered-antennae comparison body dimensions.');
	}

	const accessoryImages = await Promise.all(productionAccessoryPreviews.map(async preview => {
		const accessory = allChatPetAccessories.find(accessory => accessory.id === preview.accessoryId);
		if (!accessory) {
			throw new Error(`Unknown fixture accessory: ${preview.accessoryId}`);
		}
		const source = getChatPetAccessoryImageSource(accessory);
		const image = await loadImage(source.url);
		if (!hasChatPetAccessoryImageDimensions(image, source)) {
			throw new Error(`Invalid production accessory dimensions: ${accessory.atlasName}`);
		}
		return { accessory, image };
	}));

	const grid = DOM.append(ctx.container, DOM.$('.chat-pet-covered-antennae-grid'));
	grid.style.display = 'grid';
	grid.style.gridTemplateColumns = '220px repeat(10, minmax(92px, 1fr))';
	grid.style.gap = '8px';
	grid.style.alignItems = 'stretch';

	for (const text of ['Appearance', 'Idle R', 'Idle L', 'Sleep R', 'Sleep L', 'Jump R', 'Jump L', 'Fall R', 'Fall L', 'Wall R', 'Wall L']) {
		const header = DOM.append(grid, DOM.$('.chat-pet-covered-antennae-header'));
		header.textContent = text;
		header.style.position = 'sticky';
		header.style.top = '0';
		header.style.zIndex = '1';
		header.style.padding = '10px';
		header.style.background = 'var(--vscode-editorWidget-background)';
		header.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-editorWidget-border)';
		header.style.fontWeight = '600';
	}

	const idleFrame: IChatPetFixtureFrame = {
		state: 'idle',
		frameWidth: 96,
		frameHeight: 96,
		bodyFrameIndex: 0,
		rigFrameIndex: 0,
	};
	const sleepFrame: IChatPetFixtureFrame = {
		state: 'sleep',
		frameWidth: 120,
		frameHeight: 96,
		bodyFrameIndex: 0,
		rigFrameIndex: getChatPetReducedMotionRigFrame('sleep'),
	};
	const jumpFrame: IChatPetFixtureFrame = {
		state: 'jump',
		frameWidth: 96,
		frameHeight: 96,
		bodyFrameIndex: 3,
		rigFrameIndex: 3,
	};
	const fallingFrame: IChatPetFixtureFrame = {
		state: 'falling',
		frameWidth: 96,
		frameHeight: 96,
		bodyFrameIndex: 0,
		rigFrameIndex: 0,
	};
	const impactFrame: IChatPetFixtureFrame = {
		state: 'wallImpact',
		frameWidth: 96,
		frameHeight: 96,
		bodyFrameIndex: 0,
		rigFrameIndex: 0,
	};

	for (let index = 0; index < productionAccessoryPreviews.length; index++) {
		const preview = productionAccessoryPreviews[index];
		const { accessory, image } = accessoryImages[index];
		const appearance = DOM.append(grid, DOM.$('.chat-pet-covered-antennae-label'));
		appearance.style.padding = '12px';
		appearance.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-editorWidget-border)';
		appearance.style.borderRadius = 'var(--vscode-cornerRadius-medium)';
		appearance.style.background = 'var(--vscode-editorWidget-background)';
		const label = DOM.append(appearance, DOM.$('strong'));
		label.textContent = accessory.label;
		label.style.display = 'block';
		const shape = DOM.append(appearance, DOM.$('span'));
		shape.textContent = preview.shape;
		shape.style.display = 'block';
		shape.style.marginTop = '4px';
		shape.style.color = 'var(--vscode-descriptionForeground)';

		for (const facing of ['right', 'left'] as const) {
			appendCoveredAntennaeCell(grid, idleBodyImage, image, accessory, idleFrame, facing);
		}
		for (const facing of ['right', 'left'] as const) {
			appendCoveredAntennaeCell(grid, sleepBodyImage, image, accessory, sleepFrame, facing);
		}
		for (const facing of ['right', 'left'] as const) {
			appendCoveredAntennaeCell(grid, jumpBodyImage, image, accessory, jumpFrame, facing);
		}
		for (const facing of ['right', 'left'] as const) {
			appendCoveredAntennaeCell(grid, fallingBodyImage, image, accessory, fallingFrame, facing);
		}
		for (const facing of ['right', 'left'] as const) {
			appendCoveredAntennaeCell(grid, impactBodyImage, image, accessory, impactFrame, facing, facing === 'right' ? 90 : -90);
		}
	}
}

function appendCoveredAntennaeCell(
	parent: HTMLElement,
	bodyImage: HTMLImageElement,
	accessoryImage: HTMLImageElement,
	accessory: Pick<IChatPetAccessory, 'eyeAccessoryMirrorsWithFacing' | 'coversAntennae'>,
	frame: IChatPetFixtureFrame,
	facing: 'left' | 'right',
	rotation = 0,
): void {
	const cell = DOM.append(parent, DOM.$('.chat-pet-covered-antennae-cell'));
	cell.style.display = 'flex';
	cell.style.alignItems = 'center';
	cell.style.justifyContent = 'center';
	cell.style.minHeight = '92px';
	cell.style.padding = '8px';
	cell.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-editorWidget-border)';
	cell.style.borderRadius = 'var(--vscode-cornerRadius-medium)';
	cell.style.background = 'var(--vscode-editorWidget-background)';
	appendChatPetFacingPreview(cell, bodyImage, accessoryImage, accessory, frame, facing, 0.75, rotation);
}

async function renderLiveEyeLayering(ctx: ComponentFixtureContext): Promise<void> {
	configureChatPetFixtureFileRoot(ctx.disposableStore);
	ctx.container.style.width = '600px';
	ctx.container.style.height = '360px';
	ctx.container.style.boxSizing = 'border-box';
	ctx.container.style.padding = '24px';
	ctx.container.style.background = 'var(--vscode-editor-background)';
	ctx.container.style.color = 'var(--vscode-foreground)';

	const heading = DOM.append(ctx.container, DOM.$('h1'));
	heading.textContent = 'Live monocle layering';
	heading.style.margin = '0 0 8px';
	const description = DOM.append(ctx.container, DOM.$('p'));
	description.textContent = 'The identity-bound monocle follows the same gaze offset as the shifted DOM pupil.';
	description.style.margin = '0 0 24px';
	description.style.color = 'var(--vscode-descriptionForeground)';

	const bodyUrl = FileAccess.asBrowserUri('vs/workbench/contrib/chat/browser/widget/media/chatPet/buddy-idle-stable-tracking-96.png').toString(true);
	const bodyImage = await loadImage(bodyUrl);
	const accessory = getChatPetAccessory(ChatPetAccessoryIds.TopHatMonocle);
	const accessorySource = getChatPetAccessoryImageSource(accessory);
	const accessoryImage = await loadImage(accessorySource.url);
	if (!hasChatPetBodyImageDimensions(bodyImage, 96, 96, 1) || !hasChatPetAccessoryImageDimensions(accessoryImage, accessorySource)) {
		throw new Error('Invalid live eye-layering fixture assets.');
	}

	const directions = DOM.append(ctx.container, DOM.$('.chat-pet-live-eye-directions'));
	directions.style.display = 'flex';
	directions.style.justifyContent = 'space-around';
	for (const facing of ['right', 'left'] as const) {
		const card = DOM.append(directions, DOM.$('.chat-pet-live-eye-card'));
		card.style.width = '220px';
		card.style.padding = '16px';
		card.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-editorWidget-border)';
		card.style.borderRadius = 'var(--vscode-cornerRadius-medium)';
		card.style.background = 'var(--vscode-editorWidget-background)';
		const stage = DOM.append(card, DOM.$('.chat-pet-live-eye-stage'));
		stage.style.position = 'relative';
		stage.style.width = '96px';
		stage.style.height = '96px';
		stage.style.margin = '0 auto 12px';
		const button = DOM.append(stage, DOM.$('.chat-pet-button'));
		button.dataset.state = 'idle';
		button.dataset.facing = facing;
		button.style.position = 'absolute';
		button.style.right = 'auto';
		button.style.bottom = '0';
		button.style.left = '24px';
		button.style.transform = 'scale(2)';
		button.style.transformOrigin = 'bottom left';
		const visual = DOM.append(button, DOM.$('.chat-pet-visual'));
		const sprite = DOM.append(visual, DOM.$('.chat-pet-sprite'));
		const bodyCanvas = DOM.append(sprite, DOM.$('canvas.chat-pet-canvas')) as HTMLCanvasElement;
		bodyCanvas.width = 96;
		bodyCanvas.height = 96;
		const bodyContext = bodyCanvas.getContext('2d');
		if (!bodyContext) {
			throw new Error('Body canvas unavailable.');
		}
		bodyContext.imageSmoothingEnabled = false;
		drawChatPetComposite(bodyContext, bodyImage, accessoryImage, 0, 0, 96, 96, 'right', 'idle', undefined, false, false, accessory.coversAntennae === true);

		const eyes = DOM.append(visual, DOM.$('.chat-pet-eyes.tracking'));
		for (const side of ['left', 'right']) {
			const eye = DOM.append(eyes, DOM.$(`.chat-pet-eye.${side}`));
			const pupil = DOM.append(eye, DOM.$('.chat-pet-pupil'));
			if (side === 'right') {
				pupil.style.transform = 'translateX(2px)';
			}
		}
		const eyeAccessory = DOM.append(visual, DOM.$('.chat-pet-eye-accessory.fixed-orientation'));
		const eyeCanvas = DOM.append(eyeAccessory, DOM.$('canvas.chat-pet-eye-accessory-canvas')) as HTMLCanvasElement;
		eyeCanvas.width = 96;
		eyeCanvas.height = 96;
		const eyeContext = eyeCanvas.getContext('2d');
		if (!eyeContext) {
			throw new Error('Eye accessory canvas unavailable.');
		}
		eyeContext.imageSmoothingEnabled = false;
		drawChatPetEyeAccessory(eyeContext, accessoryImage, 'idle', 0, facing, false, [4, 0]);
		const label = DOM.append(card, DOM.$('div'));
		label.textContent = facing === 'right' ? 'Right' : 'Left';
		label.style.textAlign = 'center';
	}
}

async function renderAchievementUnlockStar(ctx: ComponentFixtureContext): Promise<void> {
	configureChatPetFixtureFileRoot(ctx.disposableStore);
	ctx.container.style.width = '420px';
	ctx.container.style.height = '220px';
	ctx.container.style.boxSizing = 'border-box';
	ctx.container.style.padding = '24px';
	ctx.container.style.background = 'var(--vscode-editor-background)';
	ctx.container.style.color = 'var(--vscode-foreground)';

	const heading = DOM.append(ctx.container, DOM.$('h1'));
	heading.textContent = 'Achievement unlock star';
	heading.style.margin = '0 0 20px';
	const row = DOM.append(ctx.container, DOM.$('.chat-pet-achievement-star-row'));
	row.style.display = 'flex';
	row.style.gap = '24px';
	for (const variant of ['stable', 'insiders'] as const) {
		const image = await loadImage(FileAccess.asBrowserUri(`vs/workbench/contrib/chat/browser/widget/media/chatPet/buddy-speech-${variant}-96.png`).toString(true));
		const card = DOM.append(row, DOM.$('.chat-pet-achievement-star-card'));
		const canvas = DOM.append(card, DOM.$('canvas')) as HTMLCanvasElement;
		canvas.width = 96;
		canvas.height = 96;
		canvas.style.display = 'block';
		canvas.style.width = '144px';
		canvas.style.height = '144px';
		canvas.style.imageRendering = 'pixelated';
		canvas.setAttribute('aria-hidden', 'true');
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Achievement star canvas unavailable.');
		}
		context.imageSmoothingEnabled = false;
		context.drawImage(image, 0, 0);
		drawChatPetAchievementStar(context, variant);
	}
}

interface IAllRuntimeStateBodySource {
	readonly url: string;
	readonly frameWidth: number;
	readonly frameHeight: number;
	readonly frameCount: number;
	readonly frameIndex: number;
	readonly rigFrameIndex: number;
	readonly fixedOrientationDecorations?: typeof CHAT_PET_SING_FIXED_ORIENTATION_DECORATIONS;
}

function getAllRuntimeStateBodySource(state: ChatPetState): IAllRuntimeStateBodySource {
	const frameDurations = getChatPetFrameDurations(state);
	const frameCount = Math.max(1, frameDurations.length);
	const frameWidth = state === 'sleep' || state === 'waking'
		? 120
		: state === 'typing'
			? 168
			: state === 'buttonPress'
				? 160
				: state === 'sing'
					? 164
					: 96;
	const frameHeight = state === 'dizzy' ? 128 : state === 'sing' ? 124 : 96;
	const suffix = doesChatPetStateTrackCursor(state) ? '-tracking-96' : `-${frameHeight}`;
	const name = getChatPetSpriteName(state, 'stable');
	const root = 'vs/workbench/contrib/chat/browser/widget/media/chatPet';
	const frameIndex = Math.min(getChatPetReducedMotionRigFrame(state), frameCount - 1);
	return {
		url: FileAccess.asBrowserUri(`${root}/${name}${suffix}${frameCount > 1 ? '.spritesheet' : ''}.png`).toString(true),
		frameWidth,
		frameHeight,
		frameCount,
		frameIndex,
		rigFrameIndex: frameIndex,
		fixedOrientationDecorations: state === 'sing' ? CHAT_PET_SING_FIXED_ORIENTATION_DECORATIONS : undefined,
	};
}

function getChatPetStateLabel(state: ChatPetState): string {
	return state.replace(/[A-Z]/g, character => ` ${character.toLowerCase()}`).replace(/^./, character => character.toUpperCase());
}

function appendChatPetFacingPreview(
	parent: HTMLElement,
	bodyImage: HTMLImageElement,
	accessoryImage: HTMLImageElement,
	accessory: Pick<IChatPetAccessory, 'eyeAccessoryMirrorsWithFacing' | 'coversAntennae'>,
	frame: IChatPetFixtureFrame,
	facing: 'left' | 'right',
	displayScale: number,
	rotation: number,
): void {
	const stage = DOM.append(parent, DOM.$('.chat-pet-covered-antennae-stage'));
	stage.style.position = 'relative';
	stage.style.width = `${frame.frameWidth * displayScale}px`;
	stage.style.height = `${frame.frameHeight * displayScale}px`;
	stage.style.transform = rotation === 0 ? '' : `rotate(${rotation}deg)`;

	const bodyCanvas = DOM.append(stage, DOM.$('canvas')) as HTMLCanvasElement;
	bodyCanvas.width = frame.frameWidth;
	bodyCanvas.height = frame.frameHeight;
	bodyCanvas.style.display = 'block';
	bodyCanvas.style.width = `${frame.frameWidth * displayScale}px`;
	bodyCanvas.style.height = `${frame.frameHeight * displayScale}px`;
	bodyCanvas.style.imageRendering = 'pixelated';
	bodyCanvas.style.transform = facing === 'left' ? 'scaleX(-1)' : '';
	bodyCanvas.setAttribute('aria-hidden', 'true');
	const bodyContext = bodyCanvas.getContext('2d');
	if (!bodyContext) {
		throw new Error('Covered-antennae fixture body canvas unavailable.');
	}
	bodyContext.imageSmoothingEnabled = false;
	drawChatPetComposite(
		bodyContext,
		bodyImage,
		accessoryImage,
		frame.bodyFrameIndex,
		frame.rigFrameIndex,
		frame.frameWidth,
		frame.frameHeight,
		'right',
		frame.state,
		undefined,
		false,
		accessory.eyeAccessoryMirrorsWithFacing !== false,
		accessory.coversAntennae === true,
	);

	const eyeCanvas = DOM.append(stage, DOM.$('canvas')) as HTMLCanvasElement;
	eyeCanvas.width = frame.frameWidth;
	eyeCanvas.height = frame.frameHeight;
	eyeCanvas.style.position = 'absolute';
	eyeCanvas.style.inset = '0';
	eyeCanvas.style.width = `${frame.frameWidth * displayScale}px`;
	eyeCanvas.style.height = `${frame.frameHeight * displayScale}px`;
	eyeCanvas.style.imageRendering = 'pixelated';
	eyeCanvas.setAttribute('aria-hidden', 'true');
	const eyeContext = eyeCanvas.getContext('2d');
	if (!eyeContext) {
		throw new Error('Covered-antennae fixture eye accessory canvas unavailable.');
	}
	eyeContext.imageSmoothingEnabled = false;
	const mirrorsWithFacing = accessory.eyeAccessoryMirrorsWithFacing !== false;
	eyeCanvas.style.transform = facing === 'left' && mirrorsWithFacing ? 'scaleX(-1)' : '';
	drawChatPetEyeAccessory(
		eyeContext,
		accessoryImage,
		frame.state,
		frame.rigFrameIndex,
		facing === 'left' && !mirrorsWithFacing ? 'left' : 'right',
		mirrorsWithFacing,
	);
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = mainWindow.document.createElement('img');
		image.addEventListener('load', () => resolve(image), { once: true });
		image.addEventListener('error', () => reject(new Error(`Failed to load fixture image: ${url}`)), { once: true });
		image.src = url;
	});
}
