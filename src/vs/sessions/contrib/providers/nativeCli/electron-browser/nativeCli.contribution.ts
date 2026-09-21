/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { PolicyCategory } from '../../../../../base/common/policy.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { NATIVE_CLI_ENABLED_SETTING, nativeCliDefinitions } from '../common/nativeCli.js';
import { NativeCliSessionsProvider } from './nativeCliSessionsProvider.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[NATIVE_CLI_ENABLED_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('nativeCliEnabledSetting', "When enabled, the Agents window can run agent CLIs in an embedded terminal. These sessions launch a third-party process that reads and writes files in the selected folder."),
			tags: ['experimental'],
			// Administrators need a single switch for the whole surface: the per-CLI
			// executable settings below can point at an arbitrary local binary.
			policy: {
				name: 'AgentsWindowTerminalSessions',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.139',
				localization: {
					description: {
						key: 'sessions.terminal.enabled.policy',
						value: localize('sessions.terminal.enabled.policy', "Enable CLI terminal sessions in the Agents window. Users can run agent CLIs such as Copilot CLI, Claude Code, and Codex in an embedded terminal against a local folder."),
					}
				}
			},
		},
		...Object.fromEntries(nativeCliDefinitions.map(definition => [definition.executableSetting, {
			type: 'string',
			default: '',
			scope: ConfigurationScope.MACHINE,
			restricted: true,
			markdownDescription: localize('nativeCliExecutableSetting', "Absolute path to the native {0} executable for terminal sessions. Leave empty to use an executable on PATH or a bundled CLI when available. The CLI uses its own authentication and permissions. [Installation instructions]({1}).", definition.sessionType.label, definition.documentation),
		}])),
	},
});

class NativeCliSessionsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.nativeCli';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
	) {
		super();
		const provider = this._register(instantiationService.createInstance(NativeCliSessionsProvider));
		this._register(sessionsProvidersService.registerProvider(provider));
	}
}

registerWorkbenchContribution2(NativeCliSessionsContribution.ID, NativeCliSessionsContribution, WorkbenchPhase.BlockRestore);
