/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupBy } from 'vs/base/common/arrays';
import { isDefined } from 'vs/base/common/types';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { QuickPickInput, IQuickPickItem, IQuickInputService, IQuickPickItemButtonEvent } from 'vs/platform/quickinput/common/quickInput';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { testingUpdateConfiguration } from 'vs/workbench/contrib/testing/browser/icons';
import { testConfigurationGroupNames } from 'vs/workbench/contrib/testing/common/constants';
import { ITestRunConfiguration, TestRunConfigurationBitset } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestConfigurationService } from 'vs/workbench/contrib/testing/common/testConfigurationService';

interface IConfigurationPickerOptions {
	/** Placeholder text */
	placeholder?: string;
	/** Show buttons to trigger configuration */
	showConfigureButtons?: boolean;
	/** Only show configurations from this controller */
	onlyControllerId?: string;
	/** Only show this group */
	onlyGroup?: TestRunConfigurationBitset;
	/** Only show items which are configurable */
	onlyConfigurable?: boolean;
}

function buildPicker(accessor: ServicesAccessor, {
	onlyGroup,
	showConfigureButtons,
	onlyControllerId,
	onlyConfigurable,
	placeholder = localize('testConfigurationUi.pick', 'Pick a test configuration to use'),
}: IConfigurationPickerOptions) {
	const configService = accessor.get(ITestConfigurationService);
	const items: QuickPickInput<IQuickPickItem & { config: ITestRunConfiguration }>[] = [];
	const pushItems = (allConfigs: ITestRunConfiguration[], description?: string) => {
		for (const configs of groupBy(allConfigs, (a, b) => a.group - b.group)) {
			let addedHeader = false;
			if (onlyGroup) {
				if (configs[0].group !== onlyGroup) {
					continue;
				}

				addedHeader = true; // showing one group, no need for label
			}

			for (const config of configs) {
				if (onlyConfigurable && !config.hasConfigurationHandler) {
					continue;
				}

				if (!addedHeader) {
					items.push({ type: 'separator', label: testConfigurationGroupNames[configs[0].group] });
					addedHeader = true;
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

	if (onlyControllerId !== undefined) {
		const lookup = configService.getControllerConfigurations(onlyControllerId);
		if (!lookup) {
			return;
		}

		pushItems(lookup.configs);
	} else {
		for (const { configs, controller } of configService.all()) {
			pushItems(configs, controller.label.value);
		}
	}

	const quickpick = accessor.get(IQuickInputService).createQuickPick<IQuickPickItem & { config: ITestRunConfiguration }>();
	quickpick.items = items;
	quickpick.placeholder = placeholder;
	return quickpick;
}

const triggerButtonHandler = (service: ITestConfigurationService, resolve: (arg: undefined) => void) =>
	(evt: IQuickPickItemButtonEvent<IQuickPickItem>) => {
		const config = (evt.item as { config?: ITestRunConfiguration }).config;
		if (config) {
			service.configure(config.controllerId, config.profileId);
			resolve(undefined);
		}
	};

CommandsRegistry.registerCommand({
	id: 'vscode.pickMultipleTestProfiles',
	handler: async (accessor: ServicesAccessor, options: IConfigurationPickerOptions & {
		selected?: ITestRunConfiguration[],
	}) => {
		const configService = accessor.get(ITestConfigurationService);
		const quickpick = buildPicker(accessor, options);
		if (!quickpick) {
			return;
		}

		quickpick.canSelectMany = true;
		if (options.selected) {
			quickpick.selectedItems = quickpick.items
				.filter((i): i is IQuickPickItem & { config: ITestRunConfiguration } => i.type === 'item')
				.filter(i => options.selected!.some(s => s.controllerId === i.config.controllerId && s.profileId === i.config.profileId));
		}

		const pick = await new Promise<ITestRunConfiguration[] | undefined>(resolve => {
			quickpick.onDidAccept(() => {
				const selected = quickpick.selectedItems as readonly { config?: ITestRunConfiguration }[];
				resolve(selected.map(s => s.config).filter(isDefined));
			});
			quickpick.onDidHide(() => resolve(undefined));
			quickpick.onDidTriggerItemButton(triggerButtonHandler(configService, resolve));
			quickpick.show();
		});

		quickpick.dispose();
		return pick;
	}
});

CommandsRegistry.registerCommand({
	id: 'vscode.pickTestProfile',
	handler: async (accessor: ServicesAccessor, options: IConfigurationPickerOptions) => {
		const configService = accessor.get(ITestConfigurationService);
		const quickpick = buildPicker(accessor, options);
		if (!quickpick) {
			return;
		}

		const pick = await new Promise<ITestRunConfiguration | undefined>(resolve => {
			quickpick.onDidAccept(() => resolve((quickpick.selectedItems[0] as { config?: ITestRunConfiguration })?.config));
			quickpick.onDidHide(() => resolve(undefined));
			quickpick.onDidTriggerItemButton(triggerButtonHandler(configService, resolve));
			quickpick.show();
		});

		quickpick.dispose();
		return pick;
	}
});

