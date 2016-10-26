/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { AbstractExtensionService, ActivatedExtension } from 'vs/platform/extensions/common/abstractExtensionService';
import { IExtensionsRuntimeService, IMessage, IExtensionDescription, IExtensionsStatus } from 'vs/platform/extensions/common/extensions';
import { ExtensionsRegistry, ExtensionPoint, IExtensionPointUser, ExtensionMessageCollector } from 'vs/platform/extensions/common/extensionsRegistry';
import { IMessageService } from 'vs/platform/message/common/message';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostContext, ExtHostExtensionServiceShape } from './extHost.protocol';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

/**
 * Represents a failed extension in the ext host.
 */
class MainProcessFailedExtension extends ActivatedExtension {
	constructor() {
		super(true);
	}
}

/**
 * Represents an extension that was successfully loaded or an
 * empty extension in the ext host.
 */
class MainProcessSuccessExtension extends ActivatedExtension {
	constructor() {
		super(false);
	}
}

function messageWithSource(msg: IMessage): string {
	return (msg.source ? '[' + msg.source + ']: ' : '') + msg.message;
}

const hasOwnProperty = Object.hasOwnProperty;

export class MainProcessExtensionService extends AbstractExtensionService<ActivatedExtension> {

	private _threadService: IThreadService;
	private _messageService: IMessageService;
	private _proxy: ExtHostExtensionServiceShape;
	private _isDev: boolean;
	private _extensionsStatus: { [id: string]: IExtensionsStatus };

	/**
	 * This class is constructed manually because it is a service, so it doesn't use any ctor injection
	 */
	constructor(
		@IThreadService threadService: IThreadService,
		@IMessageService messageService: IMessageService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IExtensionsRuntimeService extensionsRuntimeService: IExtensionsRuntimeService
	) {
		super(false);
		this._isDev = !environmentService.isBuilt || !!environmentService.extensionDevelopmentPath;

		this._messageService = messageService;
		this._threadService = threadService;
		this._proxy = this._threadService.get(ExtHostContext.ExtHostExtensionService);
		this._extensionsStatus = {};

		extensionsRuntimeService.getExtensions().then((extensionDescriptions) => this._onExtensionDescriptions(extensionDescriptions));
	}

	private _handleMessage(msg: IMessage) {
		this._showMessage(msg.type, messageWithSource(msg));

		if (!this._extensionsStatus[msg.source]) {
			this._extensionsStatus[msg.source] = { messages: [] };
		}
		this._extensionsStatus[msg.source].messages.push(msg);
	}

	public $localShowMessage(severity: Severity, msg: string): void {
		let messageShown = false;
		if (severity === Severity.Error || severity === Severity.Warning) {
			if (this._isDev) {
				// Only show nasty intrusive messages if doing extension development.
				this._messageService.show(severity, msg);
				messageShown = true;
			}
		}

		if (!messageShown) {
			switch (severity) {
				case Severity.Error:
					console.error(msg);
					break;
				case Severity.Warning:
					console.warn(msg);
					break;
				default:
					console.log(msg);
			}
		}
	}

	// -- overwriting AbstractExtensionService

	public getExtensionsStatus(): { [id: string]: IExtensionsStatus } {
		return this._extensionsStatus;
	}

	protected _showMessage(severity: Severity, msg: string): void {
		this._proxy.$localShowMessage(severity, msg);
		this.$localShowMessage(severity, msg);
	}

	protected _createFailedExtension(): ActivatedExtension {
		return new MainProcessFailedExtension();
	}

	protected _actualActivateExtension(extensionDescription: IExtensionDescription): TPromise<ActivatedExtension> {

		// redirect extension activation to the extension host
		return this._proxy.$activateExtension(extensionDescription).then(_ => {

			// the extension host calls $onExtensionActivated, where we write to `_activatedExtensions`
			return this._activatedExtensions[extensionDescription.id];
		});
	}

	// -- called by extension host

	private _onExtensionDescriptions(extensionDescriptions: IExtensionDescription[]): void {
		this._registry.registerExtensions(extensionDescriptions);

		let availableExtensions = this._registry.getAllExtensionDescriptions();
		let extensionPoints = ExtensionsRegistry.getExtensionPoints();

		for (let i = 0, len = extensionPoints.length; i < len; i++) {
			this._handleExtensionPoint(extensionPoints[i], availableExtensions);
		}

		this._triggerOnReady();
	}

	private _handleExtensionPoint<T>(extensionPoint: ExtensionPoint<T>, availableExtensions: IExtensionDescription[]): void {
		let messageHandler = (msg: IMessage) => this._handleMessage(msg);

		let users: IExtensionPointUser<T>[] = [], usersLen = 0;
		for (let i = 0, len = availableExtensions.length; i < len; i++) {
			let desc = availableExtensions[i];

			if (desc.contributes && hasOwnProperty.call(desc.contributes, extensionPoint.name)) {
				users[usersLen++] = {
					description: desc,
					value: desc.contributes[extensionPoint.name],
					collector: new ExtensionMessageCollector(messageHandler, desc.extensionFolderPath)
				};
			}
		}

		extensionPoint.acceptUsers(users);
	}

	public $onExtensionActivated(extensionId: string): void {
		this._activatedExtensions[extensionId] = new MainProcessSuccessExtension();
	}

	public $onExtensionActivationFailed(extensionId: string): void {
		this._activatedExtensions[extensionId] = new MainProcessFailedExtension();
	}
}
