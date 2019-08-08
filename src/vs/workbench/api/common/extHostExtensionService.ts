/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostExtensionServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtensionActivationReason, IExtensionAPI } from 'vs/workbench/api/common/extHostExtensionActivator';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/common/extensionDescriptionRegistry';
import * as vscode from 'vscode';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { TernarySearchTree } from 'vs/base/common/map';

export interface IInitializeParticipant {
	(accessor: ServicesAccessor): Promise<void> | void;
}

export const IExtHostExtensionService = createDecorator<IExtHostExtensionService>('IExtHostExtensionService');

export interface IExtHostExtensionService extends ExtHostExtensionServiceShape {
	_serviceBrand: any;
	initialize(): void;
	isActivated(extensionId: ExtensionIdentifier): boolean;
	activateByIdWithErrors(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void>;
	deactivateAll(): Promise<void>;
	getExtensionExports(extensionId: ExtensionIdentifier): IExtensionAPI | null | undefined;
	getExtensionRegistry(): Promise<ExtensionDescriptionRegistry>;
	getExtensionPathIndex(): Promise<TernarySearchTree<IExtensionDescription>>;
	registerRemoteAuthorityResolver(authorityPrefix: string, resolver: vscode.RemoteAuthorityResolver): vscode.Disposable;
}
