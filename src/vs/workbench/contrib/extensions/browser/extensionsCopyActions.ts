/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IExtensionArg, IExtensionsWorkbenchService } from '../common/extensions.js';

// The actions of the context menu of extensions that copy their details. Editor windows and the Agents window both offer
// them, including on the pages of extensions.

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.extensions.action.copyExtension',
			title: localize2('workbench.extensions.action.copyExtension', 'Copy'),
			menu: {
				id: MenuId.ExtensionContext,
				group: '1_copy'
			},
		});
	}

	async run(accessor: ServicesAccessor, extensionId: string): Promise<void> {
		const clipboardService = accessor.get(IClipboardService);
		const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
		const extension = extensionsWorkbenchService.local.filter(e => areSameExtensions(e.identifier, { id: extensionId }))[0]
			|| (await extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
		if (extension) {
			const name = localize('extensionInfoName', 'Name: {0}', extension.displayName);
			const id = localize('extensionInfoId', 'Id: {0}', extensionId);
			const description = localize('extensionInfoDescription', 'Description: {0}', extension.description);
			const verision = localize('extensionInfoVersion', 'Version: {0}', extension.version);
			const publisher = localize('extensionInfoPublisher', 'Publisher: {0}', extension.publisherDisplayName);
			const link = extension.url ? localize('extensionInfoVSMarketplaceLink', 'VS Marketplace Link: {0}', `${extension.url}`) : null;
			const clipboardStr = `${name}\n${id}\n${description}\n${verision}\n${publisher}${link ? '\n' + link : ''}`;
			await clipboardService.writeText(clipboardStr);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.extensions.action.copyExtensionId',
			title: localize2('workbench.extensions.action.copyExtensionId', 'Copy Extension ID'),
			menu: {
				id: MenuId.ExtensionContext,
				group: '1_copy'
			},
		});
	}

	async run(accessor: ServicesAccessor, id: string): Promise<void> {
		await accessor.get(IClipboardService).writeText(id);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.extensions.action.copyLink',
			title: localize2('workbench.extensions.action.copyLink', 'Copy Link'),
			menu: {
				id: MenuId.ExtensionContext,
				group: '1_copy',
				when: ContextKeyExpr.has('extensionHasGalleryLink'),
			},
		});
	}

	async run(accessor: ServicesAccessor, _: string, extension: IExtensionArg): Promise<void> {
		const clipboardService = accessor.get(IClipboardService);
		if (extension.galleryLink) {
			await clipboardService.writeText(extension.galleryLink);
		}
	}
});
