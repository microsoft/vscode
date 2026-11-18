/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { IChatPetJumpPlatform, IChatPetJumpWall } from '../../common/chatPetJumpGame.js';
import { isChatPetJumpPlatformVisible } from './chatPetJumpGameRenderUtils.js';

export type ChatPetJumpGameRendererKind = 'dom' | 'lite-webgpu';

export interface IChatPetJumpGameRenderState {
	readonly width: number;
	readonly height: number;
	readonly anchor: number;
	readonly cameraHeight: number;
	readonly petSize: number;
	readonly platforms: readonly IChatPetJumpPlatform[];
	readonly walls: readonly IChatPetJumpWall[];
}

export interface IChatPetJumpGameRenderer extends IDisposable {
	readonly kind: ChatPetJumpGameRendererKind;
	layout(width: number, height: number): void;
	render(state: IChatPetJumpGameRenderState): void;
}

export class ChatPetJumpGameDomRenderer implements IChatPetJumpGameRenderer {
	readonly kind = 'dom';
	private readonly element: HTMLElement;
	private readonly platforms = new Map<number, { element: HTMLElement; integrity: HTMLElement | undefined }>();
	private readonly walls = new Map<number, HTMLElement>();

	constructor(stage: HTMLElement) {
		this.element = dom.prepend(stage, dom.$('.chat-pet-jump-playfield.chat-pet-jump-playfield-dom', { 'aria-hidden': 'true' }));
		this.element.dataset.renderer = this.kind;
	}

	layout(width: number, height: number): void {
		this.element.style.width = `${width}px`;
		this.element.style.height = `${height}px`;
	}

	render(state: IChatPetJumpGameRenderState): void {
		const visible = new Set<number>();
		for (const platform of state.platforms) {
			if (!isChatPetJumpPlatformVisible(platform, state)) {
				continue;
			}
			const top = state.anchor + state.cameraHeight - platform.height + platform.fallDistance;
			visible.add(platform.id);
			let rendered = this.platforms.get(platform.id);
			if (!rendered) {
				const element = dom.append(this.element, dom.$('.chat-pet-jump-platform'));
				element.classList.add(platform.kind);
				const integrity = platform.kind === 'crumbling' ? dom.append(element, dom.$('.chat-pet-jump-platform-integrity')) : undefined;
				rendered = { element, integrity };
				this.platforms.set(platform.id, rendered);
			}
			const { element, integrity } = rendered;
			element.style.left = `${platform.left + platform.width / 2}px`;
			element.style.top = `${top}px`;
			element.style.width = `${platform.width}px`;
			element.classList.toggle('crumbling-active', platform.collapseProgress > 0);
			if (integrity) {
				integrity.style.transform = `scaleX(${1 - platform.collapseProgress})`;
				element.style.opacity = String(1 - platform.fallDistance / (state.petSize * 4));
			}
		}
		const visibleWalls = new Set<number>();
		for (const wall of state.walls) {
			const top = state.anchor + state.cameraHeight - wall.top;
			const height = wall.top - wall.bottom;
			if (top + height < 0 || top > state.height) {
				continue;
			}
			visibleWalls.add(wall.id);
			let element = this.walls.get(wall.id);
			if (!element) {
				element = dom.append(this.element, dom.$('.chat-pet-jump-wall'));
				this.walls.set(wall.id, element);
			}
			element.style.left = `${wall.left}px`;
			element.style.top = `${top}px`;
			element.style.width = `${wall.width}px`;
			element.style.height = `${height}px`;
		}
		for (const [id, element] of this.walls) {
			if (!visibleWalls.has(id)) {
				element.remove();
				this.walls.delete(id);
			}
		}
		for (const [id, { element }] of this.platforms) {
			if (!visible.has(id)) {
				element.remove();
				this.platforms.delete(id);
			}
		}
	}

	dispose(): void {
		this.platforms.clear();
		this.walls.clear();
		this.element.remove();
	}
}
