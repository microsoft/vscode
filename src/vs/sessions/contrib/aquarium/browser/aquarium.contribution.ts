/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aquarium.css';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { AquariumService, IAquariumService, SESSIONS_DEVELOPER_JOY_ENABLED_SETTING } from './aquariumOverlay.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[SESSIONS_DEVELOPER_JOY_ENABLED_SETTING]: {
			type: 'boolean',
			default: true,
			description: localize('sessions.developerJoy.enabled', "Adds an easter egg to the Agents window."),
			tags: ['experimental'],
		},
	},
});

registerSingleton(IAquariumService, AquariumService, InstantiationType.Delayed);

/**
 * Developer/demo command to fake a fish-feeding streak without waiting days or
 * feeding fish by hand. Lets you pick an alive streak, a died (revivable)
 * streak, or clear it, and updates the toggle tooltip live.
 */
class SimulateFishFeedingStreakAction extends Action2 {

	static readonly ID = 'sessions.aquarium.simulateStreak';

	constructor() {
		super({
			id: SimulateFishFeedingStreakAction.ID,
			title: localize2('aquarium.simulateStreak', "Simulate Fish Feeding Streak"),
			f1: true,
			category: Categories.Developer,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const aquariumService = accessor.get(IAquariumService);

		const aliveItem = { id: 'alive', label: localize('aquarium.simulateStreak.alive', "Alive streak"), detail: localize('aquarium.simulateStreak.aliveDetail', "Show a live feeding streak in the toggle tooltip.") };
		const diedItem = { id: 'died', label: localize('aquarium.simulateStreak.died', "Died streak (revivable)"), detail: localize('aquarium.simulateStreak.diedDetail', "Park a died streak and offer the revival prompt.") };
		const clearItem = { id: 'clear', label: localize('aquarium.simulateStreak.clear', "Clear streak"), detail: localize('aquarium.simulateStreak.clearDetail', "Remove all streak state.") };

		const scenario = await quickInputService.pick([aliveItem, diedItem, clearItem], {
			placeHolder: localize('aquarium.simulateStreak.placeholder', "Pick a streak scenario to simulate"),
		});
		if (!scenario) {
			return;
		}

		if (scenario.id === 'clear') {
			aquariumService.simulateStreak(0, true);
			return;
		}

		const raw = await quickInputService.input({
			value: '30',
			prompt: localize('aquarium.simulateStreak.countPrompt', "How many days should the streak be?"),
			validateInput: async (value) => {
				const n = Number(value);
				return (!Number.isInteger(n) || n <= 0)
					? localize('aquarium.simulateStreak.countInvalid', "Enter a whole number greater than 0.")
					: undefined;
			},
		});
		if (raw === undefined) {
			return;
		}

		aquariumService.simulateStreak(Number(raw), scenario.id === 'alive');
	}
}

registerAction2(SimulateFishFeedingStreakAction);
