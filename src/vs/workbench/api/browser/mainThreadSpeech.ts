/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostContext, ExtHostSpeechShape, MainContext, MainThreadSpeechShape } from 'vs/workbench/api/common/extHost.protocol';
import { ISpeechProviderMetadata, ISpeechService, ISpeechToTextEvent } from 'vs/workbench/contrib/speech/common/speechService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

type SpeechToTextSession = {
	readonly onDidChange: Emitter<ISpeechToTextEvent>;
};

@extHostNamedCustomer(MainContext.MainThreadSpeech)
export class MainThreadSpeech extends Disposable implements MainThreadSpeechShape {

	private readonly proxy: ExtHostSpeechShape;

	private readonly providerRegistrations = new Map<number, IDisposable>();
	private readonly providerSessions = new Map<number, SpeechToTextSession>();

	constructor(
		extHostContext: IExtHostContext,
		@ISpeechService private readonly speechService: ISpeechService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostSpeech);
	}

	$registerProvider(handle: number, identifier: string, metadata: ISpeechProviderMetadata): void {
		this.logService.trace('[Speech] extension registered provider', metadata.extension.value);

		const registration = this.speechService.registerSpeechProvider(identifier, {
			metadata,
			createSpeechToTextSession: token => {
				const cts = new CancellationTokenSource(token);
				const session = Math.random();

				this.proxy.$createSpeechToTextSession(handle, session, cts.token);
				token.onCancellationRequested(() => this.proxy.$cancelSpeechToTextSession(session));

				const onDidChange = new Emitter<ISpeechToTextEvent>();
				this.providerSessions.set(session, { onDidChange });

				return {
					onDidChange: onDidChange.event,
					dispose: () => {
						cts.dispose(true);
						onDidChange.dispose();
						this.providerSessions.delete(session);
					}
				};
			}
		});
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

	$emitSpeechToTextEvent(session: number, event: ISpeechToTextEvent): void {
		const providerSession = this.providerSessions.get(session);
		if (providerSession) {
			providerSession.onDidChange.fire(event);
		}
	}
}
