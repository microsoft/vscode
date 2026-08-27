/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { IAssignmentService } from '../../../../../../platform/assignment/common/assignment.js';
import { IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IChatModes } from '../../../common/chatModes.js';
import { localChatSessionType } from '../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';

const DEFAULT_NEW_SESSION_MODE_TREATMENT = 'chatDefaultNewSessionMode';
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

let defaultNewSessionModeTreatment: Promise<boolean> | undefined;

type DefaultNewSessionModeExperimentOptions = {
	chatSessionIsEmpty: boolean;
	sessionType: string | undefined;
	anonymous: boolean;
	setting: IConfigurationValue<string>;
	modes: IChatModes;
};

export function isEligibleForDefaultNewSessionModeExperiment(options: DefaultNewSessionModeExperimentOptions): boolean {
	if (!options.chatSessionIsEmpty) {
		return false;
	}
	if (options.sessionType !== localChatSessionType) {
		return false;
	}
	if (options.anonymous) {
		return false;
	}
	if (isDefaultNewSessionModeExplicitlySet(options.setting)) {
		return false;
	}
	return hasPlanChatMode(options.modes);
}

export function ensureDefaultNewSessionModeExperiment(experimentService: IAssignmentService, options: DefaultNewSessionModeExperimentOptions): Promise<boolean> {
	if (!isEligibleForDefaultNewSessionModeExperiment(options)) {
		return Promise.resolve(false);
	}
	if (defaultNewSessionModeTreatment) {
		return defaultNewSessionModeTreatment.then(() => false);
	}
	defaultNewSessionModeTreatment = experimentService.getTreatment<string>(DEFAULT_NEW_SESSION_MODE_TREATMENT).then(value => {
		if (typeof value !== 'string') {
			return false;
		}
		applyDefaultNewSessionModeTreatment(value);
		return true;
	});
	return defaultNewSessionModeTreatment;
}

function applyDefaultNewSessionModeTreatment(value: string): void {
	const node: IConfigurationNode = {
		id: 'chatSidebar',
		title: localize('interactiveSessionConfigurationTitle', "Chat"),
		type: 'object',
		properties: {
			[ChatConfiguration.DefaultNewSessionMode]: {
				type: 'string',
				description: localize('chat.newSession.defaultMode', "The default mode for new chat sessions. When empty, the chat view's default mode is used."),
				default: value,
			}
		}
	};
	configurationRegistry.updateConfigurations({ add: [node], remove: [] });
}

function isDefaultNewSessionModeExplicitlySet(setting: IConfigurationValue<string>): boolean {
	return setting.userValue !== undefined
		|| setting.userLocalValue !== undefined
		|| setting.userRemoteValue !== undefined
		|| setting.workspaceValue !== undefined
		|| setting.workspaceFolderValue !== undefined
		|| setting.policyValue !== undefined;
}

function hasPlanChatMode(modes: IChatModes): boolean {
	for (const candidate of ['plan', 'Plan']) {
		if (modes.findModeById(candidate) || modes.findModeByName(candidate)) {
			return true;
		}
	}
	return modes.custom.some(mode => mode.name.get().toLowerCase() === 'plan');
}
