/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostChatCustomInstructionsShape, ExtHostContext, ExtHostSpeechShape, MainContext, MainThreadSpeechShape } from 'vs/workbench/api/common/extHost.protocol';
import { IChatCustomInstructionProvider, IChatCustomInstructionsService } from 'vs/workbench/contrib/chat/common/chatCustomInstructionsService';
import { IKeywordRecognitionEvent, ISpeechProviderMetadata, ISpeechService, ISpeechToTextEvent, ITextToSpeechEvent, TextToSpeechStatus } from 'vs/workbench/contrib/speech/common/speechService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadSpeech)
export class MainThreadChatCustomInstructions implements MainThreadChatCustomInstructionsShape {

	private readonly proxy: ExtHostChatCustomInstructionsShape;

	private readonly providerRegistrations = new Map<number, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatCustomInstructionsService private readonly chatCustomInstructionsService: IChatCustomInstructionsService,
		@ILogService private readonly logService: ILogService
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatCustomInstructions);
	}

	$registerProvider(handle: number, identifier: string, provider: IChatCustomInstructionProvider): void {
		this.logService.trace('[Speech] extension registered provider', metadata.extension.value);

		const registration = this.chatCustomInstructionsService.registerProvider(identifier, provider);
		this.providerRegistrations.set(handle, {
			dispose: () => {
				registration.dispose();
			}
		});
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
