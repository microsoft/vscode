/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import {KeybindingService} from 'vs/platform/keybinding/browser/keybindingServiceImpl';
import {OptionsChangeEvent, EventType} from 'vs/workbench/common/events';
import {IEventService} from 'vs/platform/event/common/event';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IKeybindingItem, IUserFriendlyKeybinding} from 'vs/platform/keybinding/common/keybindingService';
import {IOSupport} from 'vs/platform/keybinding/common/commonKeybindingResolver';
import * as JSONContributionRegistry from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import {IJSONSchema} from 'vs/base/common/jsonSchema';

export abstract class WorkbenchKeybindingService extends KeybindingService {
	private contextService: IWorkspaceContextService;
	private eventService: IEventService;
	private telemetryService: ITelemetryService;
	private toDispose: Function;

	constructor(contextService: IWorkspaceContextService, eventService: IEventService, telemetryService: ITelemetryService, domNode: HTMLElement) {
		this.contextService = contextService;
		super(domNode);
		this.eventService = eventService;
		this.telemetryService = telemetryService;
		this.toDispose = this.eventService.addListener(EventType.WORKBENCH_OPTIONS_CHANGED, (e) => this.onOptionsChanged(e));
	}

	public customKeybindingsCount(): number {
		let opts = this.contextService.getOptions();
		if (opts.globalSettings && opts.globalSettings.keybindings && Array.isArray(opts.globalSettings.keybindings)) {
			return opts.globalSettings.keybindings.length;
		}
		return 0;
	}

	protected _getExtraKeybindings(isFirstTime: boolean): IKeybindingItem[] {
		let extras: IUserFriendlyKeybinding[] = [];
		let opts = this.contextService.getOptions();
		if (opts.globalSettings && opts.globalSettings.keybindings) {
			if (!isFirstTime) {
				let cnt = 0;
				if (Array.isArray(opts.globalSettings.keybindings)) {
					cnt = opts.globalSettings.keybindings.length;
				}
				this.telemetryService.publicLog('customKeybindingsChanged', {
					keyCount: cnt
				});
			}
			if (Array.isArray(opts.globalSettings.keybindings)) {
				extras = opts.globalSettings.keybindings;
			}
		}
		return extras.map((k, i) => IOSupport.readKeybindingItem(k, i));
	}

	private onOptionsChanged(e: OptionsChangeEvent): void {
		if (e.key === 'globalSettings') {
			this.updateResolver();
		}
	}

	public dispose(): void {
		this.toDispose();
	}
}

let schemaId = 'local://schemas/keybindings';
let schema : IJSONSchema = {
	'id': schemaId,
	'type': 'array',
	'title': nls.localize('keybindings.json.title', "Keybindings configuration"),
	'items': {
		'required': ['key'],
		'type': 'object',
		'default': { 'key': '{{_}}', 'command': '{{_}}', 'when': '{{_}}' },
		'properties': {
			'key': {
				'type': 'string',
				'description': nls.localize('keybindings.json.key', 'Key or key sequence (separated by space)'),
			},
			'command': {
				'description': nls.localize('keybindings.json.command', 'Name of the command to execute'),
			},
			'when': {
				'type': 'string',
				'description': nls.localize('keybindings.json.when', 'Condition when the key is active.')
			}
		}
	}
}

let schemaRegistry = <JSONContributionRegistry.IJSONContributionRegistry>Registry.as(JSONContributionRegistry.Extensions.JSONContribution);
schemaRegistry.registerSchema(schemaId, schema);
schemaRegistry.addSchemaFileAssociation('inmemory://defaults/keybindings.json', schemaId);
schemaRegistry.addSchemaFileAssociation('%APP_SETTINGS_HOME%/keybindings.json', schemaId);