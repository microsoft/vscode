/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IThreadService} from 'vs/platform/thread/common/thread';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {PluginsRegistry} from 'vs/platform/plugins/common/pluginsRegistry';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {TPromise as Promise} from 'vs/base/common/winjs.base';
import {AbstractRemoteTelemetryService} from 'vs/platform/telemetry/common/abstractRemoteTelemetryService';
import vscode = require('vscode');

export class ExtHostTelemetryService extends AbstractRemoteTelemetryService {

	protected handleEvent(eventName:string, data?:any):void {
		var data = data || {};
		data['pluginHostTelemetry'] = true;
		super.handleEvent(eventName, data);
	}
}