/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IURLService, IURLHandler, IOpenURLOptions } from '../../../../platform/url/common/url.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { URLHandlerChannel } from '../../../../platform/url/common/urlIpc.js';
import { IOpenerService, IOpener } from '../../../../platform/opener/common/opener.js';
import { matchesScheme } from '../../../../base/common/network.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { NativeURLService } from '../../../../platform/url/common/urlService.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export interface IRelayOpenURLOptions extends IOpenURLOptions {
	openToSide?: boolean;
	openExternal?: boolean;
}

export class RelayURLService extends NativeURLService implements IURLHandler, IOpener {

	private urlService: IURLService;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IOpenerService openerService: IOpenerService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IProductService productService: IProductService,
		@ILogService private readonly logService: ILogService
	) {
		super(productService);

		this.urlService = ProxyChannel.toService<IURLService>(mainProcessService.getChannel('url'));

		mainProcessService.registerChannel('urlHandler', new URLHandlerChannel(this));
		openerService.registerOpener(this);
	}

	override create(options?: Partial<UriComponents>): URI {
		const uri = super.create(options);

		let query = uri.query;
		if (!query) {
			query = `windowId=${encodeURIComponent(this.nativeHostService.windowId)}`;
		} else {
			query += `&windowId=${encodeURIComponent(this.nativeHostService.windowId)}`;
		}

		return uri.with({ query });
	}

	override async open(resource: URI | string, options?: IRelayOpenURLOptions): Promise<boolean> {

		if (!matchesScheme(resource, this.productService.urlProtocol)) {
			return false;
		}

		if (typeof resource === 'string') {
			resource = URI.parse(resource);
		}
		return await this.urlService.open(resource, options);
	}

	async handleURL(uri: URI, options?: IOpenURLOptions): Promise<boolean> {
		const result = await super.open(uri, options);

		if (result) {
			this.logService.trace('URLService#handleURL(): handled', uri.toString(true));

			await this.nativeHostService.focusWindow({ force: true /* Application may not be active */, targetWindowId: this.nativeHostService.windowId });
		} else {
			this.logService.trace('URLService#handleURL(): not handled', uri.toString(true));
		}

		return result;
	}
}

registerSingleton(IURLService, RelayURLService, InstantiationType.Eager);
