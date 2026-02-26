/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type ObsDebuggerApi = {
	channelId: 'observableDevTools',
	host: {
		notifications: {
			handleChange(update: ObsStateUpdate, clearState: boolean): void;
		}
		requests: {},
	};
	client: {
		notifications: {
			setDeclarationIdFilter(declarationIds: ObsDeclarationId[]): void;
			logObservableValue(observableId: ObsInstanceId): void;
			flushUpdates(): void;
			resetUpdates(): void;
		},
		requests: {
			getDeclarations(): IObsDeclarations;
			getSummarizedInstances(): IObsPushState;
			getDerivedInfo(instanceId: ObsInstanceId): IDerivedObservableDetailedInfo;
			getAutorunInfo(instanceId: ObsInstanceId): IAutorunDetailedInfo;
			getObservableValueInfo(instanceId: ObsInstanceId): IObservableValueInfo;

			setValue(instanceId: ObsInstanceId, jsonValue: unknown): void;
			getValue(instanceId: ObsInstanceId): unknown;

			// For autorun and deriveds
			rerun(instanceId: ObsInstanceId): void;

			logValue(instanceId: ObsInstanceId): void;

			getTransactionState(): ITransactionState | undefined;
		}
	};
};

export type ObsDeclarationId = number;

export type ObsInstanceId = number;

export type ObsDeclarationType = 'observable/value' | 'observable/derived' | 'autorun' | 'transaction';

export interface IObsDeclarations {
	decls: Record<ObsDeclarationId, IObsDeclaration>;
}

/** Immutable */
export interface IObsDeclaration {
	id: ObsDeclarationId;
	type: ObsDeclarationType;

	url: string;
	line: number;
	column: number;
}

export interface IObsPushState {
	declStates: Record<ObsDeclarationId, IObsDeclarationSummary | null>;
	instances: Record<ObsInstanceId, ObsInstancePushState | null>;
}

export interface IObsDeclarationSummary {
	activeInstances: number;
	recentInstances: ObsInstanceId[]; // Limited
}

export type ObsInstancePushState = IObservableValueInstancePushState | IDerivedObservableInstancePushState | IAutorunInstancePushState;


interface IBaseObsInstancePushState {
	instanceId: ObsInstanceId;
	declarationId: ObsDeclarationId;
	name: string;
	ownerId: ObsOwnerId | undefined;
}

export interface IObservableInstancePushState extends IBaseObsInstancePushState {
	formattedValue: string | undefined;
}

export interface IObservableValueInstancePushState extends IBaseObsInstancePushState, IObservableInstancePushState {
	type: 'observable/value';
}

export interface IDerivedObservableInstancePushState extends IBaseObsInstancePushState, IObservableInstancePushState {
	type: 'observable/derived';
	recomputationCount: number;
	formattedValue: string | undefined;
}

export interface IAutorunInstancePushState extends IBaseObsInstancePushState {
	type: 'autorun';
	runCount: number;
}

export type ObsOwnerId = number;

export type ObsStateUpdate = Partial<IObsDeclarations> & DeepPartial<IObsPushState>;

type DeepPartial<T> = { [TKey in keyof T]?: DeepPartial<T[TKey]> };

export interface IObservableValueInfo {
	observers: IObsInstanceRef[];
}

export interface IDerivedObservableDetailedInfo {
	dependencies: IObsInstanceRef[];
	observers: IObsInstanceRef[];
}

export interface IAutorunDetailedInfo {
	dependencies: IObsInstanceRef[];
}

export interface IObsInstanceRef {
	instanceId: ObsInstanceId;
	name: string;
}

export interface ITransactionState {
	names: string[];
	affected: ObserverInstanceState[];
}

export type ObserverInstanceState = DerivedObservableState | AutorunState;

export type DerivedObservableState =
	IObsInstanceRef & { type: 'observable/derived', updateCount: number } & (
		{ state: 'noValue' }
		| { state: 'stale', changedDependencies: ObsInstanceId[] }
		| { state: 'possiblyStale', }
		| { state: 'upToDate' }
		| { state: 'updating', changedDependencies: ObsInstanceId[], initialComputation: boolean }
	);

export type AutorunState =
	IObsInstanceRef & { type: 'autorun', updateCount: number } & (
		{ state: 'stale', changedDependencies: ObsInstanceId[], }
		| { state: 'possiblyStale', }
		| { state: 'upToDate' }
		| { state: 'updating', changedDependencies: ObsInstanceId[], }
	);

export type ObservableValueState =
	IObsInstanceRef & { type: 'observable/value' } & (
		{ state: 'upToDate' }
		| { state: 'updating' }
	);
