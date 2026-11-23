/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkbenchAssignmentService } from '../../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../../services/assignment/test/common/nullAssignmentService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { AGENTS_WINDOW_BANNER_DESCRIPTION_TREATMENT, AGENTS_WINDOW_BANNER_TITLE_TREATMENT, AgentsWindowGraphic, AgentsWindowGraphicDesign, renderAgentsWindowGraphic, resetAgentsWindowGraphicHidden } from '../../../browser/agentSessions/agentsWindowGraphic.js';
import { AgentsWindowGraphicVariant, AgentsWindowSectionStyle, ChatConfiguration } from '../../../common/constants.js';

suite('AgentsWindowGraphic', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const account = new class extends mock<IDefaultAccount>() { }();

	interface IGraphicOptions {
		readonly storageService?: InMemoryStorageService;
		readonly assignmentService?: IWorkbenchAssignmentService;
		/** The entitlement that the window restored at startup. Signed in by default. */
		readonly entitlement?: ChatEntitlement;
		/** Resolves the default account, which is signed in by default. */
		readonly accountResolution?: Promise<IDefaultAccount | null>;
	}

	function createGraphic(variant: string, options: IGraphicOptions = {}) {
		const configurationService = new TestConfigurationService({ [ChatConfiguration.WelcomePageAgentsWindowGraphic]: variant });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const entitlement = observableValue('entitlement', options.entitlement ?? ChatEntitlement.Pro);
		const chatEntitlementService = new class extends mock<IChatEntitlementService>() {
			override entitlementObs = entitlement;
		}();
		const onDidChangeDefaultAccount = store.add(new Emitter<IDefaultAccount | null>());
		const defaultAccountService = new class extends mock<IDefaultAccountService>() {
			override currentDefaultAccount: IDefaultAccount | null = options.accountResolution ? null : account;
			override onDidChangeDefaultAccount = onDidChangeDefaultAccount.event;
			override async getDefaultAccount(): Promise<IDefaultAccount | null> {
				this.currentDefaultAccount = await (options.accountResolution ?? this.currentDefaultAccount);
				return this.currentDefaultAccount;
			}
		}();
		const graphic = store.add(new AgentsWindowGraphic(configurationService, options.storageService ?? store.add(new InMemoryStorageService()), options.assignmentService ?? new NullWorkbenchAssignmentService(), new NullLogService(), chatEntitlementService, defaultAccountService));
		const setConfiguration = async (key: string, value: string) => {
			await configurationService.setUserConfiguration(key, value);
			configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string): boolean {
					return section === key;
				}
			}());
		};
		return {
			setVariant: (value: string) => setConfiguration(ChatConfiguration.WelcomePageAgentsWindowGraphic, value),
			setSectionStyle: (value: string) => setConfiguration(ChatConfiguration.WelcomePageAgentsWindowSectionStyle, value),
			setEntitlement: (value: ChatEntitlement) => entitlement.set(value, undefined),
			signIn: () => {
				defaultAccountService.currentDefaultAccount = account;
				onDidChangeDefaultAccount.fire(account);
			},
			sectionStyle: () => graphic.sectionStyle.get(),
			hide: () => graphic.hide(),
			bannerCopy: () => ({
				resolved: graphic.bannerCopyResolved.get(),
				title: graphic.element.querySelector('.agents-window-banner-title')?.textContent,
				description: graphic.element.querySelector('.agents-window-banner-description')?.textContent,
				shown: graphic.shownBannerCopy.get(),
			}),
			state: () => ({
				design: graphic.design.get(),
				shown: graphic.shownDesign.get(),
				display: graphic.element.style.display,
				rendered: graphic.element.querySelector('.agents-window-graphic')?.classList[1],
				text: graphic.element.textContent,
			}),
		};
	}

	test('shows the configured graphic and updates it when the setting changes', async () => {
		const graphic = createGraphic(AgentsWindowGraphicVariant.None);
		const states = [graphic.state()];
		for (const variant of [AgentsWindowGraphicVariant.WindowComparison, AgentsWindowGraphicVariant.Banner, 'manyWindowsToOne', 'auto']) {
			await graphic.setVariant(variant);
			states.push(graphic.state());
		}

		const none = { design: undefined, shown: undefined, display: 'none', rendered: undefined, text: '' };
		assert.deepStrictEqual(states, [
			none,
			{
				design: 'windowComparison', shown: 'windowComparison', display: '', rendered: 'window-comparison',
				text: 'Editor windowWork on one task at a time, with AI at your side.Agents windowNewRun multiple tasks at the same time, isolated from each other.',
			},
			{
				design: 'banner', shown: 'banner', display: '', rendered: 'banner',
				text: 'Agents windowNewAll your agents, across all your projects, in one windowBuilt to make you more productive when working with agents. Run several at the same time, each on its own task, and review their changes independently of each other when they\'re ready.',
			},
			// Values that are no longer supported show no graphic.
			none,
			none,
		]);
	});

	test('shows a graphic only to signed-in users, following the entitlement restored at startup until the account resolves', async () => {
		const accountResolution = new DeferredPromise<IDefaultAccount | null>();
		const graphic = createGraphic(AgentsWindowGraphicVariant.Banner, { accountResolution: accountResolution.p });
		const shown = () => graphic.state().shown;
		const states = [shown()];
		await accountResolution.complete(null);
		await timeout(0);
		states.push(shown());
		graphic.setEntitlement(ChatEntitlement.Unknown);
		graphic.signIn();
		states.push(shown());
		graphic.setEntitlement(ChatEntitlement.Free);
		states.push(shown());
		states.push(createGraphic(AgentsWindowGraphicVariant.WindowComparison, { entitlement: ChatEntitlement.Unknown }).state().shown);

		assert.deepStrictEqual(states, [
			// The restored entitlement is signed in, so the graphic doesn't wait for the account.
			'banner',
			// The account resolves as signed out.
			undefined,
			// After signing in, the graphic waits for the entitlement.
			undefined,
			'banner',
			// The restored entitlement is signed out.
			undefined,
		]);
	});

	test('replaces the banner\'s title and description with valid treatments, read while the banner is selected', async () => {
		const treatments: Record<string, string> = { [AGENTS_WINDOW_BANNER_TITLE_TREATMENT]: 'Treatment title', [AGENTS_WINDOW_BANNER_DESCRIPTION_TREATMENT]: '  ' };
		const requested: string[] = [];
		const refetched = store.add(new Emitter<void>());
		const assignmentService = new class extends mock<IWorkbenchAssignmentService>() {
			override onDidRefetchAssignments = refetched.event;
			override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
				requested.push(name);
				return treatments[name] as T | undefined;
			}
		}();
		const graphic = createGraphic(AgentsWindowGraphicVariant.WindowComparison, { assignmentService });
		const states = [{ ...graphic.bannerCopy(), requested: [...requested] }];
		await graphic.setVariant(AgentsWindowGraphicVariant.Banner);
		await timeout(0);
		states.push({ ...graphic.bannerCopy(), requested: [...requested] });
		treatments[AGENTS_WINDOW_BANNER_DESCRIPTION_TREATMENT] = 'Treatment description';
		refetched.fire();
		await timeout(0);
		states.push({ ...graphic.bannerCopy(), requested: [...requested] });

		const treatmentNames = [AGENTS_WINDOW_BANNER_TITLE_TREATMENT, AGENTS_WINDOW_BANNER_DESCRIPTION_TREATMENT];
		assert.deepStrictEqual(states, [
			// The window comparison has no title or description, so the treatments aren't read.
			{ resolved: false, title: undefined, description: undefined, shown: undefined, requested: [] },
			// A blank description is ignored, so the default shows.
			{ resolved: true, title: 'Treatment title', description: 'Built to make you more productive when working with agents. Run several at the same time, each on its own task, and review their changes independently of each other when they\'re ready.', shown: { title: 'Treatment title', description: undefined }, requested: treatmentNames },
			// Refetched text is rendered and reported, so that the page fits the banner again.
			{ resolved: true, title: 'Treatment title', description: 'Treatment description', shown: { title: 'Treatment title', description: 'Treatment description' }, requested: [...treatmentNames, ...treatmentNames] },
		]);
	});

	test('keeps the graphic hidden in the profile, for every graphic, until it is reset', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const graphic = createGraphic(AgentsWindowGraphicVariant.Banner, { storageService });
		const shown = () => {
			const { design, shown, display } = graphic.state();
			return { design, shown, display };
		};
		const states = [shown()];
		graphic.hide();
		states.push(shown());
		await graphic.setVariant(AgentsWindowGraphicVariant.WindowComparison);
		states.push(shown());
		const otherPage = createGraphic(AgentsWindowGraphicVariant.Banner, { storageService });
		states.push({ design: otherPage.state().design, shown: otherPage.state().shown, display: otherPage.state().display });
		resetAgentsWindowGraphicHidden(storageService);
		states.push(shown());

		assert.deepStrictEqual(states, [
			{ design: 'banner', shown: 'banner', display: '' },
			{ design: 'banner', shown: undefined, display: 'none' },
			{ design: 'windowComparison', shown: undefined, display: 'none' },
			{ design: 'banner', shown: undefined, display: 'none' },
			{ design: 'windowComparison', shown: 'windowComparison', display: '' },
		]);
	});

	test('reads the section style and updates it when the setting changes', async () => {
		const graphic = createGraphic(AgentsWindowGraphicVariant.WindowComparison);
		const styles = [graphic.sectionStyle()];
		for (const style of [AgentsWindowSectionStyle.None, AgentsWindowSectionStyle.Card, AgentsWindowSectionStyle.Outline, AgentsWindowSectionStyle.Tint, AgentsWindowSectionStyle.Band, AgentsWindowSectionStyle.Separator, 'unknown']) {
			await graphic.setSectionStyle(style);
			styles.push(graphic.sectionStyle());
		}

		assert.deepStrictEqual(styles, ['outline', 'none', 'card', 'outline', 'tint', 'band', 'separator', 'outline']);
	});

	test('hides the drawings from screen readers, gives the banner a heading, and gives every clip path a unique id', () => {
		const designs: AgentsWindowGraphicDesign[] = [AgentsWindowGraphicVariant.Banner, AgentsWindowGraphicVariant.Banner, AgentsWindowGraphicVariant.WindowComparison];
		const elements = designs.map(design => renderAgentsWindowGraphic(design));
		const drawings = elements.flatMap(element => [...element.querySelectorAll('svg')]);
		const clipPathIds = elements.flatMap(element => [...element.querySelectorAll('clipPath')].map(clipPath => clipPath.id));
		const headings = elements.flatMap(element => [...element.querySelectorAll('[role="heading"]')].map(heading => `${heading.getAttribute('aria-level')}: ${heading.textContent}`));

		assert.deepStrictEqual(
			{ drawings: drawings.length, hidden: drawings.filter(drawing => drawing.getAttribute('aria-hidden') === 'true').length, clipPaths: clipPathIds.length, unique: new Set(clipPathIds).size, headings },
			{
				drawings: 4, hidden: 4, clipPaths: 4, unique: 4, headings: [
					'2: All your agents, across all your projects, in one window',
					'2: All your agents, across all your projects, in one window',
				]
			},
		);
	});
});
