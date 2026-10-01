/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { foreground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ChatPetVariant } from './chatPetService.js';
import { IChatPetAccessory } from './chatPetAchievements.js';
import { drawChatPetAccessory, drawChatPetComposite, getChatPetAccessoryImageSource, hasChatPetAccessoryImageDimensions, hasChatPetBodyImageDimensions } from './widget/chatPetAccessoryRenderer.js';

export const CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE = 96;

export function renderChatPetAchievementPreview(
	canvas: HTMLCanvasElement,
	accessory: IChatPetAccessory | undefined,
	unlocked: boolean,
	variant: ChatPetVariant,
	themeService: IThemeService,
	logService: ILogService,
): IDisposable {
	const store = new DisposableStore();
	const bodyImage = DOM.$('img') as HTMLImageElement;
	const accessoryImage = accessory ? DOM.$('img') as HTMLImageElement : undefined;
	const accessorySource = accessory ? getChatPetAccessoryImageSource(accessory) : undefined;
	const bodySource = FileAccess.asBrowserUri(`vs/workbench/contrib/chat/browser/widget/media/chatPet/buddy-idle-${variant}-96.png`).toString(true);
	let bodyLoaded = !unlocked;
	let accessoryLoaded = accessory === undefined;
	const draw = () => {
		if (!bodyLoaded || !accessoryLoaded) {
			return;
		}
		const context = canvas.getContext('2d');
		if (!context) {
			return;
		}
		context.imageSmoothingEnabled = false;
		if (unlocked) {
			drawChatPetComposite(
				context,
				bodyImage,
				accessoryImage,
				0,
				0,
				CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE,
				CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE,
				'right',
				'idle',
				undefined,
				true,
				accessory?.eyeAccessoryMirrorsWithFacing !== false,
				accessory?.coversAntennae === true,
			);
			return;
		}
		context.clearRect(0, 0, CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE, CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE);
		if (!accessoryImage) {
			return;
		}
		drawChatPetAccessory(context, accessoryImage, 'idle', 0, 'right');
		context.globalCompositeOperation = 'source-in';
		const silhouetteColor = themeService.getColorTheme().getColor(foreground);
		if (!silhouetteColor) {
			context.clearRect(0, 0, CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE, CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE);
			context.globalCompositeOperation = 'source-over';
			return;
		}
		context.fillStyle = silhouetteColor.toString();
		context.fillRect(0, 0, CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE, CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE);
		context.globalCompositeOperation = 'source-over';
	};

	if (unlocked) {
		store.add(DOM.addDisposableListener(bodyImage, 'load', () => {
			if (!hasChatPetBodyImageDimensions(bodyImage, CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE, CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE, 1)) {
				logService.error(`[ChatPetAchievementPreview] Invalid preview body dimensions: ${bodySource}`);
				return;
			}
			bodyLoaded = true;
			draw();
		}));
		store.add(DOM.addDisposableListener(bodyImage, 'error', () => {
			logService.error(`[ChatPetAchievementPreview] Failed to load preview body: ${bodySource}`);
		}));
		bodyImage.src = bodySource;
	}
	if (accessoryImage && accessorySource) {
		store.add(DOM.addDisposableListener(accessoryImage, 'load', () => {
			if (!hasChatPetAccessoryImageDimensions(accessoryImage, accessorySource)) {
				logService.error(`[ChatPetAchievementPreview] Invalid preview accessory dimensions: ${accessorySource.url}`);
				return;
			}
			accessoryLoaded = true;
			draw();
		}));
		store.add(DOM.addDisposableListener(accessoryImage, 'error', () => {
			logService.error(`[ChatPetAchievementPreview] Failed to load preview accessory: ${accessorySource.url}`);
		}));
		accessoryImage.src = accessorySource.url;
	}

	return store;
}
