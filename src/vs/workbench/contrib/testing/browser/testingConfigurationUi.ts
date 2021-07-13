/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupBy } from 'vs/base/common/arrays';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { QuickPickInput, IQuickPickItem, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { testingUpdateConfiguration } from 'vs/workbench/contrib/testing/browser/icons';
import { testConfigurationGroupNames } from 'vs/workbench/contrib/testing/common/constants';
import { ITestRunConfiguration } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestConfigurationService } from 'vs/workbench/contrib/testing/common/testConfigurationService';

CommandsRegistry.registerCommand({
	id: 'vscode.pickTestConfiguration',
	handler: async (accessor: ServicesAccessor, {
		controllerId,
		placeholder = localize('testConfigurationUi.pick', 'Pick a test configuration to use'),
		showConfigureButtons = true,
		onlyConfigurable = false,
	}: {
		controllerId?: string;
		showConfigureButtons?: boolean;
		placeholder?: string;
		onlyConfigurable?: boolean;
	}) => {
		const configService = accessor.get(ITestConfigurationService);
		const items: QuickPickInput<IQuickPickItem & { config: ITestRunConfiguration }>[] = [];
		const pushItems = (allConfigs: ITestRunConfiguration[], description?: string) => {
			for (const configs of groupBy(allConfigs, (a, b) => a.group - b.group)) {
				let added = false;

				for (const config of configs) {
					if (onlyConfigurable && !config.hasConfigurationHandler) {
						continue;
					}

					if (!added) {
						items.push({ type: 'separator', label: testConfigurationGroupNames[configs[0].group] });
						added = true;
					}

					items.push(({
						type: 'item',
						config,
						label: config.label,
						description,
						alwaysShow: true,
						buttons: config.hasConfigurationHandler && showConfigureButtons
							? [{
								iconClass: ThemeIcon.asClassName(testingUpdateConfiguration),
								tooltip: localize('updateTestConfiguration', 'Update Test Configuration')
							}] : []
					}));
				}
			}
		};

		if (controllerId !== undefined) {
			const lookup = configService.getControllerConfigurations(controllerId);
			if (!lookup) {
				return;
			}

			pushItems(lookup.configs);
		} else {
			for (const { configs, controller } of configService.all()) {
				pushItems(configs, controller.label.value);
			}
		}

		const quickpick = accessor.get(IQuickInputService).createQuickPick();
		quickpick.items = items;
		quickpick.placeholder = placeholder;

		const pick = await new Promise<ITestRunConfiguration | undefined>(resolve => {
			quickpick.onDidAccept(() => resolve((quickpick.selectedItems[0] as { config?: ITestRunConfiguration })?.config));
			quickpick.onDidHide(() => resolve(undefined));
			quickpick.onDidTriggerItemButton(evt => {
				const config = (evt.item as { config?: ITestRunConfiguration }).config;
				if (config) {
					configService.configure(config.controllerId, config.configId);
					resolve(undefined);
				}
			});

			quickpick.show();
		});

		quickpick.dispose();
		return pick;
	}
});

