/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { NodeEventEmitter } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';

export interface IUpdate {
	version: string;
	productVersion: string;
	date?: Date;
	releaseNotes?: string;
	supportsFastUpdate?: boolean;
	url?: string;
	hash?: string;
}

export enum StateType {
	Uninitialized = 'uninitialized',
	Idle = 'idle',
	Available = 'available',
	CheckingForUpdates = 'checking for updates',
	Downloading = 'downloading',
	Downloaded = 'downloaded',
	Updating = 'updating',
	Ready = 'ready',
}

export type Uninitialized = { type: StateType.Uninitialized };
export type Idle = { type: StateType.Idle };
export type CheckingForUpdates = { type: StateType.CheckingForUpdates, explicit: boolean };
export type Available = { type: StateType.Available, update: IUpdate };
export type Downloading = { type: StateType.Downloading, update: IUpdate };
export type Downloaded = { type: StateType.Downloaded, update: IUpdate };
export type Updating = { type: StateType.Updating, update: IUpdate };
export type Ready = { type: StateType.Ready, update: IUpdate };

export type State = Uninitialized | Idle | CheckingForUpdates | Available | Downloading | Downloaded | Updating | Ready;

export const State = {
	Uninitialized: { type: StateType.Uninitialized } as Uninitialized,
	Idle: { type: StateType.Idle } as Idle,
	CheckingForUpdates: (explicit: boolean) => ({ type: StateType.CheckingForUpdates, explicit } as CheckingForUpdates),
	Available: (update: IUpdate) => ({ type: StateType.Available, update } as Available),
	Downloading: (update: IUpdate) => ({ type: StateType.Downloading, update } as Downloading),
	Downloaded: (update: IUpdate) => ({ type: StateType.Downloaded, update } as Downloaded),
	Updating: (update: IUpdate) => ({ type: StateType.Updating, update } as Updating),
	Ready: (update: IUpdate) => ({ type: StateType.Ready, update } as Ready),
};

export interface IAutoUpdater extends NodeEventEmitter {
	setFeedURL(url: string): void;
	checkForUpdates(): void;
	applyUpdate?(): TPromise<void>;
	quitAndInstall(): void;
}

export const IUpdateService = createDecorator<IUpdateService>('updateService');

export interface IUpdateService {
	_serviceBrand: any;

	readonly onStateChange: Event<State>;
	readonly state: State;

	checkForUpdates(explicit: boolean): TPromise<void>;
	downloadUpdate(): TPromise<void>;
	applyUpdate(): TPromise<void>;
	quitAndInstall(): TPromise<void>;
}