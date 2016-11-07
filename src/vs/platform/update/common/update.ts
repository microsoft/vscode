/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';

export enum State {
	Uninitialized,
	Idle,
	CheckingForUpdate,
	UpdateAvailable,
	UpdateDownloaded
}

export enum ExplicitState {
	Implicit,
	Explicit
}

export interface IRawUpdate {
	releaseNotes: string;
	version: string;
	date: Date;
}

export interface IUpdate {
	version: string;
	date?: Date;
	releaseNotes?: string;
	url?: string;
}

export interface IAutoUpdater extends NodeJS.EventEmitter {
	setFeedURL(url: string): void;
	checkForUpdates(): void;
	quitAndInstall(): void;
}

export const IUpdateService = createDecorator<IUpdateService>('updateService');

export interface IUpdateService {
	_serviceBrand: any;

	readonly onError: Event<any>;
	readonly onUpdateAvailable: Event<{ url: string; version: string; }>;
	readonly onUpdateNotAvailable: Event<boolean>;
	readonly onUpdateReady: Event<IRawUpdate>;
	readonly onStateChange: Event<State>;
	readonly state: State;

	checkForUpdates(explicit: boolean): TPromise<IUpdate>;
	quitAndInstall(): TPromise<void>;
}