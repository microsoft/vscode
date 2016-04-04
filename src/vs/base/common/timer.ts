/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Platform = require('vs/base/common/platform');
import errors = require('vs/base/common/errors');
import precision = require('vs/base/common/stopwatch');

export var ENABLE_TIMER = false;
var msWriteProfilerMark = Platform.globals['msWriteProfilerMark'];

export enum Topic {
	EDITOR,
	LANGUAGES,
	WORKER,
	WORKBENCH,
	STARTUP
}

export interface ITimerEvent {
	id: number;
	topic: string;
	name: string;
	description: string;
	data: any;

	startTime: Date;
	stopTime: Date;

	stop(stopTime?: Date): void;
	timeTaken(): number;
}

export interface IExistingTimerEvent {
	topic: string;
	name: string;

	description?: string;

	startTime: Date;
	stopTime: Date;
}

class NullTimerEvent implements ITimerEvent {
	public id: number;
	public topic: string;
	public name: string;
	public description: string;
	public data: any;

	public startTime: Date;
	public stopTime: Date;

	public stop(): void {
		return;
	}

	public timeTaken(): number {
		return -1;
	}
}

class TimerEvent implements ITimerEvent {
	public id: number;
	public topic: string;
	public name: string;
	public description: string;
	public data: any;

	public startTime: Date;
	public stopTime: Date;

	private timeKeeper: TimeKeeper;
	private sw: precision.StopWatch;

	constructor(timeKeeper: TimeKeeper, name: string, topic: string, startTime?: Date, description?: string) {
		this.timeKeeper = timeKeeper;
		this.name = name;
		this.description = description;
		this.topic = topic;
		this.stopTime = null;

		if (startTime) {
			this.startTime = startTime;
			return;
		}

		this.startTime = new Date();
		this.sw = precision.StopWatch.create();

		if (msWriteProfilerMark) {
			var profilerName = ['Monaco', this.topic, this.name, 'start'];
			msWriteProfilerMark(profilerName.join('|'));
		}
	}

	public stop(stopTime?: Date): void {

		// already stopped
		if (this.stopTime !== null) {
			return;
		}

		if (stopTime) {
			this.stopTime = stopTime;
			this.sw = null;
			this.timeKeeper._onEventStopped(this);
			return;
		}

		this.stopTime = new Date();
		if (this.sw) {
			this.sw.stop();
		}

		this.timeKeeper._onEventStopped(this);

		if (msWriteProfilerMark) {
			var profilerName = ['Monaco', this.topic, this.name, 'stop'];
			msWriteProfilerMark(profilerName.join('|'));
		}
	}

	public timeTaken(): number {
		if (this.sw) {
			return this.sw.elapsed();
		}
		if (this.stopTime) {
			return this.stopTime.getTime() - this.startTime.getTime();
		}
		return -1;
	}
}

export interface IEventsListener {
	(events: ITimerEvent[]): void;
}

export class TimeKeeper /*extends EventEmitter.EventEmitter*/ {
	/**
	 * After being started for 1 minute, all timers are automatically stopped.
	 */
	private static _MAX_TIMER_LENGTH = 60000; // 1 minute
	/**
	 * Every 2 minutes, a sweep of current started timers is done.
	 */
	private static _CLEAN_UP_INTERVAL = 120000; // 2 minutes
	/**
	 * Collect at most 1000 events.
	 */
	private static _EVENT_CACHE_LIMIT = 1000;

	private static EVENT_ID = 1;
	public static PARSE_TIME = new Date();


	private cleaningIntervalId: Platform.IntervalToken;
	private collectedEvents: ITimerEvent[];
	private listeners: IEventsListener[];

	constructor() {
		this.cleaningIntervalId = -1;
		this.collectedEvents = [];
		this.listeners = [];
	}

	public isEnabled(): boolean {
		return ENABLE_TIMER;
	}

	public start(topic: Topic|string, name: string, start?: Date, description?: string): ITimerEvent {
		if (!this.isEnabled()) {
			return nullEvent;
		}

		var strTopic: string;

		if (typeof topic === 'string') {
			strTopic = topic;
		} else if (topic === Topic.EDITOR) {
			strTopic = 'Editor';
		} else if (topic === Topic.LANGUAGES) {
			strTopic = 'Languages';
		} else if (topic === Topic.WORKER) {
			strTopic = 'Worker';
		} else if (topic === Topic.WORKBENCH) {
			strTopic = 'Workbench';
		} else if (topic === Topic.STARTUP) {
			strTopic = 'Startup';
		}

		this.initAutoCleaning();
		var event = new TimerEvent(this, name, strTopic, start, description);
		this.addEvent(event);

		return event;
	}

	public dispose(): void {
		if (this.cleaningIntervalId !== -1) {
			Platform.clearInterval(this.cleaningIntervalId);
			this.cleaningIntervalId = -1;
		}
	}

	public addListener(listener: IEventsListener): void {
		this.listeners.push(listener);
	}

	public removeListener(listener: IEventsListener): void {
		for (var i = 0; i < this.listeners.length; i++) {
			if (this.listeners[i] === listener) {
				this.listeners.splice(i, 1);
				return;
			}
		}
	}

	private addEvent(event: ITimerEvent): void {
		event.id = TimeKeeper.EVENT_ID;
		TimeKeeper.EVENT_ID++;
		this.collectedEvents.push(event);
		// expire items from the front of the cache
		if (this.collectedEvents.length > TimeKeeper._EVENT_CACHE_LIMIT) {
			this.collectedEvents.shift();
		}
	}

	private initAutoCleaning(): void {
		if (this.cleaningIntervalId === -1) {
			this.cleaningIntervalId = Platform.setInterval(() => {
				var now = Date.now();
				this.collectedEvents.forEach((event) => {
					if (!event.stopTime && (now - event.startTime.getTime()) >= TimeKeeper._MAX_TIMER_LENGTH) {
						event.stop();
					}
				});
			}, TimeKeeper._CLEAN_UP_INTERVAL);
		}
	}

	public getCollectedEvents(): ITimerEvent[] {
		return this.collectedEvents.slice(0);
	}

	public clearCollectedEvents(): void {
		this.collectedEvents = [];
	}

	_onEventStopped(event: ITimerEvent): void {
		var emitEvents = [event];

		var listeners = this.listeners.slice(0);
		for (var i = 0; i < listeners.length; i++) {
			try {
				listeners[i](emitEvents);
			} catch (e) {
				errors.onUnexpectedError(e);
			}
		}
	}

	public setInitialCollectedEvents(events: IExistingTimerEvent[], startTime?: Date): void {
		if (!this.isEnabled()) {
			return;
		}

		if (startTime) {
			TimeKeeper.PARSE_TIME = startTime;
		}

		events.forEach((event) => {
			var e = new TimerEvent(this, event.name, event.topic, event.startTime, event.description);
			e.stop(event.stopTime);
			this.addEvent(e);
		});
	}
}

var timeKeeper = new TimeKeeper();
export var nullEvent: ITimerEvent = new NullTimerEvent();

export function start(topic: Topic|string, name: string, start?: Date, description?: string): ITimerEvent {
	return timeKeeper.start(topic, name, start, description);
}

export function getTimeKeeper(): TimeKeeper {
	return timeKeeper;
}
