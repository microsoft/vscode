/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, isHTMLElement } from '../../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IDelayedHoverOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ArtifactDetails, ArtifactRun, ArtifactSnapshot, IArtifactModel } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { artifactBindingId } from '../../../../../platform/artifactIntegrations/common/artifactIntegrationStore.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { chartsGreen, chartsRed } from '../../../../../platform/theme/common/colors/chartsColors.js';
import { ChatPillActionViewItem, IChatPillEntry } from '../../../../../workbench/browser/chatPills.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ArtifactIntegrationPresentation } from '../../browser/artifactIntegrationPresentation.js';

suite('Artifact Integration Presentation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function run(integrationId: string, actionId: string, state: ArtifactRun['state'], source: ArtifactRun['source'] = 'manual', id = `${integrationId}-${actionId}-${state}`): ArtifactRun {
		return {
			id, requestId: id, bindingId: artifactBindingId('client', 'session', 'artifact', integrationId), actionId, actionKind: 'prompt', actionConsent: 'consent',
			source, state, createdAt: 0, updatedAt: 0, reason: actionId, chat: 'invoking-chat', dispatched: state !== 'queued',
		};
	}

	function fixture(toolbarActions?: readonly IAction[]) {
		const instantiation = workbenchInstantiationService(undefined, store);
		const hovers = new Map<HTMLElement, IDelayedHoverOptions | (() => IDelayedHoverOptions)>();
		const dismissed: boolean[] = [];
		instantiation.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupDelayedHover(target: HTMLElement, options: IDelayedHoverOptions | (() => IDelayedHoverOptions)) {
				hovers.set(target, options);
				return toDisposable(() => hovers.delete(target));
			}
			override hideHover(force?: boolean): void {
				dismissed.push(force === true);
			}
		}());
		const errors: string[] = [];
		instantiation.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(error: string | Error): void { errors.push(String(error)); }
		}());
		const openedItems: string[] = [];
		instantiation.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(resource: Parameters<IOpenerService['open']>[0]): Promise<boolean> {
				openedItems.push(resource.toString());
				return true;
			}
		}());
		instantiation.stub(IQuickInputService, new class extends mock<IQuickInputService>() { }());
		const snapshot = observableValue<ArtifactSnapshot>('artifact', {
			authority: { id: 'client', targetHost: 'host', location: 'client' }, session: 'session',
			artifact: { id: 'artifact', label: 'Original', resource: 'https://example.test' }, mainIntegrationId: 'test', runs: [],
			contributions: [{
				integrationId: 'test', label: 'Test',
				configuration: { revision: 0, values: {}, generations: {}, disablements: {} }, options: [],
				actions: [{ id: 'analyse', label: 'Analyse', iconId: 'search', kind: 'prompt' }],
				view: {
					availability: { kind: 'available' }, main: { icon: { id: 'link', colorId: chartsGreen }, label: '<img src=x>', detailsId: 'main' },
					sections: [{ id: 'status', icon: { id: 'check', colorId: chartsRed }, label: '1/1', description: '1 of 1 checks passed', detailsId: 'status' }],
					stateActions: [{ id: 'analyse', enabled: true }], generalActions: [], automationAvailability: [],
				},
			}],
		});
		let opened = 0;
		let closed = 0;
		let resourceOpens = 0;
		let chat = 'invoking-chat';
		const invokedChats: string[] = [];
		const invoked: { integrationId: string; actionId: string }[] = [];
		const acquiredDetails: string[] = [];
		const configured: { integrationId: string; revision: number; values: Readonly<Record<string, boolean | string>> }[] = [];
		let configureResult: Promise<void> | undefined;
		const details = observableValue<ArtifactDetails>('details', {
			title: 'Plain <b>details</b>', availability: { kind: 'available' }, links: [], items: [], completeness: 'complete',
		});
		const model: IArtifactModel = {
			snapshot,
			configure: async (integrationId, revision, values) => {
				configured.push({ integrationId, revision, values });
				await configureResult;
				const current = snapshot.get();
				snapshot.set({
					...current,
					contributions: current.contributions.map(contribution => contribution.integrationId !== integrationId ? contribution : {
						...contribution,
						configuration: { ...contribution.configuration, revision: revision + 1, values: { ...contribution.configuration.values, ...values } },
					}),
				}, undefined);
			},
			cancel: async () => { },
			reconcile: async () => { },
			getRuns: async () => ({ runs: [] }),
			invoke: async (integrationId, actionId, destination, requestId) => {
				invokedChats.push(destination);
				invoked.push({ integrationId, actionId });
				const created: ArtifactRun = { ...run(integrationId, actionId, 'queued', 'manual', requestId), chat: destination };
				snapshot.set({ ...snapshot.get(), runs: [...snapshot.get().runs, created] }, undefined);
				return created;
			},
			acquireDetails: async (_integration, detailsId) => {
				opened++;
				acquiredDetails.push(detailsId);
				const lifetime = toDisposable(() => closed++);
				return {
					details,
					dispose: () => lifetime.dispose(),
				};
			},
		};
		const presentation = store.add(instantiation.createInstance(ArtifactIntegrationPresentation, model, () => chat));
		const base: IChatPillEntry = { id: 'artifact', label: 'Original', toolbarActions, open: () => { resourceOpens++; } };
		const entry = derived(reader => presentation.decorate(base, reader));
		const host = $('.monaco-workbench.chat-pills');
		const container = append(append(host, $('.monaco-action-bar')), $('.test-artifact-pill.action-item'));
		mainWindow.document.body.appendChild(host);
		store.add(toDisposable(() => host.remove()));
		const item = entry.get().inlinePill!.createActionViewItem!({});
		assert.ok(item instanceof BaseActionViewItem);
		store.add(item);
		item.render(container);
		return {
			presentation, snapshot, details, base, entry, host, container, item, hovers, dismissed, configured, errors, openedItems, acquiredDetails,
			counts: () => ({ opened, closed, resourceOpens }), invokedChats, invoked,
			setChat: (value: string) => { chat = value; },
			setConfigureResult: (result: Promise<void>) => { configureResult = result; },
		};
	}

	function referencePill(f: ReturnType<typeof fixture>): HTMLElement {
		f.host.style.setProperty('--vscode-cornerRadius-medium', '6px');
		f.host.style.setProperty('--vscode-cornerRadius-circle', '9999px');
		f.host.style.setProperty('--vscode-strokeThickness', '1px');
		f.host.style.setProperty('--vscode-button-secondaryBorder', 'currentColor');
		f.host.style.setProperty('--vscode-spacing-size40', '4px');
		f.host.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		const action = store.add(new Action('standard-pill', f.snapshot.get().contributions[0].view.main!.label, ThemeIcon.asClassName(Codicon.link)));
		const item = store.add(new ChatPillActionViewItem(undefined, action, {}));
		item.render(append(f.container.parentElement!, $('.test-standard-pill.action-item')));
		return item.buttonElement!;
	}

	function buttonAppearance(button: HTMLElement) {
		const style = mainWindow.getComputedStyle(button);
		const glyph = mainWindow.getComputedStyle(button.querySelector('.codicon')!);
		return {
			height: button.getBoundingClientRect().height,
			padding: style.padding,
			fontSize: style.fontSize,
			lineHeight: style.lineHeight,
			gap: style.gap,
			background: button.style.backgroundColor,
			foreground: button.style.color,
			icon: { width: glyph.width, height: glyph.height, margin: glyph.margin, fontSize: glyph.fontSize },
		};
	}

	function openDetails(f: ReturnType<typeof fixture>, selector = '.chat-pill-button') {
		const factory = f.hovers.get(f.container.querySelector<HTMLElement>(selector)!);
		assert.ok(typeof factory === 'function');
		const hover = factory();
		assert.ok(isHTMLElement(hover.content));
		f.container.appendChild(hover.content);
		hover.onDidShow?.();
		return { element: hover.content, close: () => hover.onDidHide?.() };
	}

	/** Describes each action unit as an accessibility tree would: its group name, controls, and visible explanations. */
	function outline(panel: HTMLElement): string[][] {
		return [...panel.querySelectorAll<HTMLElement>('.artifact-action-unit')].map(unit => {
			const labelledBy = unit.getAttribute('aria-labelledby');
			const group = unit.getAttribute('role') === 'group' ? (labelledBy ? unit.ownerDocument.getElementById(labelledBy)?.textContent : unit.getAttribute('aria-label')) : undefined;
			return [
				...group ? [`group: ${group}`] : [],
				...[...unit.querySelectorAll<HTMLElement>('[role="button"], [role="switch"], .artifact-action-note, .artifact-automation-reason')].flatMap(element => {
					if (!element.getAttribute('role')) {
						return element.hidden ? [] : [`note: ${element.textContent}`];
					}
					const disabled = element.getAttribute('aria-disabled') === 'true' || element.matches(':disabled');
					return [`${element.getAttribute('role')}: ${element.getAttribute('aria-label')}${element.getAttribute('aria-checked') === 'true' ? ' (on)' : ''}${disabled ? ' (disabled)' : ''}`];
				}),
			];
		});
	}

	function visibleSections(panel: HTMLElement): string[] {
		return [...panel.children].filter(child => isHTMLElement(child) && !child.hidden).map(child => child.classList[0] ?? child.tagName.toLowerCase());
	}

	function checksFixture() {
		const f = fixture();
		f.snapshot.set({
			...f.snapshot.get(),
			contributions: f.snapshot.get().contributions.map(contribution => ({
				...contribution,
				options: [
					{ id: 'fix', kind: 'boolean', label: 'Auto Fix CI', description: 'Repair failed checks.', actionIds: ['analyse'], maxAttempts: 3, defaultValue: false },
					{ id: 'merge', kind: 'boolean', label: 'Auto Merge', description: 'Merge when ready.', actionIds: ['merge'], maxAttempts: 1, defaultValue: false },
				],
				actions: [...contribution.actions, { id: 'merge', label: 'Merge', kind: 'code', iconId: 'git-merge' }],
				configuration: { revision: 4, values: { fix: false, merge: false }, generations: {}, disablements: {} },
				view: {
					...contribution.view,
					generalActions: [{ id: 'merge', enabled: true }],
					automationAvailability: [{ id: 'fix', available: true }, { id: 'merge', available: true }],
				},
			})),
		}, undefined);
		f.details.set({
			title: 'CI checks', availability: { kind: 'available' }, completeness: 'complete',
			links: [{ kind: 'automation', optionId: 'fix' }, { kind: 'action', actionId: 'analyse' }],
			items: [
				{ id: 'lint', label: 'Lint', description: 'Failed', icon: { id: 'error', colorId: chartsRed }, resource: 'https://example.test/lint' },
				{ id: 'build', label: 'Build', description: 'Running', icon: { id: 'clock' }, resource: 'https://example.test/build' },
				{ id: 'tests', label: 'Tests', description: 'Passed', icon: { id: 'pass', colorId: chartsGreen }, resource: 'https://example.test/tests' },
			],
		}, undefined);
		return f;
	}

	test('one pill contains resource and status controls without a separate Actions segment', () => {
		const f = fixture();
		assert.deepStrictEqual({
			onePill: f.container.classList.contains('artifact-integration-pill'),
			labels: [...f.container.querySelectorAll<HTMLElement>('[role="button"]')].map(element => element.textContent),
			sectionName: f.container.querySelector('.artifact-pill-sections [role="button"]')?.getAttribute('aria-label'),
			images: f.container.querySelectorAll('img').length,
			details: f.counts().opened,
		}, { onePill: true, labels: ['<img src=x>', '1/1'], sectionName: 'Show details: 1 of 1 checks passed', images: 0, details: 0 });
	});

	test('every segment uses the shared chat pill button, label, and icon styling', () => {
		const f = fixture();
		assert.deepStrictEqual(
			[...f.container.querySelectorAll<HTMLElement>('[role="button"]')].map(button => ({
				label: button.textContent,
				textButton: button.classList.contains('monaco-text-button'),
				chatPillButton: button.classList.contains('chat-pill-button'),
				chatPillLabel: !!button.querySelector('.chat-pill-label'),
				chatPillIcon: !!button.querySelector('.chat-pill-icon'),
				iconColor: button.querySelector<HTMLElement>('.artifact-icon')?.style.color,
			})),
			[
				{ label: '<img src=x>', textButton: true, chatPillButton: true, chatPillLabel: true, chatPillIcon: true, iconColor: 'var(--vscode-charts-green)' },
				{ label: '1/1', textButton: true, chatPillButton: true, chatPillLabel: true, chatPillIcon: true, iconColor: 'var(--vscode-charts-red)' },
			],
		);
	});

	test('a single-part artifact matches the standard chat pill appearance', () => {
		const f = fixture();
		const reference = referencePill(f);
		f.snapshot.set({
			...f.snapshot.get(),
			contributions: f.snapshot.get().contributions.map(contribution => ({
				...contribution, view: { ...contribution.view, sections: [] },
			})),
		}, undefined);
		const main = f.container.querySelector<HTMLElement>('.chat-pill-button')!;
		assert.deepStrictEqual({
			appearance: buttonAppearance(main),
			width: main.getBoundingClientRect().width,
			radius: mainWindow.getComputedStyle(main).borderRadius,
			segmented: f.container.classList.contains('chat-pill-segmented'),
		}, {
			appearance: buttonAppearance(reference),
			width: reference.getBoundingClientRect().width,
			radius: mainWindow.getComputedStyle(reference).borderRadius,
			segmented: false,
		});
	});

	test('joining and removing sections preserves the standard height and outer corners', () => {
		const f = fixture();
		const reference = referencePill(f);
		const referenceStyle = mainWindow.getComputedStyle(reference);
		const main = f.container.querySelector<HTMLElement>('.chat-pill-button')!;
		const section = f.container.querySelector<HTMLElement>('.artifact-pill-sections .chat-pill-button')!;
		const mainStyle = mainWindow.getComputedStyle(main);
		const sectionStyle = mainWindow.getComputedStyle(section);
		const joined = {
			appearances: [main, section].map(buttonAppearance),
			height: f.container.getBoundingClientRect().height,
			oneRow: main.getBoundingClientRect().top === section.getBoundingClientRect().top,
			radii: [mainStyle.borderTopLeftRadius, mainStyle.borderTopRightRadius, sectionStyle.borderTopLeftRadius, sectionStyle.borderTopRightRadius],
			borders: [mainStyle.borderLeftWidth, mainStyle.borderRightWidth, sectionStyle.borderLeftWidth, sectionStyle.borderRightWidth],
		};
		f.snapshot.set({
			...f.snapshot.get(),
			contributions: f.snapshot.get().contributions.map(contribution => ({
				...contribution, view: { ...contribution.view, sections: [] },
			})),
		}, undefined);
		assert.deepStrictEqual({
			joined,
			singleRadius: mainWindow.getComputedStyle(main).borderRadius,
			sectionsDisplay: mainWindow.getComputedStyle(f.container.querySelector('.chat-pill-sections')!).display,
		}, {
			joined: {
				appearances: [buttonAppearance(reference), buttonAppearance(reference)],
				height: reference.getBoundingClientRect().height,
				oneRow: true,
				radii: [referenceStyle.borderTopLeftRadius, '0px', '0px', referenceStyle.borderTopRightRadius],
				borders: [referenceStyle.borderLeftWidth, '0px', '0px', referenceStyle.borderRightWidth],
			},
			singleRadius: referenceStyle.borderRadius,
			sectionsDisplay: 'none',
		});
	});

	test('compact rows collapse all segment labels while retaining their icons', () => {
		const f = fixture();
		f.host.classList.add('chat-pills-row', 'compact');
		assert.deepStrictEqual(
			[...f.container.querySelectorAll<HTMLElement>('.chat-pill-button')].map(button => ({
				labelVisible: mainWindow.getComputedStyle(button.querySelector('.chat-pill-label')!).display !== 'none',
				iconVisible: mainWindow.getComputedStyle(button.querySelector('.chat-pill-icon')!).display !== 'none',
				name: button.getAttribute('aria-label'),
			})),
			[
				{ labelVisible: false, iconVisible: true, name: 'Open <img src=x>' },
				{ labelVisible: false, iconVisible: true, name: 'Show details: 1 of 1 checks passed' },
			],
		);
	});

	test('detail leases are lazy, survive unrelated state updates, and close with the surface', async () => {
		const f = fixture();
		const main = f.container.querySelector<HTMLElement>('.chat-pill-button')!;
		const factory = f.hovers.get(main);
		assert.strictEqual(typeof factory, 'function');
		const hover = typeof factory === 'function' ? factory() : undefined;
		assert.ok(hover && isHTMLElement(hover.content));
		assert.deepStrictEqual(f.counts(), { opened: 0, closed: 0, resourceOpens: 0 });
		hover.onDidShow?.();
		await Promise.resolve();
		main.focus();
		f.snapshot.set({ ...f.snapshot.get(), artifact: { ...f.snapshot.get().artifact, label: 'Updated' } }, undefined);
		await Promise.resolve();
		assert.deepStrictEqual({ opened: f.counts().opened, focused: mainWindow.document.activeElement === main, markup: hover.content.querySelectorAll('b').length }, { opened: 1, focused: true, markup: 0 });
		hover.onDidHide?.();
		assert.deepStrictEqual(f.counts(), { opened: 1, closed: 1, resourceOpens: 0 });
	});

	test('resource opening remains separate from background action dispatch', async () => {
		const f = fixture();
		f.container.querySelector<HTMLElement>('.chat-pill-button')!.click();
		const invoking = f.presentation.invoke('test', 'analyse');
		f.setChat('another-chat');
		await invoking;
		assert.deepStrictEqual({ opens: f.counts().resourceOpens, chats: f.invokedChats }, { opens: 1, chats: ['invoking-chat'] });
	});

	test('a provider section named main does not replace the main details control', async () => {
		const f = fixture();
		f.snapshot.set({
			...f.snapshot.get(),
			contributions: f.snapshot.get().contributions.map(contribution => ({
				...contribution, view: { ...contribution.view, sections: contribution.view.sections.map(section => ({ ...section, id: 'main' })) },
			})),
		}, undefined);
		openDetails(f);
		await Promise.resolve();
		openDetails(f, '.artifact-pill-sections [role="button"]');
		await Promise.resolve();
		assert.deepStrictEqual(f.acquiredDetails, ['main', 'status']);
	});

	test('removing the focused action keeps focus in the details panel', () => {
		const f = fixture();
		const factory = f.hovers.get(f.container.querySelector<HTMLElement>('.chat-pill-button')!);
		assert.ok(typeof factory === 'function');
		const hover = factory();
		assert.ok(isHTMLElement(hover.content));
		f.container.appendChild(hover.content);
		const action = hover.content.querySelector<HTMLElement>('.artifact-action-unit [role="button"]')!;
		action.focus();
		f.snapshot.set({
			...f.snapshot.get(),
			contributions: f.snapshot.get().contributions.map(contribution => ({
				...contribution, view: { ...contribution.view, stateActions: [] },
			})),
		}, undefined);
		assert.deepStrictEqual({
			focused: mainWindow.document.activeElement === hover.content,
			oldActionConnected: action.isConnected,
		}, { focused: true, oldActionConnected: false });
	});

	test('live updates preserve the action bar tab-stop policy', () => {
		const f = fixture();
		f.item.setFocusable(false);
		f.snapshot.set({ ...f.snapshot.get(), artifact: { ...f.snapshot.get().artifact, label: 'Updated' } }, undefined);
		assert.deepStrictEqual(
			[...f.container.querySelectorAll<HTMLElement>('.artifact-pill-sections [role="button"]')].map(element => element.tabIndex),
			[-1],
		);
	});

	test('section details lead with status, then related actions and switches, then the icon-leading checks list', async () => {
		const f = checksFixture();
		const panel = openDetails(f, '.artifact-pill-sections [role="button"]');
		await Promise.resolve();
		assert.deepStrictEqual({
			role: panel.element.getAttribute('role'),
			name: panel.element.getAttribute('aria-label'),
			status: panel.element.querySelector('.artifact-details-status')?.textContent,
			layout: visibleSections(panel.element),
			units: outline(panel.element),
			items: [...panel.element.querySelectorAll('.artifact-details-item')].map(element => ({
				label: element.textContent,
				hasIcon: !!element.querySelector('.artifact-icon .codicon'),
			})),
			unrelated: panel.element.textContent?.includes('Auto Merge') || panel.element.textContent?.includes('https://example.test'),
		}, {
			role: 'dialog', name: 'CI checks', status: '1 of 1 checks passed',
			layout: ['artifact-details-state', 'artifact-action-units', 'artifact-details-list'],
			units: [['group: Analyse', 'button: Analyse', 'switch: Auto Fix CI']],
			items: [{ label: 'Lint', hasIcon: true }, { label: 'Build', hasIcon: true }, { label: 'Tests', hasIcon: true }],
			unrelated: false,
		});
	});

	test('switches save through the owning integration and keep their identity across updates', async () => {
		const f = checksFixture();
		const panel = openDetails(f, '.artifact-pill-sections [role="button"]');
		await Promise.resolve();
		const toggle = panel.element.querySelector<HTMLButtonElement>('[role="switch"]')!;
		toggle.focus();
		toggle.click();
		await timeout(0);
		assert.deepStrictEqual({
			configured: f.configured,
			checked: toggle.getAttribute('aria-checked'),
			disabled: toggle.disabled,
			sameControl: panel.element.querySelector('[role="switch"]') === toggle,
			focused: mainWindow.document.activeElement === toggle,
			detailLeases: f.counts().opened,
			errors: f.errors,
		}, {
			configured: [{ integrationId: 'test', revision: 4, values: { fix: true } }],
			checked: 'true', disabled: false, sameControl: true, focused: true, detailLeases: 1, errors: [],
		});
	});

	test('a rejected switch update reports the error and retains the saved value', async () => {
		const f = checksFixture();
		const saving = new DeferredPromise<void>();
		f.setConfigureResult(saving.p);
		const panel = openDetails(f, '.artifact-pill-sections [role="button"]');
		await Promise.resolve();
		const toggle = panel.element.querySelector<HTMLButtonElement>('[role="switch"]')!;
		toggle.click();
		const pending = { checked: toggle.getAttribute('aria-checked'), disabled: toggle.disabled };
		await saving.error(new Error('Configuration changed'));
		await timeout(0);
		assert.deepStrictEqual({
			pending, checked: toggle.getAttribute('aria-checked'), disabled: toggle.disabled, errors: f.errors,
		}, {
			pending: { checked: 'false', disabled: true }, checked: 'false', disabled: false,
			errors: ['The artifact operation failed: Configuration changed'],
		});
	});

	test('section controls stay scoped when integrations use the same local IDs', async () => {
		const f = checksFixture();
		const original = f.snapshot.get().contributions[0];
		f.snapshot.set({ ...f.snapshot.get(), contributions: [original, { ...original, integrationId: 'another', label: 'Another Integration' }] }, undefined);
		const panel = openDetails(f, '.artifact-pill-sections [role="button"]:nth-child(2)');
		await Promise.resolve();
		panel.element.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			toggles: panel.element.querySelectorAll('[role="switch"]').length,
			configured: f.configured,
			originalValue: f.snapshot.get().contributions[0].configuration.values.fix,
		}, {
			toggles: 1, configured: [{ integrationId: 'another', revision: 4, values: { fix: true } }], originalValue: false,
		});
	});

	test('unavailable automation can still be turned off and explains why enabling is blocked', async () => {
		const f = checksFixture();
		f.snapshot.set({
			...f.snapshot.get(),
			contributions: f.snapshot.get().contributions.map(contribution => ({
				...contribution,
				configuration: { ...contribution.configuration, values: { fix: true, merge: false } },
				view: { ...contribution.view, automationAvailability: [{ id: 'fix', available: false, unavailableReason: 'Sign in to enable automatic fixes.' }] },
			})),
		}, undefined);
		const panel = openDetails(f, '.artifact-pill-sections [role="button"]');
		await Promise.resolve();
		const toggle = panel.element.querySelector<HTMLButtonElement>('[role="switch"]')!;
		const enabledBefore = !toggle.disabled;
		toggle.click();
		await timeout(0);
		assert.deepStrictEqual({
			enabledBefore, checked: toggle.getAttribute('aria-checked'), disabled: toggle.disabled,
			reason: panel.element.querySelector('.artifact-automation-reason')?.textContent,
		}, {
			enabledBefore: true, checked: 'false', disabled: true, reason: 'Sign in to enable automatic fixes.',
		});
	});

	test('removing the focused automation control returns focus to the panel', async () => {
		const f = checksFixture();
		const panel = openDetails(f, '.artifact-pill-sections [role="button"]');
		await Promise.resolve();
		const toggle = panel.element.querySelector<HTMLButtonElement>('[role="switch"]')!;
		toggle.focus();
		f.details.set({ ...f.details.get(), links: [] }, undefined);
		assert.deepStrictEqual({
			focused: mainWindow.document.activeElement === panel.element,
			oldControlConnected: toggle.isConnected,
		}, { focused: true, oldControlConnected: false });
	});

	test('dropdown tab order follows the rendered order after actions are reordered', async () => {
		const f = checksFixture();
		const hover = f.entry.get().hover!;
		assert.ok(typeof hover.content === 'function');
		const content = hover.content();
		assert.ok(isHTMLElement(content));
		f.container.appendChild(content);
		await Promise.resolve();
		const before = hover.getTabbableElements?.().map(element => element.getAttribute('aria-label'));
		f.snapshot.set({
			...f.snapshot.get(),
			contributions: f.snapshot.get().contributions.map(contribution => ({ ...contribution, actions: [...contribution.actions].reverse() })),
		}, undefined);
		assert.deepStrictEqual({ before, after: hover.getTabbableElements?.().map(element => element.getAttribute('aria-label')) }, {
			before: ['Analyse', 'Auto Fix CI', 'Merge', 'Auto Merge', 'CI checks'],
			after: ['Merge', 'Auto Merge', 'Analyse', 'Auto Fix CI', 'CI checks'],
		});
	});

	test('main details pair each action with its automation, show shared automation once, and end with general actions', async () => {
		const f = fixture([store.add(new Action('copyLink', 'Copy Link', ThemeIcon.asClassName(Codicon.copy)))]);
		f.snapshot.set({
			...f.snapshot.get(),
			runs: [run('test', 'analyse', 'completed')],
			contributions: f.snapshot.get().contributions.map(contribution => ({
				...contribution,
				actions: [
					{ id: 'fix', label: 'Fix Checks', iconId: 'wrench', kind: 'prompt' },
					{ id: 'ready', label: 'Mark Ready', iconId: 'check', kind: 'code' },
					{ id: 'merge', label: 'Merge', iconId: 'git-merge', kind: 'code' },
					...contribution.actions,
					{ id: 'refresh', label: 'Refresh', iconId: 'refresh', kind: 'code' },
				],
				options: [
					{ id: 'land', kind: 'boolean', label: 'Mark ready and merge when checks pass', description: 'Land the change.', actionIds: ['merge', 'ready'], maxAttempts: 1, defaultValue: false },
					{ id: 'fixAuto', kind: 'boolean', label: 'Fix automatically when checks fail', description: 'Repair failed checks.', actionIds: ['fix'], maxAttempts: 3, defaultValue: false },
					{ id: 'fixDaily', kind: 'enum', label: 'Fix on a schedule', description: 'Repair checks on a schedule.', actionIds: ['fix'], maxAttempts: 1, choices: [{ value: 'off', label: 'Off' }, { value: 'daily', label: 'Daily' }], disabledValue: 'off', defaultValue: 'off' },
				],
				configuration: { revision: 1, values: { fixAuto: true, fixDaily: 'daily' }, generations: {}, disablements: {} },
				view: {
					...contribution.view,
					stateActions: [{ id: 'analyse', enabled: true }, { id: 'ready', enabled: false, disabledReason: 'Checks are still running.' }, { id: 'fix', enabled: true }],
					generalActions: [{ id: 'refresh', enabled: false, disabledReason: 'Already refreshing.' }],
					automationAvailability: [{ id: 'land', available: true }, { id: 'fixAuto', available: true }, { id: 'fixDaily', available: true }],
				},
			})),
		}, undefined);
		const hover = f.entry.get().hover!;
		assert.ok(typeof hover.content === 'function');
		const content = hover.content();
		assert.ok(isHTMLElement(content));
		f.container.appendChild(content);
		await Promise.resolve();
		const ready = [...content.querySelectorAll<HTMLElement>('.artifact-action-unit [role="button"]')].find(button => button.textContent === 'Mark Ready')!;
		assert.deepStrictEqual({
			layout: visibleSections(content),
			units: outline(content),
			disabledAction: { tabIndex: ready.tabIndex, description: content.ownerDocument.getElementById(ready.getAttribute('aria-describedby') ?? '')?.textContent },
			general: [...content.querySelectorAll('[aria-label="General Actions"] [role="button"]')].map(element => element.textContent),
			tabOrder: hover.getTabbableElements?.().map(element => element.getAttribute('aria-label')),
		}, {
			layout: ['artifact-details-state', 'artifact-action-units', 'artifact-controls'],
			units: [
				['group: Fix Checks', 'button: Fix Checks', 'switch: Fix automatically when checks fail (on)', 'button: Fix on a schedule: Daily'],
				['button: Mark Ready (disabled)', 'note: Checks are still running.'],
				['group: Applies to: Mark Ready, Merge', 'switch: Mark ready and merge when checks pass'],
				['button: Analyse'],
			],
			disabledAction: { tabIndex: 0, description: 'Checks are still running.' },
			general: ['Refresh', 'Copy Link', 'View Activity'],
			tabOrder: ['Fix Checks', 'Fix automatically when checks fail', 'Fix on a schedule: Daily', 'Mark Ready', 'Mark ready and merge when checks pass', 'Analyse', 'Refresh. Already refreshing.', 'Copy Link', 'View Activity'],
		});
	});

	test('main details keep automation that is on or was turned off automatically when its action is not offered, and switching never runs it', async () => {
		const f = checksFixture();
		f.snapshot.set({
			...f.snapshot.get(),
			contributions: f.snapshot.get().contributions.map(contribution => ({
				...contribution,
				actions: [...contribution.actions, { id: 'ready', label: 'Mark Ready', iconId: 'check', kind: 'code' }, { id: 'close', label: 'Close', iconId: 'close', kind: 'code' }],
				options: [
					...contribution.options,
					{ id: 'readyAuto', kind: 'boolean', label: 'Mark ready automatically', description: 'Mark ready.', actionIds: ['ready'], maxAttempts: 1, defaultValue: false },
					{ id: 'closeAuto', kind: 'boolean', label: 'Close automatically', description: 'Close when stale.', actionIds: ['close'], maxAttempts: 1, defaultValue: false },
				],
				configuration: { ...contribution.configuration, values: { fix: true, merge: false }, disablements: { closeAuto: { reason: 'Turned off after 1 attempt.', attempts: 1 } } },
				view: { ...contribution.view, stateActions: [] },
			})),
		}, undefined);
		const panel = openDetails(f);
		await Promise.resolve();
		const before = outline(panel.element);
		panel.element.querySelector<HTMLElement>('[role="switch"][aria-checked="true"]')!.click();
		await timeout(0);
		const paused = ['group: Close', 'switch: Close automatically (disabled)', 'note: Turned off after 1 attempt.'];
		assert.deepStrictEqual({ before, after: outline(panel.element), configured: f.configured, invoked: f.invoked }, {
			before: [['group: Analyse', 'switch: Auto Fix CI (on)'], ['group: Merge', 'button: Merge', 'switch: Auto Merge'], paused],
			after: [['group: Analyse', 'switch: Auto Fix CI'], ['group: Merge', 'button: Merge', 'switch: Auto Merge'], paused],
			configured: [{ integrationId: 'test', revision: 4, values: { fix: false } }],
			invoked: [],
		});
	});

	test('an action shows its own progress and ignores repeated requests until its run settles', async () => {
		const f = fixture();
		f.snapshot.set({ ...f.snapshot.get(), runs: [run('another', 'analyse', 'running', 'automation')] }, undefined);
		const panel = openDetails(f);
		await Promise.resolve();
		const button = panel.element.querySelector<HTMLElement>('.artifact-action-unit [role="button"]')!;
		const state = () => ({ unit: outline(panel.element)[0], progress: !!button.querySelector('.codicon-modifier-spin') });
		const states = [state()];
		button.focus();
		button.click();
		button.click();
		await timeout(0);
		states.push(state());
		const manual = f.snapshot.get().runs.at(-1)!;
		f.snapshot.set({ ...f.snapshot.get(), runs: [...f.snapshot.get().runs.slice(0, -1), { ...manual, state: 'completed' }, run('test', 'analyse', 'running', 'automation')] }, undefined);
		states.push(state());
		f.snapshot.set({ ...f.snapshot.get(), runs: f.snapshot.get().runs.map(candidate => ({ ...candidate, state: 'completed' })) }, undefined);
		states.push(state());
		assert.deepStrictEqual({ states, invoked: f.invoked, configured: f.configured, focused: mainWindow.document.activeElement === button }, {
			states: [
				{ unit: ['button: Analyse'], progress: false },
				{ unit: ['button: Analyse (disabled)', 'note: Queued'], progress: true },
				{ unit: ['button: Analyse (disabled)', 'note: Running automatically'], progress: true },
				{ unit: ['button: Analyse'], progress: false },
			],
			invoked: [{ integrationId: 'test', actionId: 'analyse' }],
			configured: [],
			focused: true,
		});
	});

	test('Escape on a details button dismisses the details instead of only blurring the button', async () => {
		const f = fixture();
		const panel = openDetails(f);
		await Promise.resolve();
		const button = panel.element.querySelector<HTMLElement>('.artifact-action-unit [role="button"]')!;
		button.focus();
		const escape = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
		button.dispatchEvent(escape);
		assert.deepStrictEqual({ dismissed: f.dismissed, handled: escape.defaultPrevented, invoked: f.invoked }, { dismissed: [true], handled: true, invoked: [] });
	});

	test('check rows open their resources and never open the artifact itself', async () => {
		const f = checksFixture();
		const panel = openDetails(f, '.artifact-pill-sections [role="button"]');
		await Promise.resolve();
		panel.element.querySelector<HTMLElement>('.artifact-details-item')!.click();
		await timeout(0);
		assert.deepStrictEqual({ openedItems: f.openedItems, resourceOpens: f.counts().resourceOpens }, { openedItems: ['https://example.test/lint'], resourceOpens: 0 });
	});

	test('check rows reject executable resource links', async () => {
		const f = checksFixture();
		f.details.set({ ...f.details.get(), items: [{ ...f.details.get().items[0], resource: 'command:workbench.action.closeWindow' }] }, undefined);
		const panel = openDetails(f, '.artifact-pill-sections [role="button"]');
		await Promise.resolve();
		panel.element.querySelector<HTMLElement>('.artifact-details-item')!.click();
		await timeout(0);
		assert.deepStrictEqual({ openedItems: f.openedItems, errors: f.errors }, {
			openedItems: [], errors: ['The artifact operation failed: This artifact link cannot be opened.'],
		});
	});

	test('an empty registry leaves the existing entry unchanged', () => {
		const f = fixture();
		f.snapshot.set({ ...f.snapshot.get(), contributions: [], mainIntegrationId: undefined }, undefined);
		assert.strictEqual(f.entry.get(), f.base);
	});
});
