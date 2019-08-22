/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IURLService } from 'vs/platform/url/common/url';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ServiceIdentifier, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { AbstractURLService } from 'vs/platform/url/common/urlService';
import { Event, Emitter } from 'vs/base/common/event';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { Disposable } from 'vs/base/common/lifecycle';
import { IRequestService } from 'vs/platform/request/common/request';
import { CancellationToken } from 'vs/base/common/cancellation';
import { streamToBuffer } from 'vs/base/common/buffer';
import { ILogService } from 'vs/platform/log/common/log';
import { generateUuid } from 'vs/base/common/uuid';

export interface IURLCallbackProvider {

	/**
	 * Indicates that a Uri has been opened outside of VSCode. The Uri
	 * will be forwarded to all installed Uri handlers in the system.
	 */
	readonly onCallback: Event<URI>;

	/**
	 * Creates a Uri that - if opened in a browser - must result in
	 * the `onCallback` to fire.
	 *
	 * The optional `Partial<UriComponents>` must be properly restored for
	 * the Uri passed to the `onCallback` handler.
	 *
	 * For example: if a Uri is to be created with `scheme:"vscode"`,
	 * `authority:"foo"` and `path:"bar"` the `onCallback` should fire
	 * with a Uri `vscode://foo/bar`.
	 *
	 * If there are additional `query` values in the Uri, they should
	 * be added to the list of provided `query` arguments from the
	 * `Partial<UriComponents>`.
	 */
	create(options?: Partial<UriComponents>): URI;
}

export class BrowserURLService extends AbstractURLService {

	_serviceBrand!: ServiceIdentifier<any>;

	private provider: IURLCallbackProvider;

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		this.provider = environmentService.options && environmentService.options.urlCallbackProvider ? environmentService.options.urlCallbackProvider : instantiationService.createInstance(SelfhostURLCallbackProvider);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.provider.onCallback(uri => this.open(uri)));
	}

	create(options?: Partial<UriComponents>): URI {
		return this.provider.create(options);
	}
}

class SelfhostURLCallbackProvider extends Disposable implements IURLCallbackProvider {

	static FETCH_INTERVAL = 500; 			// fetch every 500ms
	static FETCH_TIMEOUT = 5 * 60 * 1000; 	// ...but stop after 5min

	static QUERY_KEYS = {
		REQUEST_ID: 'vscode-requestId',
		SCHEME: 'vscode-scheme',
		AUTHORITY: 'vscode-authority',
		PATH: 'vscode-path',
		QUERY: 'vscode-query',
		FRAGMENT: 'vscode-fragment'
	};

	private readonly _onCallback: Emitter<URI> = this._register(new Emitter<URI>());
	readonly onCallback: Event<URI> = this._onCallback.event;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	create(options?: Partial<UriComponents>): URI {
		const queryValues: Map<string, string> = new Map();

		const requestId = generateUuid();
		queryValues.set(SelfhostURLCallbackProvider.QUERY_KEYS.REQUEST_ID, requestId);

		const { scheme, authority, path, query, fragment } = options ? options : { scheme: undefined, authority: undefined, path: undefined, query: undefined, fragment: undefined };

		if (scheme) {
			queryValues.set(SelfhostURLCallbackProvider.QUERY_KEYS.SCHEME, scheme);
		}

		if (authority) {
			queryValues.set(SelfhostURLCallbackProvider.QUERY_KEYS.AUTHORITY, authority);
		}

		if (path) {
			queryValues.set(SelfhostURLCallbackProvider.QUERY_KEYS.PATH, path);
		}

		if (query) {
			queryValues.set(SelfhostURLCallbackProvider.QUERY_KEYS.QUERY, query);
		}

		if (fragment) {
			queryValues.set(SelfhostURLCallbackProvider.QUERY_KEYS.FRAGMENT, fragment);
		}

		// Start to poll on the callback being fired
		this.periodicFetchCallback(requestId, Date.now());

		return this.doCreateUri('/callback', queryValues);
	}

	private async periodicFetchCallback(requestId: string, startTime: number): Promise<void> {

		// Ask server for callback results
		const queryValues: Map<string, string> = new Map();
		queryValues.set(SelfhostURLCallbackProvider.QUERY_KEYS.REQUEST_ID, requestId);

		const result = await this.requestService.request({
			url: this.doCreateUri('/fetch-callback', queryValues).toString(true)
		}, CancellationToken.None);

		// Check for callback results
		const content = await streamToBuffer(result.stream);
		if (content.byteLength > 0) {
			try {
				this._onCallback.fire(URI.revive(JSON.parse(content.toString())));
			} catch (error) {
				this.logService.error(error);
			}

			return; // done
		}

		// Continue fetching unless we hit the timeout
		if (Date.now() - startTime < SelfhostURLCallbackProvider.FETCH_TIMEOUT) {
			setTimeout(() => this.periodicFetchCallback(requestId, startTime), SelfhostURLCallbackProvider.FETCH_INTERVAL);
		}
	}

	private doCreateUri(path: string, queryValues: Map<string, string>): URI {
		let query: string | undefined = undefined;

		if (queryValues) {
			let index = 0;
			queryValues.forEach((value, key) => {
				if (!query) {
					query = '';
				}

				const prefix = (index++ === 0) ? '' : '&';
				query += `${prefix}${key}=${encodeURIComponent(value)}`;
			});
		}

		return URI.parse(window.location.href).with({ path, query });
	}
}

registerSingleton(IURLService, BrowserURLService, true);
