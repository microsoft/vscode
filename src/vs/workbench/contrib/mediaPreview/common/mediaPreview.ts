/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';

/**
 * Editor resolver id of the image preview. Kept identical to the view type of the image preview
 * custom editor that previously shipped in the `media-preview` extension so that existing
 * `workbench.editorAssociations` and `vscode.openWith` callers continue to work.
 */
export const IMAGE_PREVIEW_EDITOR_ID = 'imagePreview.previewEditor';

/**
 * Editor resolver id of the video preview. Kept identical to the view type of the video preview
 * custom editor that previously shipped in the `media-preview` extension.
 */
export const VIDEO_PREVIEW_EDITOR_ID = 'vscode.videoPreview';

/**
 * Editor resolver id of the audio preview. Kept identical to the view type of the audio preview
 * custom editor that previously shipped in the `media-preview` extension.
 */
export const AUDIO_PREVIEW_EDITOR_ID = 'vscode.audioPreview';

export const IMAGE_PREVIEW_FILE_PATTERN = '*.{jpg,jpe,jpeg,png,bmp,gif,ico,webp,avif,svg}';
export const VIDEO_PREVIEW_FILE_PATTERN = '*.{mp4,webm}';
export const AUDIO_PREVIEW_FILE_PATTERN = '*.{mp3,wav,ogg,oga}';

export const VIDEO_PREVIEW_AUTO_PLAY_SETTING = 'mediaPreview.video.autoPlay';
export const VIDEO_PREVIEW_LOOP_SETTING = 'mediaPreview.video.loop';

const gitLfsPointerPrefix = 'version https://git-lfs.github.com/spec/v1';
const gitLfsPointerMaxSize = 1024;

/**
 * Checks if a resource from the git extension is a Git LFS pointer file instead of the actual
 * media file. Such pointers are small text files that can't be previewed.
 */
export async function isGitLfsPointer(fileService: IFileService, resource: URI): Promise<boolean> {
	if (resource.scheme !== Schemas.git) {
		return false;
	}

	try {
		const stat = await fileService.stat(resource);
		if (stat.size === 0 || stat.size > gitLfsPointerMaxSize) {
			return false;
		}

		const content = await fileService.readFile(resource);
		return content.value.toString().startsWith(gitLfsPointerPrefix);
	} catch {
		return false;
	}
}
