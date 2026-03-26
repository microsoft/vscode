/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64 } from '../../../../base/common/buffer.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

const IMAGE_FILE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];

function getMimeType(extension: string): string {
	switch (extension.toLowerCase()) {
		case 'jpg':
		case 'jpeg': return 'image/jpeg';
		case 'gif': return 'image/gif';
		case 'webp': return 'image/webp';
		case 'svg': return 'image/svg+xml';
		case 'bmp': return 'image/bmp';
		case 'avif': return 'image/avif';
		default: return 'image/png';
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'editor.action.selectBackgroundImage',
			title: localize2('selectBackgroundImage', 'Select Editor Background Image'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const fileDialogService = accessor.get(IFileDialogService);
		const configurationService = accessor.get(IConfigurationService);
		const fileService = accessor.get(IFileService);

		const files = await fileDialogService.showOpenDialog({
			title: localize('selectImageTitle', 'Select Background Image'),
			filters: [
				{ name: localize('imageFiles', 'Image Files'), extensions: IMAGE_FILE_EXTENSIONS },
				{ name: localize('allFiles', 'All Files'), extensions: ['*'] }
			],
			canSelectMany: false,
			canSelectFiles: true,
			canSelectFolders: false,
		});

		if (!files || files.length === 0) {
			return;
		}

		const fileUri = files[0];
		const content = await fileService.readFile(fileUri);
		const extension = fileUri.path.split('.').pop() ?? 'png';
		const mimeType = getMimeType(extension);
		const base64 = encodeBase64(content.value);
		const dataUri = `data:${mimeType};base64,${base64}`;

		await configurationService.updateValue('editor.backgroundImage', dataUri, ConfigurationTarget.USER);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'editor.action.removeBackgroundImage',
			title: localize2('removeBackgroundImage', 'Remove Editor Background Image'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		await configurationService.updateValue('editor.backgroundImage', '', ConfigurationTarget.USER);
	}
});
