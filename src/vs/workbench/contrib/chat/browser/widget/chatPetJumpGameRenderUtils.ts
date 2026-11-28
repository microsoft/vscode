/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IChatPetJumpPlatform } from '../../common/chatPetJumpGame.js';
import type { IChatPetJumpGameRenderState } from './chatPetJumpGameRenderer.js';

export function isChatPetJumpPlatformVisible(platform: IChatPetJumpPlatform, state: IChatPetJumpGameRenderState): boolean {
	const top = state.anchor + state.cameraHeight - platform.height + platform.fallDistance;
	return top >= -16 && top <= state.height && platform.fallDistance < state.petSize * 4;
}
