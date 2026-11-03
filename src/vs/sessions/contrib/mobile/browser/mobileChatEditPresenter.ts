/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatEditCompareModelFactory, IChatEditDiff, IChatEditPresentationService } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatEditPresentation.js';
import { IChatExternalEdit } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatTextEditGroup } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatResponseViewModel } from '../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { IMobileDiffViewData, MOBILE_OPEN_DIFF_VIEW_COMMAND_ID } from '../../../browser/parts/mobile/contributions/mobileDiffView.js';
import { MobileChatEditRow } from './mobileChatEditRow.js';

export class MobileChatEditPresenter implements IChatEditPresentationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	renderTextEdit(edit: IChatTextEditGroup, response: IChatResponseViewModel, createModel: ChatEditCompareModelFactory): MobileChatEditRow {
		return this.instantiationService.createInstance(MobileChatEditRow, edit, response, createModel, diff => this.openDiff(diff));
	}

	async openExternalEdit(edit: IChatExternalEdit): Promise<void> {
		await this.openDiff({
			uri: edit.uri,
			originalURI: edit.beforeContentUri,
			modifiedURI: edit.editKind === 'delete' ? undefined : edit.afterContentUri ?? edit.uri,
			added: edit.diff?.added ?? 0,
			removed: edit.diff?.removed ?? 0,
		});
	}

	private async openDiff(diff: IChatEditDiff): Promise<boolean> {
		const data: IMobileDiffViewData = {
			diff: {
				originalURI: diff.originalURI,
				modifiedURI: diff.modifiedURI,
				identical: false,
				added: diff.added,
				removed: diff.removed,
			},
		};
		await this.commandService.executeCommand(MOBILE_OPEN_DIFF_VIEW_COMMAND_ID, data);
		return true;
	}
}
