/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { NodeEventEmitter } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';

export enum State {
	Uninitialized,
	Idle,
	CheckingForUpdate,
	UpdateAvailable,
	UpdateDownloaded,
	UpdateInstalling,
	UpdateReady
}

export enum ExplicitState {
	Implicit,
	Explicit
}

export interface IRawUpdate {
	releaseNotes: string;
	version: string;
	date: Date;
	supportsFastUpdate?: boolean;
}

export interface IUpdate {
	version: string;
	date?: Date;
	releaseNotes?: string;
	url?: string;
	supportsFastUpdate?: boolean;
}

export interface IAutoUpdater extends NodeEventEmitter {
	setFeedURL(url: string): void;
	checkForUpdates(): void;
	applyUpdate?(): TPromise<void>;
	quitAndInstall(): void;
}

export const IUpdateService = createDecorator<IUpdateService>('updateService');

export interface IUpdateService {
	_serviceBrand: any;

	readonly onError: Event<any>;
	readonly onUpdateAvailable: Event<{ url: string; version: string; }>;
	readonly onUpdateNotAvailable: Event<boolean>;
	readonly onUpdateDownloaded: Event<IRawUpdate>;
	readonly onUpdateInstalling: Event<IRawUpdate>;
	readonly onUpdateReady: Event<IRawUpdate>;
	readonly onStateChange: Event<State>;
	readonly state: State;

	checkForUpdates(explicit: boolean): TPromise<IUpdate>;
	applyUpdate(): TPromise<void>;
	quitAndInstall(): TPromise<void>;
}