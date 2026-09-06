/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from '../../../../../base/common/network.js';
import type { IChatPetAccessory } from '../chatPetAchievements.js';
import type { ChatPetState } from './chatPetWidget.js';
import { ChatPetAccessoryRigPose, getChatPetAccessoryRigFrame, getChatPetAntennaeOcclusionBounds, getChatPetEyeAccessoryAnchor } from './chatPetAccessoryRig.js';

export const CHAT_PET_ACCESSORY_ATLAS_CELL_SIZE = 64;
export const CHAT_PET_WIDE_ACCESSORY_ATLAS_CELL_SIZE = 96;
export const CHAT_PET_ACCESSORY_ATLAS_WIDTH = CHAT_PET_ACCESSORY_ATLAS_CELL_SIZE * 4;
export const CHAT_PET_ACCESSORY_ATLAS_HEIGHT = CHAT_PET_ACCESSORY_ATLAS_CELL_SIZE * 3;

export interface IChatPetFixedOrientationDecoration {
	readonly frameBounds: readonly (readonly [number, number, number, number])[];
	readonly sourceFrame: number;
}

export interface IChatPetAccessoryImageSource {
	readonly url: string;
	readonly cellSize: number;
	readonly width: number;
	readonly height: number;
}

export interface IChatPetImageDimensions {
	readonly naturalWidth: number;
	readonly naturalHeight: number;
}

export function getChatPetAccessoryImageSource(accessory: IChatPetAccessory): IChatPetAccessoryImageSource {
	const cellSize = accessory.atlasCellSize ?? CHAT_PET_ACCESSORY_ATLAS_CELL_SIZE;
	return {
		url: FileAccess.asBrowserUri(`vs/workbench/contrib/chat/browser/widget/media/chatPet/accessories/${accessory.atlasName}.png`).toString(true),
		cellSize,
		width: cellSize * 4,
		height: cellSize * 3,
	};
}

export function hasChatPetBodyImageDimensions(image: IChatPetImageDimensions, frameWidth: number, frameHeight: number, frameCount: number): boolean {
	return image.naturalWidth === frameWidth * frameCount && image.naturalHeight === frameHeight;
}

export function hasChatPetAccessoryImageDimensions(image: IChatPetImageDimensions, source: IChatPetAccessoryImageSource): boolean {
	return image.naturalWidth === source.width && image.naturalHeight === source.height;
}

export function drawChatPetComposite(
	context: CanvasRenderingContext2D,
	bodyImage: HTMLImageElement,
	accessoryImage: HTMLImageElement | undefined,
	bodyFrameIndex: number,
	rigFrameIndex: number,
	frameWidth: number,
	frameHeight: number,
	facingDirection: 'left' | 'right',
	state: ChatPetState,
	fixedOrientationDecorations?: readonly IChatPetFixedOrientationDecoration[],
	includeEyeAccessory = true,
	eyeAccessoryMirrorsWithFacing = true,
	coversAntennae = false,
): void {
	context.clearRect(0, 0, frameWidth, frameHeight);
	const sourceX = bodyFrameIndex * frameWidth;
	const rigFrame = getChatPetAccessoryRigFrame(state, rigFrameIndex);
	if (fixedOrientationDecorations !== undefined && facingDirection === 'left') {
		drawMirroredChatPetLayer(context, bodyImage, sourceX, 0, frameWidth, frameHeight);
		drawFixedOrientationDecorations(context, bodyImage, bodyFrameIndex, frameWidth, fixedOrientationDecorations);
		if (accessoryImage) {
			if (coversAntennae) {
				clearChatPetAntennae(context, state, rigFrameIndex, frameWidth, true);
			}
			context.save();
			context.globalCompositeOperation = 'destination-over';
			drawMirroredAccessoryLayer(context, accessoryImage, rigFrame, 'back', frameWidth);
			context.restore();
			drawMirroredAccessoryLayer(context, accessoryImage, rigFrame, 'front', frameWidth);
			if (includeEyeAccessory) {
				if (eyeAccessoryMirrorsWithFacing) {
					drawMirroredEyeAccessory(context, accessoryImage, rigFrame, frameWidth);
				} else {
					drawEyeAccessory(context, accessoryImage, rigFrame, getChatPetEyeAccessoryAnchor(state, rigFrameIndex, 'left', false, frameWidth));
				}
			}
		}
		return;
	}
	if (accessoryImage) {
		drawTrackedAccessoryLayer(context, accessoryImage, rigFrame, 'back', frameWidth);
	}
	context.drawImage(bodyImage, sourceX, 0, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
	if (accessoryImage) {
		if (coversAntennae) {
			clearChatPetAntennae(context, state, rigFrameIndex, frameWidth, false);
			context.save();
			context.globalCompositeOperation = 'destination-over';
			drawTrackedAccessoryLayer(context, accessoryImage, rigFrame, 'back', frameWidth);
			context.restore();
		}
		drawTrackedAccessoryLayer(context, accessoryImage, rigFrame, 'front', frameWidth);
		if (includeEyeAccessory) {
			drawEyeAccessory(context, accessoryImage, rigFrame);
		}
	}
}

export function drawChatPetAccessory(context: CanvasRenderingContext2D, accessoryImage: HTMLImageElement, state: ChatPetState, frameIndex: number, facingDirection: 'left' | 'right'): void {
	const rigFrame = getChatPetAccessoryRigFrame(state, frameIndex);
	const mirrorsHeadAccessory = facingDirection === 'left' !== !!rigFrame.mirrorsHeadAccessory;
	if (mirrorsHeadAccessory) {
		drawMirroredAccessoryLayer(context, accessoryImage, rigFrame, 'back', context.canvas.width);
		drawMirroredAccessoryLayer(context, accessoryImage, rigFrame, 'front', context.canvas.width);
		drawMirroredEyeAccessory(context, accessoryImage, rigFrame, context.canvas.width);
		return;
	}
	drawAccessoryLayer(context, accessoryImage, rigFrame, 'back');
	drawAccessoryLayer(context, accessoryImage, rigFrame, 'front');
	drawEyeAccessory(context, accessoryImage, rigFrame);
}

export function drawChatPetEyeAccessory(context: CanvasRenderingContext2D, accessoryImage: HTMLImageElement, state: ChatPetState, frameIndex: number, facingDirection: 'left' | 'right', mirrorsWithFacing = true, gazeOffset?: readonly [number, number]): void {
	context.clearRect(0, 0, context.canvas.width, context.canvas.height);
	const rigFrame = getChatPetAccessoryRigFrame(state, frameIndex);
	if (facingDirection === 'left' && mirrorsWithFacing) {
		drawMirroredEyeAccessory(context, accessoryImage, rigFrame, context.canvas.width);
		return;
	}
	const anchor = getChatPetEyeAccessoryAnchor(state, frameIndex, facingDirection, mirrorsWithFacing, context.canvas.width);
	drawEyeAccessory(context, accessoryImage, rigFrame, anchor && gazeOffset ? {
		x: anchor.x + gazeOffset[0],
		y: anchor.y + gazeOffset[1],
	} : anchor);
}

function drawMirroredChatPetLayer(context: CanvasRenderingContext2D, image: HTMLImageElement, sourceX: number, sourceY: number, frameWidth: number, frameHeight: number): void {
	context.save();
	context.translate(frameWidth, 0);
	context.scale(-1, 1);
	context.drawImage(image, sourceX, sourceY, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
	context.restore();
}

function clearChatPetAntennae(context: CanvasRenderingContext2D, state: ChatPetState, frameIndex: number, frameWidth: number, mirrored: boolean): void {
	const bounds = getChatPetAntennaeOcclusionBounds(state, frameIndex);
	if (!bounds) {
		return;
	}
	const x = mirrored ? frameWidth - bounds.x - bounds.width : bounds.x;
	context.clearRect(x, bounds.y, bounds.width, bounds.height);
}

function drawFixedOrientationDecorations(context: CanvasRenderingContext2D, bodyImage: HTMLImageElement, frameIndex: number, frameWidth: number, decorations: readonly IChatPetFixedOrientationDecoration[]): void {
	for (const decoration of decorations) {
		const currentBounds = decoration.frameBounds[frameIndex];
		const canonicalBounds = decoration.frameBounds[decoration.sourceFrame];
		const [currentLeft, currentTop, currentRight, currentBottom] = currentBounds;
		const [canonicalLeft, canonicalTop, canonicalRight, canonicalBottom] = canonicalBounds;
		const canonicalWidth = canonicalRight - canonicalLeft;
		const canonicalHeight = canonicalBottom - canonicalTop;
		context.clearRect(frameWidth - currentRight, currentTop, currentRight - currentLeft, currentBottom - currentTop);
		context.drawImage(
			bodyImage,
			decoration.sourceFrame * frameWidth + canonicalLeft,
			canonicalTop,
			canonicalWidth,
			canonicalHeight,
			frameWidth - currentLeft - canonicalWidth,
			currentTop,
			canonicalWidth,
			canonicalHeight
		);
	}
}

type ChatPetAccessoryLayer = 'back' | 'front';

const rigPoseColumn: Record<ChatPetAccessoryRigPose, number> = {
	upright: 0,
	sleeping: 1,
	airborne: 0,
	impact: 2,
	splat: 3,
};

const compactHeadPivot: Record<ChatPetAccessoryRigPose, readonly [number, number]> = {
	upright: [32, 48],
	sleeping: [32, 48],
	airborne: [32, 48],
	impact: [32, 32],
	splat: [32, 48],
};

const wideHeadPivot: Record<ChatPetAccessoryRigPose, readonly [number, number]> = {
	upright: [48, 40],
	sleeping: [48, 40],
	airborne: [48, 40],
	impact: [48, 40],
	splat: [48, 80],
};

function getAtlasCellSize(atlasImage: HTMLImageElement): number {
	return atlasImage.naturalWidth / 4;
}

function drawAccessoryLayer(context: CanvasRenderingContext2D, atlasImage: HTMLImageElement, rigFrame: ReturnType<typeof getChatPetAccessoryRigFrame>, layer: ChatPetAccessoryLayer): void {
	const cellSize = getAtlasCellSize(atlasImage);
	const sourceX = rigPoseColumn[rigFrame.pose] * cellSize;
	if (rigFrame.head) {
		const headSourceY = (layer === 'back' ? 0 : 1) * cellSize;
		const [headPivotX, headPivotY] = cellSize === CHAT_PET_WIDE_ACCESSORY_ATLAS_CELL_SIZE
			? wideHeadPivot[rigFrame.pose]
			: compactHeadPivot[rigFrame.pose];
		context.drawImage(
			atlasImage,
			sourceX,
			headSourceY,
			cellSize,
			cellSize,
			rigFrame.head.x - headPivotX,
			rigFrame.head.y - headPivotY,
			cellSize,
			cellSize
		);
	}
}

function drawTrackedAccessoryLayer(context: CanvasRenderingContext2D, atlasImage: HTMLImageElement, rigFrame: ReturnType<typeof getChatPetAccessoryRigFrame>, layer: ChatPetAccessoryLayer, frameWidth: number): void {
	if (rigFrame.mirrorsHeadAccessory) {
		drawMirroredAccessoryLayer(context, atlasImage, rigFrame, layer, frameWidth);
	} else {
		drawAccessoryLayer(context, atlasImage, rigFrame, layer);
	}
}

function drawMirroredAccessoryLayer(context: CanvasRenderingContext2D, atlasImage: HTMLImageElement, rigFrame: ReturnType<typeof getChatPetAccessoryRigFrame>, layer: ChatPetAccessoryLayer, frameWidth: number): void {
	context.save();
	context.translate(frameWidth, 0);
	context.scale(-1, 1);
	drawAccessoryLayer(context, atlasImage, rigFrame, layer);
	context.restore();
}

function drawEyeAccessory(context: CanvasRenderingContext2D, atlasImage: HTMLImageElement, rigFrame: ReturnType<typeof getChatPetAccessoryRigFrame>, eyeAnchor = rigFrame.rightEye): void {
	if (!eyeAnchor) {
		return;
	}
	const cellSize = getAtlasCellSize(atlasImage);
	const sourceX = rigPoseColumn[rigFrame.pose] * cellSize;
	context.drawImage(
		atlasImage,
		sourceX,
		2 * cellSize,
		cellSize,
		cellSize,
		eyeAnchor.x,
		eyeAnchor.y,
		cellSize,
		cellSize
	);
}

function drawMirroredEyeAccessory(context: CanvasRenderingContext2D, atlasImage: HTMLImageElement, rigFrame: ReturnType<typeof getChatPetAccessoryRigFrame>, frameWidth: number): void {
	context.save();
	context.translate(frameWidth, 0);
	context.scale(-1, 1);
	drawEyeAccessory(context, atlasImage, rigFrame);
	context.restore();
}
