/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Platform = require('vs/base/common/platform');
import Objects = require('vs/base/common/objects');
import uuid = require('vs/base/common/uuid');
import {AbstractTelemetryService} from 'vs/platform/telemetry/common/abstractTelemetryService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IdleMonitor, UserStatus} from 'vs/base/browser/idleMonitor';

export interface TelemetryServiceConfig {
	enableTelemetry?: boolean;

	enableHardIdle?: boolean;
	enableSoftIdle?: boolean;
	sessionID?: string;
	commitHash?: string;
	version?: string;
}

var DefaultTelemetryServiceConfig:TelemetryServiceConfig = {
	enableTelemetry: true,
	enableHardIdle: true,
	enableSoftIdle:true
};

export class MainTelemetryService extends AbstractTelemetryService implements ITelemetryService {
	// how long of inactivity before a user is considered 'inactive' - 2 minutes
	public static SOFT_IDLE_TIME = 2 * 60 * 1000;
	public static IDLE_START_EVENT_NAME = 'UserIdleStart';
	public static IDLE_STOP_EVENT_NAME = 'UserIdleStop';

	protected config:TelemetryServiceConfig;

	private hardIdleMonitor:IdleMonitor;
	private softIdleMonitor:IdleMonitor;
	private eventCount: number;
	private userIdHash: string;
	private startTime: Date;

	constructor(config?:TelemetryServiceConfig) {
		this.config = Objects.withDefaults(config, DefaultTelemetryServiceConfig);
		super();

		this.sessionId = this.config.sessionID || (uuid.generateUuid() + Date.now());

		if(this.config.enableHardIdle) {
			this.hardIdleMonitor = new IdleMonitor();
		}
		if(this.config.enableSoftIdle) {
			this.softIdleMonitor = new IdleMonitor(MainTelemetryService.SOFT_IDLE_TIME);
			this.softIdleMonitor.addOneTimeActiveListener(()=>this.onUserActive());
			this.softIdleMonitor.addOneTimeIdleListener(()=>this.onUserIdle());
		}

		this.eventCount = 0;
		this.startTime = new Date();
	}

	private onUserIdle():void {
		this.publicLog(MainTelemetryService.IDLE_START_EVENT_NAME);
		this.softIdleMonitor.addOneTimeIdleListener(()=>this.onUserIdle());
	}

	private onUserActive():void {
		this.publicLog(MainTelemetryService.IDLE_STOP_EVENT_NAME);
		this.softIdleMonitor.addOneTimeActiveListener(()=>this.onUserActive());
	}

	public dispose():void {
		if(this.hardIdleMonitor) {
			this.hardIdleMonitor.dispose();
		}
		if(this.softIdleMonitor) {
			this.softIdleMonitor.dispose();
		}
		super.dispose();
	}

	protected handleEvent(eventName:string, data?:any):void {
		if(this.hardIdleMonitor && this.hardIdleMonitor.getStatus() === UserStatus.Idle) {
			return;
		}

		// don't send telemetry when not enabled
		if (!this.config.enableTelemetry) {
			return;
		}

		this.eventCount++;

		data = this.addCommonProperties(data);

		var allAppenders = this.getAppenders();
		for (var i =0; i < allAppenders.length; i++) {
			allAppenders[i].log(eventName, data);
		}
	}

	protected addCommonProperties(data?: any): void {
		data = data || {};

		var eventDate: Date = new Date();
		data['sessionID'] = this.sessionId;
		data['timestamp'] = eventDate;
		data['version'] = this.config.version;
		data['userId'] = this.userIdHash;
		data['commitHash'] = this.config.commitHash;

		data['common.platform'] = Platform.Platform[Platform.platform];
		data['common.timesincesessionstart'] = (eventDate.getTime() - this.startTime.getTime());
		data['common.sequence'] =  this.eventCount;
		data['common.instanceId'] = this.instanceId;
		data['common.machineId'] = this.machineId;
		return data;
	}


}
