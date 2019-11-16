/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtensionsRegistry, IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';

export const IRemoteExplorerService = createDecorator<IRemoteExplorerService>('remoteExplorerService');
export const REMOTE_EXPLORER_TYPE_KEY: string = 'remote.explorerType';

export interface IRemoteExplorerService {
	_serviceBrand: undefined;
	onDidChangeTargetType: Event<string>;
	targetType: string;
	readonly helpInformation: HelpInformation[];
}

export interface HelpInformation {
	extensionDescription: IExtensionDescription;
	getStarted?: string;
	documentation?: string;
	feedback?: string;
	issues?: string;
}

const remoteHelpExtPoint = ExtensionsRegistry.registerExtensionPoint<HelpInformation>({
	extensionPoint: 'remoteHelp',
	jsonSchema: {
		description: nls.localize('RemoteHelpInformationExtPoint', 'Contributes help information for Remote'),
		type: 'object',
		properties: {
			'getStarted': {
				description: nls.localize('RemoteHelpInformationExtPoint.getStarted', "The url to your project's Getting Started page"),
				type: 'string'
			},
			'documentation': {
				description: nls.localize('RemoteHelpInformationExtPoint.documentation', "The url to your project's documentation page"),
				type: 'string'
			},
			'feedback': {
				description: nls.localize('RemoteHelpInformationExtPoint.feedback', "The url to your project's feedback reporter"),
				type: 'string'
			},
			'issues': {
				description: nls.localize('RemoteHelpInformationExtPoint.issues', "The url to your project's issues list"),
				type: 'string'
			}
		}
	}
});

class RemoteExplorerService implements IRemoteExplorerService {
	public _serviceBrand: undefined;
	private _targetType: string = '';
	private _onDidChangeTargetType: Emitter<string> = new Emitter<string>();
	public onDidChangeTargetType: Event<string> = this._onDidChangeTargetType.event;
	private _helpInformation: HelpInformation[] = [];

	constructor(@IStorageService private readonly storageService: IStorageService) {
		remoteHelpExtPoint.setHandler((extensions) => {
			let helpInformation: HelpInformation[] = [];
			for (let extension of extensions) {
				this._handleRemoteInfoExtensionPoint(extension, helpInformation);
			}

			this._helpInformation = helpInformation;
		});
	}

	set targetType(name: string) {
		if (this._targetType !== name) {
			this._targetType = name;
			this.storageService.store(REMOTE_EXPLORER_TYPE_KEY, this._targetType, StorageScope.WORKSPACE);
			this.storageService.store(REMOTE_EXPLORER_TYPE_KEY, this._targetType, StorageScope.GLOBAL);
			this._onDidChangeTargetType.fire(this._targetType);
		}
	}
	get targetType(): string {
		return this._targetType;
	}

	private _handleRemoteInfoExtensionPoint(extension: IExtensionPointUser<HelpInformation>, helpInformation: HelpInformation[]) {
		if (!extension.description.enableProposedApi) {
			return;
		}

		if (!extension.value.documentation && !extension.value.feedback && !extension.value.getStarted && !extension.value.issues) {
			return;
		}

		helpInformation.push({
			extensionDescription: extension.description,
			getStarted: extension.value.getStarted,
			documentation: extension.value.documentation,
			feedback: extension.value.feedback,
			issues: extension.value.issues
		});
	}

	get helpInformation(): HelpInformation[] {
		return this._helpInformation;
	}
}

registerSingleton(IRemoteExplorerService, RemoteExplorerService, true);
