/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { allChatPetAccessories } from '../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { drawChatPetComposite } from '../../../../workbench/contrib/chat/browser/widget/chatPetAccessoryRenderer.js';
import { ThreadAvatarId, ThreadAvatarIds } from '../../../services/threads/browser/threadsService.js';

const THREAD_AVATAR_SOURCE_SIZE = 96;
const threadAvatarBodySource = new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/buddy-idle-stable-96.png', import.meta.url).toString();
const threadAvatarAccessorySources: Record<ThreadAvatarId, string> = {
	[ThreadAvatarIds.Cowboy]: new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/accessories/cowboy-hat.png', import.meta.url).toString(),
	[ThreadAvatarIds.Wizard]: new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/accessories/wizard-hat.png', import.meta.url).toString(),
	[ThreadAvatarIds.Chef]: new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/accessories/white-chef-hat.png', import.meta.url).toString(),
	[ThreadAvatarIds.Artist]: new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/accessories/artist-beret.png', import.meta.url).toString(),
	[ThreadAvatarIds.Crown]: new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/accessories/crown.png', import.meta.url).toString(),
	[ThreadAvatarIds.Propeller]: new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/accessories/propeller-hat.png', import.meta.url).toString(),
};

export function renderThreadAvatar(container: HTMLElement, avatar: ThreadAvatarId): IDisposable {
	const store = new DisposableStore();
	const canvas = DOM.append(container, DOM.$<HTMLCanvasElement>('canvas.thread-avatar'));
	canvas.width = THREAD_AVATAR_SOURCE_SIZE;
	canvas.height = THREAD_AVATAR_SOURCE_SIZE;
	canvas.setAttribute('aria-hidden', 'true');
	const body = new Image();
	const accessory = new Image();
	const accessoryDefinition = allChatPetAccessories.find(accessory => accessory.id === avatar);
	if (!accessoryDefinition) {
		throw new Error(`Unknown Thread avatar: ${avatar}`);
	}
	const draw = () => {
		if (!body.complete || body.naturalWidth === 0 || !accessory.complete || accessory.naturalWidth === 0) {
			return;
		}
		const context = canvas.getContext('2d');
		if (!context) {
			return;
		}
		context.imageSmoothingEnabled = false;
		drawChatPetComposite(
			context,
			body,
			accessory,
			0,
			0,
			THREAD_AVATAR_SOURCE_SIZE,
			THREAD_AVATAR_SOURCE_SIZE,
			'right',
			'idle',
			undefined,
			true,
			accessoryDefinition.eyeAccessoryMirrorsWithFacing !== false,
			accessoryDefinition.coversAntennae === true,
		);
	};
	body.addEventListener('load', draw);
	accessory.addEventListener('load', draw);
	store.add({
		dispose: () => {
			body.removeEventListener('load', draw);
			accessory.removeEventListener('load', draw);
			canvas.remove();
		},
	});
	body.src = threadAvatarBodySource;
	accessory.src = threadAvatarAccessorySources[avatar];
	return store;
}
