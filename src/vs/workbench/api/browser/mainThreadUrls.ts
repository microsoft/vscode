/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostContext, MainContext, MainThreadUrlsShape, ExtHostUrlsShape } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { IURLService, IOpenURLOptions } from '../../../platform/url/common/url.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { IExtensionContributedURLHandler, IExtensionUrlHandler } from '../../services/extensions/browser/extensionUrlHandler.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { ITrustedDomainService } from '../../contrib/url/browser/trustedDomainService.js';
import { INotificationService, Severity } from '../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { localize } from '../../../nls.js';

class ExtensionUrlHandler implements IExtensionContributedURLHandler {

	constructor(
		private readonly proxy: ExtHostUrlsShape,
		private readonly handle: number,
		readonly extensionId: ExtensionIdentifier,
		readonly extensionDisplayName: string
	) { }

	async handleURL(uri: URI, options?: IOpenURLOptions): Promise<boolean> {
		if (!ExtensionIdentifier.equals(this.extensionId, uri.authority)) {
			return false;
		}

		await this.proxy.$handleExternalUri(this.handle, uri);
		return true;
	}
}

@extHostNamedCustomer(MainContext.MainThreadUrls)
export class MainThreadUrls extends Disposable implements MainThreadUrlsShape {

	private readonly proxy: ExtHostUrlsShape;
	private readonly handlers = new Map<number, { extensionId: ExtensionIdentifier; disposable: IDisposable }>();

	constructor(
		context: IExtHostContext,
		@ITrustedDomainService trustedDomainService: ITrustedDomainService,
		@IURLService private readonly urlService: IURLService,
		@IExtensionUrlHandler private readonly extensionUrlHandler: IExtensionUrlHandler,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		this.proxy = context.getProxy(ExtHostContext.ExtHostUrls);

		// Expose this extension host as a pre-activation CSRF verifier.
		this._register(this.extensionUrlHandler.registerCsrfVerifier({
			verifyCsrf: (extensionId, uri, secretFile) => this.proxy.$verifyCsrf(extensionId, uri, secretFile)
		}));
	}

	async $registerUriHandler(handle: number, extensionId: ExtensionIdentifier, extensionDisplayName: string): Promise<void> {
		const handler = new ExtensionUrlHandler(this.proxy, handle, extensionId, extensionDisplayName);
		const disposable = this.urlService.registerHandler(handler);

		this.handlers.set(handle, { extensionId, disposable });
		this.extensionUrlHandler.registerExtensionHandler(extensionId, handler);

		return undefined;
	}

	async $unregisterUriHandler(handle: number): Promise<void> {
		const tuple = this.handlers.get(handle);

		if (!tuple) {
			return undefined;
		}

		const { extensionId, disposable } = tuple;

		this.extensionUrlHandler.unregisterExtensionHandler(extensionId);
		this.handlers.delete(handle);
		disposable.dispose();

		return undefined;
	}

	async $createAppUri(uri: UriComponents): Promise<URI> {
		return this.urlService.create(uri);
	}

	async $notifyCsrfDeeplinkRejection(extensionId: ExtensionIdentifier, extensionDisplayName: string): Promise<void> {
		const message = localize('csrfRejected', "VS Code blocked an unauthenticated link to the '{0}' extension. The link was not signed by a trusted local source.", extensionDisplayName);

		this.notificationService.prompt(Severity.Warning, message, [{
			label: localize('showLogs', "Show Logs"),
			run: () => this.commandService.executeCommand('workbench.action.showLogs')
		}]);
	}

	override dispose(): void {
		super.dispose();

		this.handlers.forEach(({ disposable }) => disposable.dispose());
		this.handlers.clear();
	}
}
