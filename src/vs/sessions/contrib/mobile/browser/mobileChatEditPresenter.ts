/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, constObservable } from '../../../../base/common/observable.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChatEditCompareModelFactory, IChatEditPhoneDiff, IChatEditPhonePresenter, IChatEditPhonePresenterImpl } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatEditPhonePresenter.js';
import { IChatTextEditGroup } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatResponseViewModel } from '../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { IMobileDiffViewData, MOBILE_OPEN_DIFF_VIEW_COMMAND_ID } from '../../../browser/parts/mobile/contributions/mobileDiffView.js';
import { MobileChatEditRow } from './mobileChatEditRow.js';

/**
 * Phone presentation of agent edits in the chat transcript: an edit row opens
 * the phone diff overlay through the shared `sessions.mobile.openDiffView`
 * command, which owns the overlay's lifetime and back-navigation.
 *
 * The mobile workbench fixes the viewport class to `phone`, so the presenter
 * is always enabled in this bundle.
 */
class MobileChatEditPresenter extends Disposable implements IChatEditPhonePresenterImpl {

	readonly enabled: IObservable<boolean> = constObservable(true);

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	renderTextEdit(edit: IChatTextEditGroup, response: IChatResponseViewModel, createModel: ChatEditCompareModelFactory): MobileChatEditRow {
		return this.instantiationService.createInstance(MobileChatEditRow, edit, response, createModel, diff => this.openDiff(diff));
	}

	async openDiff(diff: IChatEditPhoneDiff): Promise<boolean> {
		// The counts on the row are display metadata that may be absent or not
		// yet computed, so they never decide whether the file changed; the view
		// reads both sides and computes the hunks itself.
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

class MobileChatEditPresenterContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.mobileChatEditPresenter';

	private readonly _registration = this._register(new MutableDisposable());

	constructor(
		@IChatEditPhonePresenter presenter: IChatEditPhonePresenter,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const impl = this._register(instantiationService.createInstance(MobileChatEditPresenter));
		this._registration.value = presenter.setImpl(impl);
	}
}

registerWorkbenchContribution2(MobileChatEditPresenterContribution.ID, MobileChatEditPresenterContribution, WorkbenchPhase.BlockRestore);
