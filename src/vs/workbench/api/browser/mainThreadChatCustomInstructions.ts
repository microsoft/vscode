/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExtHostChatCustomInstructionsShape, ExtHostContext, MainContext, MainThreadChatCustomInstructionsShape } from 'vs/workbench/api/common/extHost.protocol';
import { IChatCustomInstruction, IChatCustomInstructionsService } from 'vs/workbench/contrib/chat/common/chatCustomInstructionsService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadChatCustomInstructions)
export class MainThreadChatCustomInstructions implements MainThreadChatCustomInstructionsShape {

	private readonly proxy: ExtHostChatCustomInstructionsShape;

	private readonly providerRegistrations = new Map<number, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatCustomInstructionsService private readonly chatCustomInstructionsService: IChatCustomInstructionsService
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatCustomInstructions);
	}

	$registerProvider(handle: number): void {
		this.providerRegistrations.set(handle, this.chatCustomInstructionsService.registerProvider({
			provideCustomInstructions: (token: CancellationToken): Promise<IChatCustomInstruction[] | undefined> => {
				return this.proxy.$provideCustomInstructions(handle, token).then(dtos => dtos?.map(dto => ({ name: dto.name, resource: URI.revive(dto.resource) })));
			}
		}));
	}

	$unregisterProvider(handle: number): void {
		const registration = this.providerRegistrations.get(handle);
		if (registration) {
			registration.dispose();
			this.providerRegistrations.delete(handle);
		}
	}

	dispose(): void {
		this.providerRegistrations.forEach(disposable => disposable.dispose());
		this.providerRegistrations.clear();
	}
}
