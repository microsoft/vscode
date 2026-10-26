/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getActiveElement, isHTMLElement } from '../../../../../base/browser/dom.js';
import { IDelayedHoverOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ArtifactContributionSnapshot, ArtifactSnapshot, IArtifactModel } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import '../../../../../platform/theme/common/colors/chartsColors.js';
import { ChatPillsWidget, IChatPillAction, IChatPillEntry } from '../../../../../workbench/browser/chatPills.js';
import { ChatInputPillPins } from '../../../../../workbench/contrib/chat/browser/chatInputPills.js';
import { SessionChatPillKind } from '../../../../../workbench/contrib/chat/common/sessionChatPills.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ArtifactDetailsSelection } from '../../browser/artifactDetailsView.js';
import { ArtifactIntegrationGroup, getArtifactGroupRowActions, getArtifactIntegrationGroupSummary, IArtifactIntegrationGroupMember } from '../../browser/artifactIntegrationGroup.js';
import { ArtifactIntegrationPillSources, getArtifactIntegrationGroupKey, IArtifactIntegrationPillItem, layoutArtifactIntegrationPills } from '../../browser/artifactIntegrationPillSources.js';
import { ArtifactIntegrationPresentation, IArtifactDetailsHost } from '../../browser/artifactIntegrationPresentation.js';

function snapshot(id: string, changes: { readonly group?: { readonly icon: string; readonly color?: string; readonly priority: number }; readonly groupLabel?: string; readonly sections?: readonly { readonly id: string; readonly label: string; readonly icon: string }[]; readonly automation?: boolean } = {}): ArtifactSnapshot {
	const contribution: ArtifactContributionSnapshot = {
		integrationId: 'experiments', label: 'Experiment', ...(changes.groupLabel ? { groupLabel: changes.groupLabel } : {}),
		actions: [{ id: 'analyze', label: 'Analyze', iconId: 'graph', kind: 'prompt' }],
		options: [{ id: 'analyze', kind: 'boolean', label: 'Analyze Automatically', description: 'Analyze when ready.', actionIds: ['analyze'], maxAttempts: 1, defaultValue: false }],
		configuration: { revision: 0, values: { analyze: !!changes.automation }, generations: {}, disablements: {} },
		view: {
			availability: { kind: 'available' },
			main: { icon: { id: 'beaker', colorId: 'charts.green' }, label: `#${id}`, description: `Experiment ${id} is running`, detailsId: 'main' },
			...(changes.group ? { group: { icon: { id: changes.group.icon, colorId: changes.group.color }, priority: changes.group.priority } } : {}),
			sections: (changes.sections ?? []).map(section => ({ id: section.id, label: section.label, icon: { id: section.icon }, description: `${section.label} for ${id}`, detailsId: section.id })),
			stateActions: [], generalActions: [], automationAvailability: [],
		},
	};
	return {
		authority: { id: 'client', targetHost: 'host', location: 'client' }, session: 'session',
		artifact: { id, label: `Recorded ${id}`, resource: `https://experiments.test/${id}`, isArtifact: true },
		contributions: [contribution], mainIntegrationId: 'experiments', runs: [],
	};
}

suite('Artifact Integration Groups', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('groups two or more unpinned artifacts sharing a key where the first appears, and keeps pinned and keyless artifacts single', () => {
		const items = [
			{ id: 'a', groupKey: 'pr' },
			{ id: 'ref' },
			{ id: 'b', groupKey: 'pr' },
			{ id: 'issue', groupKey: 'issue' },
			{ id: 'c', groupKey: 'pr' },
			{ id: 'pinned', groupKey: 'pr' },
		];
		const describe = (pinned: ReadonlySet<string>) => layoutArtifactIntegrationPills(items, item => pinned.has(item.id))
			.map(item => item.kind === 'group' ? `group:${item.items.map(member => member.id).join(',')}` : `${item.pinned ? 'pinned' : 'single'}:${item.item.id}`);
		assert.deepStrictEqual({
			grouped: describe(new Set(['pinned'])),
			pinnedFirst: describe(new Set(['pinned', 'a'])),
			lastPinned: describe(new Set(['pinned', 'a', 'b'])),
			// Pinning never applies to an artifact without a group, such as a reference.
			keyless: describe(new Set(['ref'])),
		}, {
			grouped: ['group:a,b,c', 'single:ref', 'single:issue', 'pinned:pinned'],
			pinnedFirst: ['pinned:a', 'single:ref', 'group:b,c', 'single:issue', 'pinned:pinned'],
			lastPinned: ['pinned:a', 'single:ref', 'pinned:b', 'single:issue', 'single:c', 'pinned:pinned'],
			keyless: ['group:a,b,c,pinned', 'single:ref', 'single:issue'],
		});
	});

	test('only artifacts with a main integration get a group key, which separates pill kinds and integrations', () => {
		assert.deepStrictEqual([
			getArtifactIntegrationGroupKey(SessionChatPillKind.PullRequests, true, 'github.pullRequest'),
			getArtifactIntegrationGroupKey(SessionChatPillKind.Artifacts, true, 'github.pullRequest'),
			getArtifactIntegrationGroupKey(SessionChatPillKind.PullRequests, true, 'other'),
			// A reference keeps its own pill even when an integration presents it.
			getArtifactIntegrationGroupKey(SessionChatPillKind.References, false, 'github.pullRequest'),
			getArtifactIntegrationGroupKey(SessionChatPillKind.Artifacts, true, undefined),
		], [
			JSON.stringify([SessionChatPillKind.PullRequests, 'github.pullRequest']),
			JSON.stringify([SessionChatPillKind.Artifacts, 'github.pullRequest']),
			JSON.stringify([SessionChatPillKind.PullRequests, 'other']),
			undefined,
			undefined,
		]);
	});

	test('offers Open, the entry actions in pill dropdown order with Pin before Remove, and keeps the dropdown open only for membership changes', () => {
		const action = (id: string): IChatPillAction => toAction({ id, label: id, run: () => { } });
		const [copy, changes, pin, remove] = ['copy', 'changes', 'pin', 'remove'].map(action);
		const entry: IChatPillEntry = { id: 'pr', label: 'Pull request', ariaLabel: 'Open Pull Request', toolbarActions: [changes, copy], promotedAction: remove, open: () => { } };
		const describe = (member: Parameters<typeof getArtifactGroupRowActions>[0]) =>
			getArtifactGroupRowActions(member).map(({ action, keepOpen }) => `${action.label}${keepOpen ? ' (stays open)' : ''}`);
		assert.deepStrictEqual({
			full: describe({ entry, pinAction: pin }),
			// Without pinning, such as before a chat is known, and without removal support.
			minimal: describe({ entry: { ...entry, promotedAction: undefined, toolbarActions: [copy] } }),
		}, {
			full: ['Open Pull Request', 'changes', 'copy', 'pin (stays open)', 'remove (stays open)'],
			minimal: ['Open Pull Request', 'copy'],
		});
	});

	test('summarizes a group with the highest-priority icon, the integration group label, and enabled Autopilot rules', () => {
		const summarize = (snapshots: readonly ArtifactSnapshot[]) => {
			const summary = getArtifactIntegrationGroupSummary(snapshots);
			return { icon: `${summary.icon.id}:${summary.icon.color?.id}`, title: summary.title, label: summary.label, automations: summary.enabledAutomations };
		};
		assert.deepStrictEqual({
			ranked: summarize([
				snapshot('1', { groupLabel: 'Experiments', group: { icon: 'git-pull-request', color: 'charts.green', priority: 4 } }),
				snapshot('2', { groupLabel: 'Experiments', group: { icon: 'git-pull-request-error', color: 'charts.orange', priority: 6 }, automation: true }),
				snapshot('3', { groupLabel: 'Experiments', group: { icon: 'git-pull-request-draft', color: 'descriptionForeground', priority: 6 }, automation: true }),
			]),
			fallback: summarize([snapshot('1'), snapshot('2')]),
		}, {
			ranked: { icon: 'git-pull-request-error:charts.orange', title: 'Experiments', label: '3 Experiments', automations: 2 },
			fallback: { icon: 'beaker:charts.green', title: 'Experiment', label: 'Experiment (2)', automations: 0 },
		});
	});

	function fixture() {
		const instantiation = workbenchInstantiationService(undefined, store);
		const host = $('.monaco-workbench');
		host.style.cssText = 'position:fixed;top:0;left:0;width:720px;height:600px;';
		mainWindow.document.body.appendChild(host);
		store.add(toDisposable(() => host.remove()));
		instantiation.stub(ILayoutService, new class extends mock<ILayoutService>() {
			override readonly mainContainer = host;
			override readonly activeContainer = host;
			override readonly onDidLayoutContainer = Event.None;
			override readonly onDidLayoutActiveContainer = Event.None;
			override readonly onDidChangeActiveContainer = Event.None;
			override readonly onDidAddContainer = Event.None;
			override get mainContainerDimension() { return { width: 720, height: 600 }; }
			override get activeContainerDimension() { return this.mainContainerDimension; }
			override readonly activeContainerOffset = { top: 0, quickPickTop: 0 };
			override readonly mainContainerOffset = { top: 0, quickPickTop: 0 };
			override getContainer(): HTMLElement { return host; }
		}());
		instantiation.stub(IContextViewService, store.add(instantiation.createInstance(ContextViewService)));
		const hovers = new Map<HTMLElement, IDelayedHoverOptions | (() => IDelayedHoverOptions)>();
		instantiation.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupDelayedHover(target: HTMLElement, options: IDelayedHoverOptions | (() => IDelayedHoverOptions)) {
				hovers.set(target, options);
				return toDisposable(() => hovers.delete(target));
			}
			override setupManagedHover() {
				return { dispose: () => { }, show: () => { }, hide: () => { }, update: () => { } };
			}
			override hideHover(): void { }
		}());
		const toggles: { readonly id: string; readonly target: string; readonly selection?: ArtifactDetailsSelection }[] = [];
		const selected = observableValue<ArtifactIntegrationPresentation | undefined>('selected', undefined);
		const detailsHost: IArtifactDetailsHost = {
			id: 'details-host', selected,
			toggle: (presentation, target, selection) => {
				toggles.push({ id: presentation.model.snapshot.get().artifact.id, target: target.className.includes('chat-pill-button') ? 'pill' : target.className, ...(selection ? { selection } : {}) });
			},
			release: () => { },
		};
		const ran: string[] = [];
		const action = (id: string, label: string, icon: ThemeIcon): IChatPillAction => toAction({ id, label, class: ThemeIcon.asClassName(icon), run: () => { ran.push(id); } });
		const models = new Map<string, ISettableObservable<ArtifactSnapshot>>();
		const member = (value: ArtifactSnapshot): IArtifactIntegrationGroupMember => {
			const id = value.artifact.id;
			const model = observableValue<ArtifactSnapshot>(id, value);
			models.set(id, model);
			const presentation = store.add(instantiation.createInstance(ArtifactIntegrationPresentation,
				new class extends mock<IArtifactModel>() { override readonly snapshot = model; }(), () => 'chat', detailsHost));
			const entry: IChatPillEntry = {
				id, label: `Title of ${id}`, icon: Codicon.link,
				toolbarActions: [action(`copy.${id}`, `Copy Link ${id}`, Codicon.copy)],
				promotedAction: action(`remove.${id}`, `Remove ${id}`, Codicon.close),
				open: () => { ran.push(`open.${id}`); },
			};
			return { presentation, entry, pinAction: action(`pin.${id}`, `Pin ${id}`, Codicon.pin) };
		};
		const members = observableValue<readonly IArtifactIntegrationGroupMember[]>('members', [
			member(snapshot('1', { groupLabel: 'Experiments', group: { icon: 'git-pull-request', priority: 1 }, sections: [{ id: 'checks', label: '3/5', icon: 'error' }] })),
			member(snapshot('2', { groupLabel: 'Experiments', group: { icon: 'git-pull-request-error', priority: 2 }, automation: true })),
		]);
		const group = store.add(instantiation.createInstance(ArtifactIntegrationGroup, 'experiments', members, detailsHost));
		const widget = store.add(instantiation.createInstance(ChatPillsWidget, { pills: derived(reader => [group.pill]) }, undefined));
		const row = append(host, $('.chat-pills-row'));
		row.style.cssText = 'position:absolute;left:20px;bottom:40px;';
		row.appendChild(widget.element);
		const button = () => widget.element.querySelector<HTMLElement>('.artifact-integration-group-pill > .chat-pill-button')!;
		const dropdown = () => host.querySelector<HTMLElement>('.artifact-group-dropdown');
		const rows = () => [...dropdown()?.querySelectorAll<HTMLElement>('.artifact-group-row') ?? []];
		const describeRow = (row: HTMLElement) => ({
			label: row.querySelector('.artifact-group-row-label')?.textContent,
			title: row.querySelector('.artifact-group-row-title')?.textContent,
			statuses: [...row.querySelectorAll('.artifact-group-row-status')].map(status => status.textContent),
			actions: [...row.querySelectorAll('.artifact-group-row-action')].map(action => action.getAttribute('aria-label')),
		});
		const focused = () => {
			const active = getActiveElement();
			return isHTMLElement(active) ? active.getAttribute('aria-label') ?? active.className : undefined;
		};
		const keyCodes: Record<string, number> = { ArrowDown: 40, ArrowRight: 39, Escape: 27 };
		const key = (target: HTMLElement, code: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: code, code, keyCode: keyCodes[code], bubbles: true, cancelable: true }));
		return { instantiation, detailsHost, members, models, group, button, dropdown, rows, describeRow, focused, key, toggles, ran, selected, member, hovers };
	}

	test('renders the group pill with its summary and an Autopilot section, and lists each artifact like its own pill', () => {
		const f = fixture();
		const pill = f.button().parentElement!;
		const initial = {
			label: pill.querySelector('.chat-pill-label')?.textContent,
			icon: pill.querySelector('.chat-pill-button .codicon')?.className.includes('codicon-git-pull-request-error'),
			ariaLabel: f.button().getAttribute('aria-label'),
			expanded: f.button().getAttribute('aria-expanded'),
			sections: [...pill.querySelectorAll('.artifact-pill-sections .chat-pill-label')].map(label => label.textContent),
		};
		f.button().click();
		const opened = {
			expanded: f.button().getAttribute('aria-expanded'),
			header: f.dropdown()?.querySelector('.artifact-group-header')?.textContent,
			rows: f.rows().map(f.describeRow),
			focused: f.focused(),
		};
		assert.deepStrictEqual({ initial, opened }, {
			initial: { label: '2 Experiments', icon: true, ariaLabel: 'Show 2 Experiments', expanded: 'false', sections: ['1'] },
			opened: {
				expanded: 'true', header: 'Experiments',
				rows: [
					{ label: '#1', title: 'Title of 1', statuses: ['3/5'], actions: ['Open Title of 1', 'Copy Link 1', 'Pin 1', 'Remove 1'] },
					{ label: '#2', title: 'Title of 2', statuses: ['1'], actions: ['Open Title of 2', 'Copy Link 2', 'Pin 2', 'Remove 2'] },
				],
				focused: 'Show artifact details: Experiment 1 is running',
			},
		});
	});

	test('navigates rows and controls with the keyboard, opens details or a status list, and returns focus on Escape', () => {
		const f = fixture();
		f.button().focus();
		f.button().click();
		const dropdown = f.dropdown()!;
		const steps: (string | undefined)[] = [f.focused()];
		f.key(dropdown, 'ArrowDown');
		steps.push(f.focused());
		f.key(dropdown, 'ArrowRight');
		steps.push(f.focused());
		f.key(dropdown, 'ArrowDown');
		steps.push(f.focused());
		f.key(dropdown, 'Escape');
		const escaped = { open: !!f.dropdown(), focusOnPill: getActiveElement() === f.button(), expanded: f.button().getAttribute('aria-expanded') };

		f.button().click();
		f.rows()[1].querySelector<HTMLElement>('.artifact-group-row-title')!.click();
		const afterRow = !!f.dropdown();
		f.button().click();
		f.rows()[0].querySelector<HTMLElement>('.artifact-group-row-status')!.click();
		assert.deepStrictEqual({ steps, escaped, afterRow, open: !!f.dropdown(), toggles: f.toggles }, {
			steps: [
				'Show artifact details: Experiment 1 is running',
				'Show artifact details: Experiment 2 is running',
				'Show Autopilot: 1 enabled',
				'Show artifact details: Experiment 1 is running',
			],
			escaped: { open: false, focusOnPill: true, expanded: 'false' },
			afterRow: false,
			open: false,
			toggles: [{ id: '2', target: 'pill' }, { id: '1', target: 'pill', selection: ['experiments', 'checks'] }],
		});
	});

	test('moves Tab and Shift+Tab through every control, entering another row through its revealed actions', () => {
		const f = fixture();
		f.button().click();
		const dropdown = f.dropdown()!;
		const tab = (shiftKey = false) => dropdown.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, shiftKey, bubbles: true, cancelable: true }));
		const steps: (string | undefined)[] = [f.focused()];
		tab(true);
		steps.push(f.focused());
		tab();
		steps.push(f.focused());
		tab();
		steps.push(f.focused());
		assert.deepStrictEqual({ steps, open: !!f.dropdown() }, {
			steps: ['Show artifact details: Experiment 1 is running', 'Remove 2', 'Show artifact details: Experiment 1 is running', 'Show details: 3/5 for 1'],
			open: true,
		});
	});

	test('runs row actions, keeping the dropdown open for pinning and closing it for open and copy', async () => {
		const f = fixture();
		f.button().click();
		const actions = (index: number) => [...f.rows()[index].querySelectorAll<HTMLElement>('.artifact-group-row-action')];
		actions(0)[2].click();
		const afterPin = !!f.dropdown();
		// The pinned artifact leaves the group while its row has focus; focus moves to a neighbour and the dropdown stays.
		f.members.set([f.members.get()[1], f.member(snapshot('3', { groupLabel: 'Experiments' }))], undefined);
		await timeout(0);
		const updated = { rows: f.rows().map(row => row.querySelector('.artifact-group-row-label')?.textContent), label: f.button().querySelector('.chat-pill-label')?.textContent };
		actions(1)[1].click();
		assert.deepStrictEqual({ afterPin, updated, afterCopy: !!f.dropdown(), ran: f.ran }, {
			afterPin: true, updated: { rows: ['#2', '#3'], label: '2 Experiments' }, afterCopy: false, ran: ['pin.1', 'copy.3'],
		});
	});

	test('closes when focus moves outside the dropdown and its pill, such as through a keyboard shortcut', async () => {
		const f = fixture();
		const outside = mainWindow.document.body.appendChild($<HTMLInputElement>('input'));
		store.add(toDisposable(() => outside.remove()));
		f.button().click();
		// The test window may not have focus, so focus events are delivered explicitly.
		const moveFocus = (from: HTMLElement, to: HTMLElement) => {
			to.focus();
			from.dispatchEvent(new FocusEvent('focusout', { relatedTarget: to, bubbles: true }));
		};
		const [first, second] = f.rows().map(row => row.querySelector<HTMLElement>('.artifact-group-row-main')!);
		moveFocus(first, second);
		await timeout(0);
		const withinDropdown = !!f.dropdown();
		moveFocus(second, outside);
		await timeout(0);
		assert.deepStrictEqual({ withinDropdown, afterLeaving: !!f.dropdown(), expanded: f.button().getAttribute('aria-expanded') }, {
			withinDropdown: true, afterLeaving: false, expanded: 'false',
		});
	});

	test('marks the group pill selected while a member shows its details', () => {
		const f = fixture();
		const pill = f.button().parentElement!;
		const before = pill.classList.contains('artifact-pill-selected');
		f.selected.set(f.members.get()[1].presentation, undefined);
		const during = pill.classList.contains('artifact-pill-selected');
		f.selected.set(undefined, undefined);
		assert.deepStrictEqual({ before, during, after: pill.classList.contains('artifact-pill-selected') }, { before: false, during: true, after: false });
	});

	test('pill sources keep a group pill while its members change, pin through shared storage, and never group references', () => {
		const f = fixture();
		const [one, two, three] = ['1', '2', '3'].map(id => f.member(snapshot(id, { groupLabel: 'Experiments' })));
		const reference = f.member(snapshot('ref'));
		const item = (member: IArtifactIntegrationGroupMember, kind = SessionChatPillKind.Artifacts, isArtifact = true): IArtifactIntegrationPillItem =>
			({ entry: member.entry, presentation: member.presentation, kind, isArtifact, visible: true });
		const items = observableValue<readonly IArtifactIntegrationPillItem[]>('items', [item(one), item(reference, SessionChatPillKind.References, false), item(two), item(three)]);
		const sources = store.add(f.instantiation.createInstance(ArtifactIntegrationPillSources, items, constObservable('chat'), f.detailsHost));
		const pills = derived(reader => sources.sources.read(reader).filter(source => source.isVisible?.read(reader) ?? true).flatMap(source => source.pills.read(reader)));
		store.add(autorun(reader => { pills.read(reader); }));
		const labels = () => pills.get().map(pill => pill.action.label);
		const grouped = labels();
		const groupPill = pills.get()[0];
		items.set(items.get().slice(0, 3), undefined);
		const shrunk = { labels: labels(), samePill: pills.get()[0] === groupPill };
		const pins = store.add(f.instantiation.createInstance(ChatInputPillPins));
		pins.setPinned('chat', SessionChatPillKind.Artifacts, '2', 'Recorded 2', true);
		const pinnedSource = sources.sources.get().find(source => source.pills.get()[0]?.action.label === 'Recorded 2');
		const pinned = { labels: labels(), menu: pinnedSource?.getContextMenuPrimaryActions?.(pinnedSource.pills.get()[0]).map(action => action.id) };
		pins.setPinned('chat', SessionChatPillKind.Artifacts, '2', 'Recorded 2', false);
		assert.deepStrictEqual({ grouped, shrunk, pinned, unpinned: labels() }, {
			grouped: ['3 Experiments', 'Recorded ref'],
			shrunk: { labels: ['2 Experiments', 'Recorded ref'], samePill: true },
			pinned: { labels: ['Recorded 1', 'Recorded ref', 'Recorded 2'], menu: ['chatInputPills.artifacts.unpin.2', 'remove.2'] },
			unpinned: ['2 Experiments', 'Recorded ref'],
		});
	});

	test('updates the summary icon and label as members change state', () => {
		const f = fixture();
		const icon = () => f.button().querySelector('.codicon')?.className.split(' ').find(name => name.startsWith('codicon-') && name !== 'codicon-chevron-down-compact');
		const initial = icon();
		f.models.get('2')!.set(snapshot('2', { groupLabel: 'Experiments', group: { icon: 'git-pull-request-done', priority: 0 } }), undefined);
		assert.deepStrictEqual({ initial, updated: icon(), label: f.button().querySelector('.chat-pill-label')?.textContent }, {
			initial: 'codicon-git-pull-request-error', updated: 'codicon-git-pull-request', label: '2 Experiments',
		});
	});
});
