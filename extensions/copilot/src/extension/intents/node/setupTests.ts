/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { isPreRelease } from '../../../platform/env/common/packagejson';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Intent } from '../../common/constants';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo } from '../../prompt/node/intents';
import { SetupTestsFrameworkQueryInvocation } from './testIntent/setupTestsFrameworkQueryInvocation';
import { SetupTestsInvocation } from './testIntent/setupTestsInvocation';


export class SetupTestsIntent implements IIntent {
	static readonly ID = Intent.SetupTests;
	readonly id = SetupTestsIntent.ID;
	readonly locations = [ChatLocation.Panel];
	readonly description = l10n.t('Set up Tests');
	readonly isListedCapability = false;

	readonly commandInfo: IIntentSlashCommandInfo = {
		allowsEmptyArgs: true,
		defaultEnablement: isPreRelease,
	};

	constructor(
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {
		const endpoint = await this.endpointProvider.getChatEndpoint(invocationContext.request);

		let prompt = invocationContext.request.prompt;
		if (invocationContext.request.acceptedConfirmationData) {
			// todo@connor4312: VS Code currently creates a prompt like `${choice}: "${Confirmation Message}"`
			// and so we parse the choice back out of three
			// note: intentionally not localized as this is used as a prompt instruction:
			prompt = `set up tests in my workspace using \`${prompt.split(':')[0]}\``;
		}

		if (!prompt) {
			return this.instantiationService.createInstance(SetupTestsFrameworkQueryInvocation, this, endpoint, invocationContext.location, invocationContext.documentContext);
		}

		return Promise.resolve(this.instantiationService.createInstance(SetupTestsInvocation, this, endpoint, invocationContext.location, prompt));
	}
}
