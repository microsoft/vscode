/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Intent } from '../../common/constants';
import { GenericInlineIntentInvocation } from '../../context/node/resolvers/genericInlineIntentInvocation';
import { GenericPanelIntentInvocation } from '../../context/node/resolvers/genericPanelIntentInvocation';
import { EditStrategy } from '../../prompt/node/editGeneration';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo } from '../../prompt/node/intents';


export class UnknownIntent implements IIntent {

	static readonly ID = Intent.Unknown;

	readonly id = UnknownIntent.ID;
	readonly locations = [ChatLocation.Editor, ChatLocation.Panel];
	readonly description = l10n.t('Intent of this command is unclear or is not related to information technologies');
	readonly commandInfo: IIntentSlashCommandInfo = { hiddenFromUser: true };

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
	) { }

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {
		const { location, documentContext, request } = invocationContext;
		const endpoint = await this.endpointProvider.getChatEndpoint(request);
		if (location === ChatLocation.Editor) {
			if (!documentContext) {
				throw new Error('Open a file to add code.');
			}
			return this.instantiationService.createInstance(GenericInlineIntentInvocation, this, location, endpoint, documentContext, EditStrategy.FallbackToReplaceRange);
		}
		return this.instantiationService.createInstance(GenericPanelIntentInvocation, this, location, endpoint, undefined, documentContext);
	}
}
