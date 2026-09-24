/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IBannerItem, IBannerService } from '../../../../../services/banner/browser/bannerService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { AccountPolicyGateState, IAccountPolicyGateInfo, IAccountPolicyGateService } from '../../../../../services/policies/common/accountPolicyService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ManagedPluginAvailabilityContribution } from '../../../browser/managedPluginAvailability.contribution.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { getManagedPluginBlockInfo, IManagedPluginAvailability, IManagedPluginAvailabilityService, ManagedPluginAvailabilityService, ManagedPluginsUnavailableContext } from '../../../common/plugins/managedPluginAvailability.js';

suite('Managed plugin availability', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const unavailable: IManagedPluginAvailability = { kind: 'unavailable', pluginIds: ['required@managed'] };

	function setup(isSessionsWindow = false, hidden = false) {
		const services = workbenchInstantiationService(undefined, store);
		const availability = new ManagedPluginAvailabilityService();
		const configuration = new TestConfigurationService({ 'chat.disableAIFeatures': hidden });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const gateChanged = store.add(new Emitter<IAccountPolicyGateInfo>());
		const gate = new class extends mock<IAccountPolicyGateService>() {
			override gateInfo: IAccountPolicyGateInfo = { state: AccountPolicyGateState.Inactive };
			override readonly onDidChangeGateInfo = gateChanged.event;
		}();
		const banners = new Map<string, IBannerItem>();
		services.stub(IManagedPluginAvailabilityService, availability);
		services.stub(IConfigurationService, configuration);
		services.stub(IAccountPolicyGateService, gate);
		services.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly isSessionsWindow = isSessionsWindow;
		}());
		services.stub(IBannerService, new class extends mock<IBannerService>() {
			override show(item: IBannerItem): void { banners.set(item.id, item); }
			override hide(id: string): void { banners.delete(id); }
		}());
		const context = services.get(IContextKeyService);
		const contribution = store.add(services.createInstance(ManagedPluginAvailabilityContribution));
		return { availability, banners, context, contribution, gate, gateChanged };
	}

	test('deduplicates equal availability and does not expose Retry while installation is pending', () => {
		const availability = new ManagedPluginAvailabilityService();
		const states: (IManagedPluginAvailability | undefined)[] = [];
		store.add(autorun(reader => states.push(availability.state.read(reader))));
		availability.setState(unavailable);
		availability.setState({ ...unavailable, pluginIds: [...unavailable.pluginIds] });
		availability.setState(undefined);
		assert.deepStrictEqual({
			states,
			pendingAction: getManagedPluginBlockInfo({ kind: 'installing', pluginIds: unavailable.pluginIds }).action,
			unavailableTitle: getManagedPluginBlockInfo(unavailable).title,
		}, {
			states: [undefined, unavailable, undefined],
			pendingAction: undefined,
			unavailableTitle: 'Required plugins unavailable',
		});
	});

	test('keeps a persistent editor banner and closing it does not clear the submission block', () => {
		const { availability, banners, context } = setup();
		availability.setState(unavailable);
		const banner = banners.get(ManagedPluginAvailabilityContribution.ID)!;
		banner.onClose?.();
		banners.delete(banner.id);
		availability.setState({ ...unavailable, pluginIds: ['another@managed'] });
		const afterClose = {
			banners: banners.size,
			blocked: context.getContextKeyValue(ManagedPluginsUnavailableContext.key),
			kind: availability.state.get()?.kind,
		};
		availability.setState(undefined);
		const recovered = context.getContextKeyValue(ManagedPluginsUnavailableContext.key);
		availability.setState(unavailable);
		assert.deepStrictEqual({
			initial: { neutral: banner.neutral, priority: banner.priority, actions: banner.actions?.map(action => action.label) },
			afterClose,
			recovered,
			shownForNewRequirement: banners.size,
		}, {
			initial: { neutral: true, priority: -2, actions: ['Retry'] },
			afterClose: { banners: 0, blocked: true, kind: 'unavailable' },
			recovered: false,
			shownForNewRequirement: 1,
		});
	});

	test('Agents uses the blocked-state context without creating a redundant banner', () => {
		const { availability, banners, context } = setup(true);
		availability.setState(unavailable);
		assert.deepStrictEqual({
			blocked: context.getContextKeyValue(ManagedPluginsUnavailableContext.key),
			banners: banners.size,
		}, { blocked: true, banners: 0 });
	});

	test('hides presentation when AI is hidden and gives account policy precedence', () => {
		const hidden = setup(false, true);
		hidden.availability.setState(unavailable);
		const restricted = setup();
		restricted.availability.setState(unavailable);
		restricted.gate.gateInfo = { state: AccountPolicyGateState.Restricted };
		restricted.gateChanged.fire(restricted.gate.gateInfo);
		assert.deepStrictEqual({
			hiddenBanners: hidden.banners.size,
			hiddenContext: hidden.context.getContextKeyValue(ManagedPluginsUnavailableContext.key),
			restrictedBanners: restricted.banners.size,
			restrictedContext: restricted.context.getContextKeyValue(ManagedPluginsUnavailableContext.key),
		}, {
			hiddenBanners: 0,
			hiddenContext: false,
			restrictedBanners: 0,
			restrictedContext: false,
		});
	});

	test('input submission reads availability directly rather than input notifications', () => {
		const availability = new ManagedPluginAvailabilityService();
		const input = Object.create(ChatInputPart.prototype) as ChatInputPart;
		Object.defineProperty(input, 'managedPluginAvailabilityService', { value: availability });
		const values = [];
		for (const state of [undefined, unavailable, { kind: 'installing', pluginIds: unavailable.pluginIds } as const, undefined]) {
			availability.setState(state);
			values.push(input.isSubmissionBlocked);
		}
		assert.deepStrictEqual(values, [false, true, true, false]);
	});
});
