/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthType } from 'vs/base/common/auth';
import { Disposable } from 'vs/base/common/lifecycle';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { localize } from 'vs/nls';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import type { IProductConfiguration } from 'vs/workbench/workbench.web.api';

/**
 * @file All client-side customization to VS Code should live in this file when
 * possible.
 */

/**
 * This is called by vs/workbench/browser/web.main.ts after the workbench has
 * been initialized so we can initialize our own client-side code.
 */
export class CodeServerClientAdditions extends Disposable {
	static LOGOUT_COMMAND_ID = 'code-server.logout';
	static AUTH_KEY = 'code-server.authed';
	productConfiguration: Partial<IProductConfiguration>;

	private sourceIsTrustedServiceWorker = (source: string): boolean => {
		return this.productConfiguration.serviceWorker?.url === source;
	};

	private ServiceWorkerScripts = self.trustedTypes?.createPolicy('ServiceWorkerScripts', {
		createScriptURL: source => {
			if (this.sourceIsTrustedServiceWorker(source)) {
				return source;
			}

			throw new Error('Service Worker URL does not align with given product configuration');
		}
	});


	constructor (
		productConfiguration: Partial<IProductConfiguration>,
		@ILogService private logService: ILogService,
		@INotificationService private notificationService: INotificationService,
		@IStorageService private storageService: IStorageService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super();
		this.productConfiguration = productConfiguration;
	}

	async startup(): Promise<void> {
		const { nameShort, updateUrl } = this.productConfiguration;

		await this.registerServiceWorker();

		// Emit client events
		const event = new CustomEvent('ide-ready');
		window.dispatchEvent(event);

		if (parent) {
			// Tell the parent loading has completed.
			parent.postMessage({ event: 'loaded' }, '*');

			// Proxy or stop proxing events as requested by the parent.
			const listeners = new Map<string, (event: Event) => void>();

			window.addEventListener('message', parentEvent => {
				const eventName = parentEvent.data.bind || parentEvent.data.unbind;
				if (eventName) {
					const oldListener = listeners.get(eventName);
					if (oldListener) {
						document.removeEventListener(eventName, oldListener);
					}
				}

				if (parentEvent.data.bind && parentEvent.data.prop) {
					const listener = (event: Event) => {
						parent?.postMessage(
							{
								event: parentEvent.data.event,
								[parentEvent.data.prop]: event[parentEvent.data.prop as keyof Event],
							},
							window.location.origin,
						);
					};
					listeners.set(parentEvent.data.bind, listener);
					document.addEventListener(parentEvent.data.bind, listener);
				}
			});
		}

		if (!window.isSecureContext) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: `${nameShort} is being accessed over an insecure domain. Web views, the clipboard, and other functionality may not work as expected.`,
				actions: {
					primary: [
						{
							id: 'understand',
							label: 'I understand',
							tooltip: '',
							class: undefined,
							enabled: true,
							checked: true,
							dispose: () => undefined,
							run: () => {
								return Promise.resolve();
							},
						},
					],
				},
			});
		}

		const getUpdate = async (updateCheckEndpoint: string): Promise<void> => {
			this.logService.debug('Checking for update...');

			const response = await fetch(updateCheckEndpoint, {
				headers: { Accept: 'application/json' },
			});
			if (!response.ok) {
				throw new Error(response.statusText);
			}
			const json = await response.json();
			if (json.error) {
				throw new Error(json.error);
			}
			if (json.isLatest) {
				return;
			}

			const lastNoti = this.storageService.getNumber('csLastUpdateNotification', StorageScope.GLOBAL);
			if (lastNoti) {
				// Only remind them again after 1 week.
				const timeout = 1000 * 60 * 60 * 24 * 7;
				const threshold = lastNoti + timeout;
				if (Date.now() < threshold) {
					return;
				}
			}

			this.storageService.store('csLastUpdateNotification', Date.now(), StorageScope.GLOBAL, StorageTarget.MACHINE);

			this.notificationService.notify({
				severity: Severity.Info,
				message: `[Code Server v${json.latest}](https://github.com/cdr/code-server/releases/tag/v${json.latest}) has been released!`,
			});
		};

		const updateLoop = (): void => {
			if (!updateUrl) {
				return;
			}

			getUpdate(updateUrl)
				.catch(error => {
					this.logService.debug(`failed to check for update: ${error}`);
				})
				.finally(() => {
					// Check again every 6 hours.
					setTimeout(updateLoop, 1000 * 60 * 60 * 6);
				});
		};

		updateLoop();

		this.appendSessionCommands();
	}

	private appendSessionCommands() {
		const { auth, base, logoutEndpointUrl } = this.productConfiguration;

		// Use to show or hide logout commands and menu options.
		this.contextKeyService.createKey(CodeServerClientAdditions.AUTH_KEY, auth === AuthType.Password);

		CommandsRegistry.registerCommand(CodeServerClientAdditions.LOGOUT_COMMAND_ID, () => {
			if (isFalsyOrWhitespace(logoutEndpointUrl)) {
				throw new Error('Logout URL not provided in product configuration');
			}

			/**
			 * @file 'code-server/src/node/route/logout.ts'
			 */
			const logoutUrl = new URL(logoutEndpointUrl!, window.location.href);
			// Inform the backend about the path since the proxy might have rewritten
			// it out of the headers and cookies must be set with absolute paths.
			logoutUrl.searchParams.set('base', base || ".");
			logoutUrl.searchParams.set('href', window.location.href);
			window.location.assign(logoutUrl);
		});

		for (const menuId of [MenuId.CommandPalette, MenuId.MenubarHomeMenu]) {
			MenuRegistry.appendMenuItem(menuId, {
				command: {
					id: CodeServerClientAdditions.LOGOUT_COMMAND_ID,
					title: localize('logout', 'Sign out of {0}', this.productConfiguration.nameShort),
				},
				when: ContextKeyExpr.has(CodeServerClientAdditions.AUTH_KEY),
			});
		}
	}

	private registerServiceWorker = async (): Promise<void> => {
		const { serviceWorker } = this.productConfiguration;

		if (!serviceWorker) {
			this.logService.debug('Product configuration does not include service worker. Skipping registration...');
			return;
		}
		if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
			this.logService.debug('Browser does not support service workers. Skipping registration...');
			return;
		}

		let trustedUrl: undefined | TrustedScriptURL | string;

		if (this.ServiceWorkerScripts) {
			trustedUrl = this.ServiceWorkerScripts?.createScriptURL(serviceWorker.url);
		} else if (this.sourceIsTrustedServiceWorker(serviceWorker.url)) {
			this.logService.warn('This browser lacks TrustedTypes and cannot verify the service worker path.');
			trustedUrl = serviceWorker.url;
		}

		if (!trustedUrl) {
			throw new Error('Service Worker URL could not be verified');
		}

		try {
			await navigator.serviceWorker.register(trustedUrl as unknown as string, {
				scope: serviceWorker.scope,
			});

			this.logService.info('[Service Worker] registered');
		} catch (error: any) {
			this.logService.error('[Service Worker] registration', error as Error);
		}
	};
}
