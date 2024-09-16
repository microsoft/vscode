/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ICodeMapperProvider, ICodeMapperRequest, ICodeMapperResult, ICodeMapperService } from '../../contrib/chat/common/chatCodeMapperService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostCodeMapperShape, ExtHostContext, ICodeMapperProgressDto, MainContext, MainThreadCodeMapperShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadCodeMapper)
export class MainThreadChatCodemapper extends Disposable implements MainThreadCodeMapperShape {

	private providers = this._register(new DisposableMap<number, ICodeMapperProvider>());
	private readonly _proxy: ExtHostCodeMapperShape;
	private static _requestHandlePool: number = 0;
	private static _requestHandleMap: Map<number, string> = new Map<number, string>();

	constructor(
		extHostContext: IExtHostContext,
		@ICodeMapperService private readonly codeMapperService: ICodeMapperService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostCodeMapper);
	}
	$mapCode(request: ICodeMapperRequest, token: CancellationToken): Promise<ICodeMapperResult | null> {
		throw new Error('Method not implemented.');
	}

	$registerCodeMapperProvider(handle: number): void {
		const impl = {
			mapCode: (request: ICodeMapperRequest, token: CancellationToken) => {
				return this._proxy.$mapCode(handle, request, token).then((result) => result ?? undefined);
			},
			dispose: () => {
				this.$unregisterCodeMapperProvider(handle);
			}
		};

		this.codeMapperService.registerCodeMapperProvider(handle, impl);
		this.providers.set(handle, impl);
	}

	$unregisterCodeMapperProvider(handle: number): void {
		this.providers.deleteAndDispose(handle);
	}

	$handleProgress(requestId: string, data: ICodeMapperProgressDto): Promise<void> {
		throw new Error('Method not implemented.');
	}
}
