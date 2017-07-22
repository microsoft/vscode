/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import pkg from 'vs/platform/node/package';
import { localize } from 'vs/nls';
import * as path from 'path';
import URI from 'vs/base/common/uri';
import { AbstractExtensionService, ActivatedExtension } from 'vs/platform/extensions/common/abstractExtensionService';
import { IMessage, IExtensionDescription, IExtensionsStatus } from 'vs/platform/extensions/common/extensions';
import { IExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, getGloballyDisabledExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionsRegistry, ExtensionPoint, IExtensionPointUser, ExtensionMessageCollector } from 'vs/platform/extensions/common/extensionsRegistry';
import { ExtensionScanner, MessagesCollector } from 'vs/workbench/node/extensionPoints';
import { IMessageService } from 'vs/platform/message/common/message';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostContext, ExtHostExtensionServiceShape } from '../node/extHost.protocol';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IStorageService } from 'vs/platform/storage/common/storage';

const SystemExtensionsRoot = path.normalize(path.join(URI.parse(require.toUrl('')).fsPath, '..', 'extensions'));

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

	private _proxy: ExtHostExtensionServiceShape;
	private _isDev: boolean;
	private _extensionsStatus: { [id: string]: IExtensionsStatus };

	/**
	 * This class is constructed manually because it is a service, so it doesn't use any ctor injection
	 */
	constructor(
		@IThreadService private readonly _threadService: IThreadService,
		@IMessageService private readonly _messageService: IMessageService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IExtensionEnablementService extensionEnablementService: IExtensionEnablementService,
		@IStorageService storageService: IStorageService,
	) {
		super(false);
		this._isDev = !environmentService.isBuilt || environmentService.isExtensionDevelopment;

		this._proxy = this._threadService.get(ExtHostContext.ExtHostExtensionService);
		this._extensionsStatus = {};

		this.scanExtensions().done(extensionDescriptions => {
			const disabledExtensions = [
				...getGloballyDisabledExtensions(extensionEnablementService, storageService, extensionDescriptions),
				...extensionEnablementService.getWorkspaceDisabledExtensions()
			];

			_telemetryService.publicLog('extensionsScanned', {
				totalCount: extensionDescriptions.length,
				disabledCount: disabledExtensions.length
			});

			this._onExtensionDescriptions(disabledExtensions.length ? extensionDescriptions.filter(e => disabledExtensions.every(id => !areSameExtensions({ id }, e))) : extensionDescriptions);
		});
	}

	private _handleMessage(msg: IMessage) {

		if (!this._extensionsStatus[msg.source]) {
			this._extensionsStatus[msg.source] = { messages: [] };
		}
		this._extensionsStatus[msg.source].messages.push(msg);

		this.$localShowMessage(
			msg.type, messageWithSource(msg),
			this.environmentService.extensionDevelopmentPath === msg.source
		);

		if (!this._isDev && msg.extensionId) {
			const { type, extensionId, extensionPointId, message } = msg;
			this._telemetryService.publicLog('extensionsMessage', {
				type, extensionId, extensionPointId, message
			});
		}
	}

	public $localShowMessage(severity: Severity, msg: string, useMessageService: boolean = this._isDev): void {
		// Only show nasty intrusive messages if doing extension development
		// and print all other messages to the console
		if (useMessageService && (severity === Severity.Error || severity === Severity.Warning)) {
			this._messageService.show(severity, msg);
		} else if (severity === Severity.Error) {
			console.error(msg);
		} else if (severity === Severity.Warning) {
			console.warn(msg);
		} else {
			console.log(msg);
		}
	}

	// -- overwriting AbstractExtensionService

	public getExtensionsStatus(): { [id: string]: IExtensionsStatus } {
		return this._extensionsStatus;
	}

	protected _showMessage(severity: Severity, msg: string): void {
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
					collector: new ExtensionMessageCollector(messageHandler, desc, extensionPoint.name)
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

	private scanExtensions(): TPromise<IExtensionDescription[]> {
		const collector = new MessagesCollector();
		const version = pkg.version;
		const builtinExtensions = ExtensionScanner.scanExtensions(version, collector, SystemExtensionsRoot, true);
		const userExtensions = this.environmentService.disableExtensions || !this.environmentService.extensionsPath ? TPromise.as([]) : ExtensionScanner.scanExtensions(version, collector, this.environmentService.extensionsPath, false);
		const developedExtensions = this.environmentService.disableExtensions || !this.environmentService.isExtensionDevelopment ? TPromise.as([]) : ExtensionScanner.scanOneOrMultipleExtensions(version, collector, this.environmentService.extensionDevelopmentPath, false);

		return TPromise.join([builtinExtensions, userExtensions, developedExtensions]).then((extensionDescriptions: IExtensionDescription[][]) => {
			let builtinExtensions = extensionDescriptions[0];
			let userExtensions = extensionDescriptions[1];
			let developedExtensions = extensionDescriptions[2];

			let result: { [extensionId: string]: IExtensionDescription; } = {};
			builtinExtensions.forEach((builtinExtension) => {
				result[builtinExtension.id] = builtinExtension;
			});
			userExtensions.forEach((userExtension) => {
				if (result.hasOwnProperty(userExtension.id)) {
					collector.warn(userExtension.extensionFolderPath, localize('overwritingExtension', "Overwriting extension {0} with {1}.", result[userExtension.id].extensionFolderPath, userExtension.extensionFolderPath));
				}
				result[userExtension.id] = userExtension;
			});
			developedExtensions.forEach(developedExtension => {
				collector.info('', localize('extensionUnderDevelopment', "Loading development extension at {0}", developedExtension.extensionFolderPath));
				if (result.hasOwnProperty(developedExtension.id)) {
					collector.warn(developedExtension.extensionFolderPath, localize('overwritingExtension', "Overwriting extension {0} with {1}.", result[developedExtension.id].extensionFolderPath, developedExtension.extensionFolderPath));
				}
				result[developedExtension.id] = developedExtension;
			});

			return Object.keys(result).map(name => result[name]);
		}).then(null, err => {
			collector.error('', err);
			return [];
		}).then(extensions => {
			collector.getMessages().forEach(entry => this.$localShowMessage(entry.type, this._isDev ? (entry.source ? '[' + entry.source + ']: ' : '') + entry.message : entry.message));
			return extensions;
		});
	}
}
