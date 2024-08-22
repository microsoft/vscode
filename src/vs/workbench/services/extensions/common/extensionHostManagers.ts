/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event';
import { URI } from '../../../../base/common/uri';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions';
import { ExtensionHostKind } from './extensionHostKind';
import { IExtensionDescriptionDelta } from './extensionHostProtocol';
import { IResolveAuthorityResult } from './extensionHostProxy';
import { ExtensionRunningLocation } from './extensionRunningLocation';
import { ActivationKind, ExtensionActivationReason, ExtensionHostStartup } from './extensions';
import { ResponsiveState } from './rpcProtocol';

export interface IExtensionHostManager {
	readonly pid: number | null;
	readonly kind: ExtensionHostKind;
	readonly startup: ExtensionHostStartup;
	readonly friendyName: string;
	readonly onDidExit: Event<[number, string | null]>;
	readonly onDidChangeResponsiveState: Event<ResponsiveState>;
	disconnect(): Promise<void>;
	dispose(): void;
	ready(): Promise<void>;
	representsRunningLocation(runningLocation: ExtensionRunningLocation): boolean;
	deltaExtensions(extensionsDelta: IExtensionDescriptionDelta): Promise<void>;
	containsExtension(extensionId: ExtensionIdentifier): boolean;
	activate(extension: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<boolean>;
	activateByEvent(activationEvent: string, activationKind: ActivationKind): Promise<void>;
	activationEventIsDone(activationEvent: string): boolean;
	getInspectPort(tryEnableInspector: boolean): Promise<{ port: number; host: string } | undefined>;
	resolveAuthority(remoteAuthority: string, resolveAttempt: number): Promise<IResolveAuthorityResult>;
	/**
	 * Returns `null` if no resolver for `remoteAuthority` is found.
	 */
	getCanonicalURI(remoteAuthority: string, uri: URI): Promise<URI | null>;
	start(extensionRegistryVersionId: number, allExtensions: readonly IExtensionDescription[], myExtensions: ExtensionIdentifier[]): Promise<void>;
	extensionTestsExecute(): Promise<number>;
	setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void>;
}
