/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { URI } from 'vs/base/common/uri';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IRemoteConnectionData, RemoteAuthorityResolverErrorCode, ResolverResult } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IExtensionDescriptionDelta } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { ActivationKind, ExtensionActivationReason } from 'vs/workbench/services/extensions/common/extensions';

export interface IResolveAuthorityErrorResult {
	type: 'error';
	error: {
		message: string | undefined;
		code: RemoteAuthorityResolverErrorCode;
		detail: any;
	};
}

export interface IResolveAuthorityOKResult {
	type: 'ok';
	value: ResolverResult;
}

export type IResolveAuthorityResult = IResolveAuthorityErrorResult | IResolveAuthorityOKResult;

export interface IExtensionHostProxy {
	resolveAuthority(remoteAuthority: string, resolveAttempt: number): Promise<IResolveAuthorityResult>;
	/**
	 * Returns `null` if no resolver for `remoteAuthority` is found.
	 */
	getCanonicalURI(remoteAuthority: string, uri: URI): Promise<URI | null>;
	startExtensionHost(extensionsDelta: IExtensionDescriptionDelta): Promise<void>;
	extensionTestsExecute(): Promise<number>;
	activateByEvent(activationEvent: string, activationKind: ActivationKind): Promise<void>;
	activate(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<boolean>;
	setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void>;
	updateRemoteConnectionData(connectionData: IRemoteConnectionData): Promise<void>;
	deltaExtensions(extensionsDelta: IExtensionDescriptionDelta): Promise<void>;
	test_latency(n: number): Promise<number>;
	test_up(b: VSBuffer): Promise<number>;
	test_down(size: number): Promise<VSBuffer>;
}
