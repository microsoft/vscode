/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, autorun } from '../../../../base/common/observable.js';
import { allChatPetAccessories } from '../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { drawChatPetComposite } from '../../../../workbench/contrib/chat/browser/widget/chatPetAccessoryRenderer.js';
import { getChatPetFrameDurations } from '../../../../workbench/contrib/chat/browser/widget/chatPetWidget.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { ThreadAvatarId, ThreadAvatarIds } from '../../../services/threads/browser/threadsService.js';

const THREAD_AVATAR_SOURCE_SIZE = 96;
const threadAvatarBodySource = new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/buddy-idle-stable-96.png', import.meta.url).toString();
const threadAvatarRenderingSource = new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/buddy-rendering-stable-tracking-96.spritesheet.png', import.meta.url).toString();
const threadAvatarRenderingReducedMotionSource = new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/buddy-rendering-stable-tracking-96.png', import.meta.url).toString();
const threadAvatarAccessorySources: Partial<Record<ThreadAvatarId, string>> = {
	[ThreadAvatarIds.Cowboy]: new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/accessories/cowboy-hat.png', import.meta.url).toString(),
	[ThreadAvatarIds.Wizard]: new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/accessories/wizard-hat.png', import.meta.url).toString(),
	[ThreadAvatarIds.Chef]: new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/accessories/white-chef-hat.png', import.meta.url).toString(),
	[ThreadAvatarIds.Artist]: new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/accessories/artist-beret.png', import.meta.url).toString(),
	[ThreadAvatarIds.Crown]: new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/accessories/crown.png', import.meta.url).toString(),
	[ThreadAvatarIds.Propeller]: new URL('../../../../workbench/contrib/chat/browser/widget/media/chatPet/accessories/propeller-hat.png', import.meta.url).toString(),
};

export function renderThreadAvatar(
	container: HTMLElement,
	avatar: ThreadAvatarId,
	status: IObservable<SessionStatus>,
	motionReduced: IObservable<boolean>,
): IDisposable {
	const store = new DisposableStore();
	const frameTimer = store.add(new MutableDisposable());
	const canvas = DOM.append(container, DOM.$<HTMLCanvasElement>('canvas.thread-avatar'));
	canvas.width = THREAD_AVATAR_SOURCE_SIZE;
	canvas.height = THREAD_AVATAR_SOURCE_SIZE;
	canvas.setAttribute('aria-hidden', 'true');
	const idleBody = new Image();
	const renderingBody = new Image();
	const renderingReducedMotionBody = new Image();
	const accessorySource = threadAvatarAccessorySources[avatar];
	const accessory = accessorySource ? new Image() : undefined;
	const accessoryDefinition = avatar === ThreadAvatarIds.None
		? undefined
		: allChatPetAccessories.find(accessory => accessory.id === avatar);
	if (avatar !== ThreadAvatarIds.None && !accessoryDefinition) {
		throw new Error(`Unknown Thread avatar: ${avatar}`);
	}
	const frameDurations = getChatPetFrameDurations('rendering');
	let running = false;
	let reducedMotion = false;
	let frameIndex = 0;
	let frameStartedAt = 0;

	const drawPupils = (context: CanvasRenderingContext2D, index: number) => {
		const bobOffset = index >= 20 ? 4 : 0;
		context.fillStyle = '#191a1b';
		context.fillRect(44, 64 + bobOffset, 8, 16);
		context.fillRect(68, 64 + bobOffset, 8, 16);
	};
	const draw = () => {
		const body = running
			? reducedMotion ? renderingReducedMotionBody : renderingBody
			: idleBody;
		if (!body.complete || body.naturalWidth === 0 || (accessory && (!accessory.complete || accessory.naturalWidth === 0))) {
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
			running && !reducedMotion ? frameIndex : 0,
			running && !reducedMotion ? frameIndex : 0,
			THREAD_AVATAR_SOURCE_SIZE,
			THREAD_AVATAR_SOURCE_SIZE,
			'right',
			running ? 'rendering' : 'idle',
			undefined,
			true,
			accessoryDefinition?.eyeAccessoryMirrorsWithFacing !== false,
			accessoryDefinition?.coversAntennae === true,
		);
		if (running) {
			drawPupils(context, reducedMotion ? 0 : frameIndex);
		}
	};
	const scheduleFrame = () => {
		frameTimer.clear();
		if (!running || reducedMotion || frameDurations.length === 0) {
			return;
		}
		const targetWindow = DOM.getWindow(container);
		const elapsed = targetWindow.performance.now() - frameStartedAt;
		const duration = frameDurations[frameIndex];
		frameTimer.value = disposableTimeout(() => {
			frameIndex = (frameIndex + 1) % frameDurations.length;
			frameStartedAt = targetWindow.performance.now();
			draw();
			scheduleFrame();
		}, Math.max(0, duration - elapsed));
	};
	const onLoad = () => {
		draw();
		scheduleFrame();
	};
	idleBody.addEventListener('load', onLoad);
	renderingBody.addEventListener('load', onLoad);
	renderingReducedMotionBody.addEventListener('load', onLoad);
	accessory?.addEventListener('load', onLoad);
	store.add({
		dispose: () => {
			idleBody.removeEventListener('load', onLoad);
			renderingBody.removeEventListener('load', onLoad);
			renderingReducedMotionBody.removeEventListener('load', onLoad);
			accessory?.removeEventListener('load', onLoad);
			canvas.remove();
		},
	});
	store.add(autorun(reader => {
		const nextRunning = status.read(reader) === SessionStatus.InProgress;
		const nextReducedMotion = motionReduced.read(reader);
		if (nextRunning === running && nextReducedMotion === reducedMotion) {
			return;
		}
		running = nextRunning;
		reducedMotion = nextReducedMotion;
		canvas.classList.toggle('running', running);
		frameIndex = 0;
		frameStartedAt = DOM.getWindow(container).performance.now();
		draw();
		scheduleFrame();
	}));
	idleBody.src = threadAvatarBodySource;
	renderingBody.src = threadAvatarRenderingSource;
	renderingReducedMotionBody.src = threadAvatarRenderingReducedMotionSource;
	if (accessory && accessorySource) {
		accessory.src = accessorySource;
	}
	return store;
}
