/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostContext, ExtHostSpeechProviderShape, MainContext, MainThreadSpeechProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import { ISpeechProviderMetadata, ISpeechService } from 'vs/workbench/contrib/speech/common/speechService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadSpeechProvider)
export class MainThreadSpeechProvider extends Disposable implements MainThreadSpeechProviderShape {

	private readonly proxy: ExtHostSpeechProviderShape;
	private readonly providerRegistrations = this._register(new DisposableMap<number>());

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

		const registration = this.speechService.registerSpeechProvider(identifier, {
			metadata,
			speechToText: (token) => {
				return this.proxy.$provideSpeechToText(handle, token);
			}
		});
		this.providerRegistrations.set(handle, registration);
	}

	$unregisterProvider(handle: number): void {
		this.providerRegistrations.deleteAndDispose(handle);
	}
}
