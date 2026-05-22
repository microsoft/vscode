/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { extractSelection, IOpener, IOpenerService, OpenOptions } from '../../../../platform/opener/common/opener.js';
import { IUserInteractionService } from '../../../../platform/userInteraction/browser/userInteractionService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';

export class ChatExternalEditorOpenerContribution extends Disposable implements IWorkbenchContribution, IOpener {

	static readonly ID = 'workbench.contrib.chatExternalEditorOpener';

	constructor(
		@IOpenerService openerService: IOpenerService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IUserInteractionService private readonly userInteractionService: IUserInteractionService,
	) {
		super();
		this._register(openerService.registerOpener(this));
	}

	async open(target: URI | string, options?: OpenOptions): Promise<boolean> {
		if (this.userInteractionService.readModifierKeyStatus(mainWindow, undefined).ctrlKey) {
			return false;
		}

		const uri = typeof target === 'string' ? URI.parse(target) : target;
		const { selection, uri: uriWithoutSelection } = extractSelection(uri);
		const editorOptions: ITextEditorOptions | undefined = options?.editorOptions;
		const targetSelection = selection ?? editorOptions?.selection;
		const resource = fromAgentHostUri(uriWithoutSelection);
		if (resource.scheme !== 'file') {
			return false;
		}

		return this.nativeHostService.openInRider(resource.fsPath, targetSelection?.startLineNumber);
	}
}
