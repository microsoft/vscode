/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';

// ---------------------------------------------------------------------------
// Two parallel ProxyIdentifier hierarchies for the worker ↔ supervisor protocol.
//
//  • WorkerHostIdentifier — objects living in the supervisor, called by the worker.
//    The supervisor registers (set) instances; the worker obtains proxies (getProxy).
//
//  • WorkerClientIdentifier — objects living in the worker, called by the supervisor.
//    The worker registers (set) instances; the supervisor obtains proxies (getProxy).
//
// Both hierarchies share one RPCProtocol instance per worker. To keep wire IDs
// disjoint we give them separate static counters. The total identifier count is
// WorkerHostIdentifier.count + WorkerClientIdentifier.count.
// ---------------------------------------------------------------------------

const _allWorkerIdentifiers: { sid: string }[] = [];

function _recordIdentifier(nid: number, sid: string): void {
	_allWorkerIdentifiers[nid] = { sid };
}

/** Resolve a worker protocol numeric ID to a debug string. */
export function getWorkerStringIdentifierForProxy(nid: number): string {
	return _allWorkerIdentifiers[nid]?.sid ?? 'unknown';
}

/** Get the total number of worker protocol identifiers (host + client). */
export function getWorkerIdentifierCount(): number {
	return WorkerHostIdentifier.count + WorkerClientIdentifier.count;
}

/**
 * Identifies an object on the **supervisor** (host) side.
 * The worker calls these via `rpcProtocol.getProxy(id)`.
 *
 * IDs start at 1 and are assigned in declaration order below.
 */
export class WorkerHostIdentifier<T> {
	public static count = 0;
	_proxyIdentifierBrand: void = undefined;

	public readonly sid: string;
	public readonly nid: number;

	constructor(sid: string) {
		this.sid = sid;
		this.nid = (++WorkerHostIdentifier.count);
		_recordIdentifier(this.nid, sid);
	}
}

/**
 * Identifies an object on the **worker** (client) side.
 * The supervisor calls these via `rpcProtocol.getProxy(id)`.
 *
 * IDs are offset by `WorkerHostIdentifier.count` so they never collide
 * with host IDs on the same RPCProtocol instance.
 */
export class WorkerClientIdentifier<T> {
	public static count = 0;
	_proxyIdentifierBrand: void = undefined;

	public readonly sid: string;
	public readonly nid: number;

	constructor(sid: string) {
		WorkerClientIdentifier.count++;
		this.sid = sid;
		this.nid = WorkerHostIdentifier.count + WorkerClientIdentifier.count;
		_recordIdentifier(this.nid, sid);
	}
}

// ---------------------------------------------------------------------------
// Shape interfaces
// ---------------------------------------------------------------------------

/**
 * Serialized form of the data the supervisor sends when requesting activation.
 */
export interface IWorkerActivationData {
	readonly extensionDescription: IExtensionDescription;
	readonly storagePath: string | undefined;
	readonly globalStoragePath: string;
	readonly logPath: string;
}

/**
 * Worker-side handler shape (supervisor calls these).
 */
export interface IWorkerExtHostWorkerShape {
	$activate(data: IWorkerActivationData): Promise<IWorkerActivateResult>;
	$deactivate(): Promise<void>;
	$invokeCommand(commandId: string, args: unknown[]): Promise<unknown>;
}

/**
 * Result returned by `$activate` from the worker to the supervisor.
 */
export interface IWorkerActivateResult {
	readonly hasExports: boolean;
	/** Time spent calling activate() synchronously (ms) */
	readonly activateCallTime: number;
	/** Time spent awaiting the activate() promise (ms) */
	readonly activateResolveTime: number;
}

/**
 * Supervisor-side handler shape (worker calls these).
 */
export interface IWorkerExtHostSupervisorShape {
	$registerCommand(commandId: string): Promise<void>;
	$unregisterCommand(commandId: string): Promise<void>;
	$executeCommand(commandId: string, args: unknown[]): Promise<unknown>;
	$showInformationMessage(message: string, ...args: unknown[]): Promise<unknown>;
	$showWarningMessage(message: string, ...args: unknown[]): Promise<unknown>;
	$showErrorMessage(message: string, ...args: unknown[]): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Identifier instances — ORDER MATTERS (determines wire IDs).
// Host identifiers MUST all be declared before client identifiers.
// ---------------------------------------------------------------------------

/** Identifiers for supervisor-side (host) objects. */
export const WorkerHost = {
	Supervisor: new WorkerHostIdentifier<IWorkerExtHostSupervisorShape>('WorkerHost.Supervisor'),
};

/** Identifiers for worker-side (client) objects. */
export const WorkerClient = {
	Worker: new WorkerClientIdentifier<IWorkerExtHostWorkerShape>('WorkerClient.Worker'),
};
