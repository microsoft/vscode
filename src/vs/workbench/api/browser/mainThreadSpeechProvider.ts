/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostContext, ExtHostSpeechProviderShape, MainContext, MainThreadSpeechProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import { ISpeechProviderMetadata, ISpeechService, ISpeechToTextEvent } from 'vs/workbench/contrib/speech/common/speechService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

interface SpeechProviderRegistration extends IDisposable {
	readonly emitter: Emitter<ISpeechToTextEvent>;
}

@extHostNamedCustomer(MainContext.MainThreadSpeechProvider)
export class MainThreadSpeechProvider extends Disposable implements MainThreadSpeechProviderShape {

	private readonly proxy: ExtHostSpeechProviderShape;
	private readonly providerRegistrations = new Map<number, SpeechProviderRegistration>();

	constructor(
		extHostContext: IExtHostContext,
		@ISpeechService private readonly speechService: ISpeechService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostSpeechProvider);
	}

	$registerProvider(handle: number, identifier: string, metadata: ISpeechProviderMetadata): void {
		this.logService.trace('[Speech] extension registered provider', metadata.extension.value);

		const emitter = new Emitter<ISpeechToTextEvent>();

		const registration = this.speechService.registerSpeechProvider(identifier, {
			metadata,
			speechToText: (token) => {
				this.proxy.$provideSpeechToText(handle, token);

				return emitter.event;
			}
		});
		this.providerRegistrations.set(handle, {
			emitter,
			dispose: () => {
				registration.dispose();
				emitter.dispose();
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

	$emitSpeechToTextEvent(handle: number, event: ISpeechToTextEvent): void {
		const registration = this.providerRegistrations.get(handle);
		if (registration) {
			registration.emitter.fire(event);
		}
	}
}
