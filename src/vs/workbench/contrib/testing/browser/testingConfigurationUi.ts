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
import { ThemeIcon } from 'vs/base/common/themables';
import { testingUpdateProfiles } from 'vs/workbench/contrib/testing/browser/icons';
import { testConfigurationGroupNames } from 'vs/workbench/contrib/testing/common/constants';
import { InternalTestItem, ITestRunProfile, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testTypes';
import { canUseProfileWithTest, ITestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { DisposableStore } from 'vs/base/common/lifecycle';

interface IConfigurationPickerOptions {
	/** Placeholder text */
	placeholder?: string;
	/** Show buttons to trigger configuration */
	showConfigureButtons?: boolean;
	/** Only show configurations from this controller */
	onlyForTest?: InternalTestItem;
	/** Only show this group */
	onlyGroup?: TestRunProfileBitset;
	/** Only show items which are configurable */
	onlyConfigurable?: boolean;
}

function buildPicker(accessor: ServicesAccessor, {
	onlyGroup,
	showConfigureButtons = true,
	onlyForTest,
	onlyConfigurable,
	placeholder = localize('testConfigurationUi.pick', 'Pick a test profile to use'),
}: IConfigurationPickerOptions) {
	const profileService = accessor.get(ITestProfileService);
	const items: QuickPickInput<IQuickPickItem & { profile: ITestRunProfile }>[] = [];
	const pushItems = (allProfiles: ITestRunProfile[], description?: string) => {
		for (const profiles of groupBy(allProfiles, (a, b) => a.group - b.group)) {
			let addedHeader = false;
			if (onlyGroup) {
				if (profiles[0].group !== onlyGroup) {
					continue;
				}

				addedHeader = true; // showing one group, no need for label
			}

			for (const profile of profiles) {
				if (onlyConfigurable && !profile.hasConfigurationHandler) {
					continue;
				}

				if (!addedHeader) {
					items.push({ type: 'separator', label: testConfigurationGroupNames[profiles[0].group] });
					addedHeader = true;
				}

				items.push(({
					type: 'item',
					profile,
					label: profile.label,
					description,
					alwaysShow: true,
					buttons: profile.hasConfigurationHandler && showConfigureButtons
						? [{
							iconClass: ThemeIcon.asClassName(testingUpdateProfiles),
							tooltip: localize('updateTestConfiguration', 'Update Test Configuration')
						}] : []
				}));
			}
		}
	};

	if (onlyForTest !== undefined) {
		pushItems(profileService.getControllerProfiles(onlyForTest.controllerId).filter(p => canUseProfileWithTest(p, onlyForTest)));
	} else {
		for (const { profiles, controller } of profileService.all()) {
			pushItems(profiles, controller.label.get());
		}
	}

	const quickpick = accessor.get(IQuickInputService).createQuickPick<IQuickPickItem & { profile: ITestRunProfile }>({ useSeparators: true });
	quickpick.items = items;
	quickpick.placeholder = placeholder;
	return quickpick;
}

const triggerButtonHandler = (service: ITestProfileService, resolve: (arg: undefined) => void) =>
	(evt: IQuickPickItemButtonEvent<IQuickPickItem>) => {
		const profile = (evt.item as { profile?: ITestRunProfile }).profile;
		if (profile) {
			service.configure(profile.controllerId, profile.profileId);
			resolve(undefined);
		}
	};

CommandsRegistry.registerCommand({
	id: 'vscode.pickMultipleTestProfiles',
	handler: async (accessor: ServicesAccessor, options: IConfigurationPickerOptions & {
		selected?: ITestRunProfile[];
	}) => {
		const profileService = accessor.get(ITestProfileService);
		const quickpick = buildPicker(accessor, options);
		if (!quickpick) {
			return;
		}

		const disposables = new DisposableStore();
		disposables.add(quickpick);

		quickpick.canSelectMany = true;
		if (options.selected) {
			quickpick.selectedItems = quickpick.items
				.filter((i): i is IQuickPickItem & { profile: ITestRunProfile } => i.type === 'item')
				.filter(i => options.selected!.some(s => s.controllerId === i.profile.controllerId && s.profileId === i.profile.profileId));
		}

		const pick = await new Promise<ITestRunProfile[] | undefined>(resolve => {
			disposables.add(quickpick.onDidAccept(() => {
				const selected = quickpick.selectedItems as readonly { profile?: ITestRunProfile }[];
				resolve(selected.map(s => s.profile).filter(isDefined));
			}));
			disposables.add(quickpick.onDidHide(() => resolve(undefined)));
			disposables.add(quickpick.onDidTriggerItemButton(triggerButtonHandler(profileService, resolve)));
			quickpick.show();
		});

		disposables.dispose();
		return pick;
	}
});

CommandsRegistry.registerCommand({
	id: 'vscode.pickTestProfile',
	handler: async (accessor: ServicesAccessor, options: IConfigurationPickerOptions) => {
		const profileService = accessor.get(ITestProfileService);
		const quickpick = buildPicker(accessor, options);
		if (!quickpick) {
			return;
		}

		const disposables = new DisposableStore();
		disposables.add(quickpick);

		const pick = await new Promise<ITestRunProfile | undefined>(resolve => {
			disposables.add(quickpick.onDidAccept(() => resolve((quickpick.selectedItems[0] as { profile?: ITestRunProfile })?.profile)));
			disposables.add(quickpick.onDidHide(() => resolve(undefined)));
			disposables.add(quickpick.onDidTriggerItemButton(triggerButtonHandler(profileService, resolve)));
			quickpick.show();
		});

		disposables.dispose();
		return pick;
	}
});

