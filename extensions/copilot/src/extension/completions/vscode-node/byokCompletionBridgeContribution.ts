/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IExtensionContribution } from '../../common/contributions';
import { setupByokCompletionModels } from '../../completions-core/vscode-node/completionsServiceBridges';
import { ICopilotInlineCompletionItemProviderService } from '../common/copilotInlineCompletionItemProviderService';

/**
 * Unconditionally bridges `chatLanguageModels.json` custom (BYOK) models into the
 * completions model manager. This must live outside `CompletionsCoreContribution`,
 * because the joint completions provider (`JointCompletionsProviderContribution`)
 * replaces that contribution entirely and would otherwise never populate the
 * registry — breaking signed-out/offline completions against custom endpoints.
 */
export class ByokCompletionBridgeContribution extends Disposable implements IExtensionContribution {

	public readonly id: string = 'byok-completion-bridge';

	constructor(
		@ICopilotInlineCompletionItemProviderService copilotInlineCompletionItemProviderService: ICopilotInlineCompletionItemProviderService,
	) {
		super();
		const completionsInstaService = copilotInlineCompletionItemProviderService.getOrCreateInstantiationService();
		this._register(completionsInstaService.invokeFunction(setupByokCompletionModels));
	}
}
