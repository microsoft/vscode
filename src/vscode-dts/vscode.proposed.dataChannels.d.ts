/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace env {
		export function getDataChannel<T>(channelId: string): DataChannel<T>;
	}

	export enum DataWatcherKind {
		AgentSession = 0,
	}

	export interface AgentSessionDataWatcherParams {
		readonly kind: DataWatcherKind.AgentSession;
		readonly resource: Uri;
	}

	export type DataWatcherParams =
		| AgentSessionDataWatcherParams;

	export enum AgentSessionStatus {
		Untitled = 0,
		InProgress = 1,
		NeedsInput = 2,
		Completed = 3,
		Error = 4,
	}

	export interface AgentSessionData {
		readonly title: string;
		readonly description?: string;
		readonly status: AgentSessionStatus;
	}

	export type DataWatcherData<T extends DataWatcherParams> = {
		[DataWatcherKind.AgentSession]: AgentSessionData;
	}[T['kind']];

	export interface DataWatcher<T> extends Disposable {
		readonly data: T | undefined;
		readonly onDidChange: Event<void>;
	}

	export namespace window {
		export function createDataWatcher<T extends DataWatcherParams>(params: T): DataWatcher<DataWatcherData<T>>;
	}

	export interface DataChannel<T = unknown> {
		readonly onDidReceiveData: Event<DataChannelEvent<T>>;
	}

	export interface DataChannelEvent<T> {
		data: T;
	}
}
