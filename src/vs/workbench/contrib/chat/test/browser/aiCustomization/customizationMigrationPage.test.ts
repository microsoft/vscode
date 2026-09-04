/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../../base/browser/contextmenu.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ICustomizationMigrationPageCategory, ICustomizationMigrationPageDelegate, SelectableCustomizationMigrationPage } from '../../../browser/aiCustomization/customizationMigrationPage.js';

interface ITestCandidate {
	readonly id: string;
	readonly name: string;
	readonly path: string;
	readonly group: string;
}

interface ITestMigrationSectionList {
	readonly key: string;
	readonly list: {
		layout(height?: number, width?: number): void;
		scrollTop: number;
	};
}

interface ITestableMigrationPage {
	readonly migrationSectionLists: readonly ITestMigrationSectionList[];
}

suite('SelectableCustomizationMigrationPage', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTestPage(options: { readonly activate?: boolean; readonly visible?: boolean; readonly withRowActions?: boolean } = {}) {
		const migrationInProgress = observableValue('migrationInProgress', false);
		const opened: string[] = [];
		const migrated: string[][] = [];
		const actionRuns: string[] = [];
		let harnessLabel = 'Test';
		let retries = 0;
		let menuActions: readonly IAction[] = [];
		let hideMenu: ((didCancel: boolean) => void) | undefined;
		const category: ICustomizationMigrationPageCategory<ITestCandidate> = {
			id: 'test',
			pageTitle: 'Migrate test customizations',
			pageLinkLabel: 'Learn more',
			pageLinkUrl: 'https://example.com',
			pageEmptyMessage: 'No test customizations are available.',
			migrateButtonTooltip: 'Migrate selected test customizations',
			group: candidates => [
				{ key: 'workspace', label: 'Workspace', customizations: candidates.filter(candidate => candidate.group === 'workspace') },
				{ key: 'user', label: 'User', customizations: candidates.filter(candidate => candidate.group === 'user') },
			],
			getPageDescription: (candidates, currentHarnessLabel) => `${candidates.length} test customizations for ${currentHarnessLabel}`,
			getBanner: candidates => candidates.length > 1 ? { message: 'Review these customizations.', consequence: 'Their sources will change.' } : undefined,
			getMigrateButtonLabel: selectedCount => `Migrate ${selectedCount}`,
		};
		const delegate: ICustomizationMigrationPageDelegate<ITestCandidate> = {
			getCandidateKey: candidate => candidate.id,
			getCandidatePresentation: candidate => ({
				name: candidate.name,
				pathLabel: candidate.path,
				selectionAriaLabel: `Select ${candidate.name}`,
				openAriaLabel: `Open ${candidate.name}, ${candidate.path}`,
			}),
			...(options.withRowActions === false ? {} : {
				getCandidateActions: (candidate: ITestCandidate) => [{
					id: 'test.delete',
					label: 'Delete',
					icon: Codicon.trash,
					run: () => { actionRuns.push(candidate.id); },
				}],
				openCandidate: (candidate: ITestCandidate) => { opened.push(candidate.id); },
			}),
			getHarnessLabel: () => harnessLabel,
			getDestinationLabel: () => undefined,
			migrate: candidates => { migrated.push(candidates.map(candidate => candidate.id)); },
			retry: () => { retries++; },
		};
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IOpenerService, { open: async () => true } as unknown as IOpenerService);
		instantiationService.stub(IHoverService, {
			setupManagedHover: () => ({
				dispose() { },
				show() { },
				hide() { },
				update() { },
			}),
		} as unknown as IHoverService);
		instantiationService.stub(IContextMenuService, {
			showContextMenu: (delegate: IContextMenuDelegate) => {
				menuActions = delegate.getActions();
				hideMenu = delegate.onHide;
			},
		} as unknown as IContextMenuService);
		const page = store.add(instantiationService.createInstance(
			SelectableCustomizationMigrationPage,
			category,
			migrationInProgress,
			delegate,
		));
		const container = document.createElement('div');
		document.body.appendChild(container);
		if (options.activate !== false) {
			page.activate(container);
			page.setVisible(options.visible !== false);
		}
		return {
			page,
			container,
			migrationInProgress,
			opened,
			migrated,
			actionRuns,
			getRetries: () => retries,
			getMenuActions: () => menuActions,
			hideMenu: () => hideMenu?.(false),
			setHarnessLabel: (label: string) => harnessLabel = label,
		};
	}

	function disposeTestPage(context: ReturnType<typeof createTestPage>): void {
		context.hideMenu();
		context.page.deactivate();
		context.container.remove();
	}

	function setMigrationListHeight(context: ReturnType<typeof createTestPage>, height: number): void {
		const listContainer = context.container.querySelector<HTMLElement>('.prompt-migration-list')!;
		Object.defineProperty(listContainer, 'clientHeight', { configurable: true, value: height });
		context.page.layout();
	}

	function getSectionLists(context: ReturnType<typeof createTestPage>): readonly ITestMigrationSectionList[] {
		return (context.page as unknown as ITestableMigrationPage).migrationSectionLists;
	}

	test('renders grouped candidates with accessible controls and optional actions', async () => {
		const context = createTestPage();
		const candidate = { id: 'workspace-a', name: 'Workspace A', path: '/workspace/a', group: 'workspace' };
		try {
			context.page.update({
				loading: false,
				candidates: [candidate],
			});
			const openButton = context.container.querySelector<HTMLElement>('.prompt-migration-open-button');
			openButton?.click();
			const moreButton = context.container.querySelector<HTMLElement>('.prompt-migration-more-action');
			moreButton?.click();
			await context.getMenuActions()[0].run();

			assert.deepStrictEqual({
				groupAriaLabel: context.container.querySelector('.prompt-migration-group-checkbox [role="checkbox"]')?.getAttribute('aria-label'),
				itemAriaLabel: context.container.querySelector('.prompt-migration-checkbox [role="checkbox"]')?.getAttribute('aria-label'),
				openAriaLabel: openButton?.getAttribute('aria-label'),
				moreAriaLabel: moreButton?.getAttribute('aria-label'),
				selectedLiveRegion: context.container.querySelector('.prompt-migration-selected-count')?.getAttribute('aria-live'),
				opened: context.opened,
				actionRuns: context.actionRuns,
			}, {
				groupAriaLabel: 'Select all customizations in Workspace',
				itemAriaLabel: 'Select Workspace A',
				openAriaLabel: 'Open Workspace A, /workspace/a',
				moreAriaLabel: 'More actions for Workspace A',
				selectedLiveRegion: 'polite',
				opened: ['workspace-a'],
				actionRuns: ['workspace-a'],
			});
		} finally {
			disposeTestPage(context);
		}
	});

	test('preserves deselection by stable key across candidate updates', () => {
		const context = createTestPage();
		const candidates: ITestCandidate[] = [
			{ id: 'workspace-a', name: 'Workspace A', path: '/workspace/a', group: 'workspace' },
			{ id: 'workspace-b', name: 'Workspace B', path: '/workspace/b', group: 'workspace' },
		];
		try {
			context.page.update({ loading: false, candidates });
			context.container.querySelectorAll<HTMLElement>('.prompt-migration-checkbox [role="checkbox"]')[0].click();
			context.page.update({
				loading: false,
				candidates: candidates.map(candidate => ({ ...candidate })),
			});
			context.container.querySelector<HTMLElement>('.prompt-migration-button')?.click();

			assert.deepStrictEqual({
				itemStates: [...context.container.querySelectorAll<HTMLElement>('.prompt-migration-checkbox [role="checkbox"]')].map(checkbox => checkbox.getAttribute('aria-checked')),
				migrated: context.migrated,
			}, {
				itemStates: ['false', 'true'],
				migrated: [['workspace-b']],
			});
		} finally {
			disposeTestPage(context);
		}
	});

	test('supports update before activation and preserves selection across reactivation', () => {
		const context = createTestPage({ activate: false });
		const candidate = { id: 'workspace-a', name: 'Workspace A', path: '/workspace/a', group: 'workspace' };
		try {
			context.page.update({ loading: false, candidates: [candidate] });
			context.setHarnessLabel('Updated');
			context.page.activate(context.container);
			context.page.setVisible(true);
			const checkbox = context.container.querySelector<HTMLElement>('.prompt-migration-checkbox [role="checkbox"]')!;
			checkbox.click();
			context.page.deactivate();
			context.page.activate(context.container);

			assert.deepStrictEqual({
				description: context.container.querySelector('.section-title-description-text')?.textContent,
				checkedAfterReactivation: context.container.querySelector('.prompt-migration-checkbox [role="checkbox"]')?.getAttribute('aria-checked'),
			}, {
				description: '1 test customizations for Updated',
				checkedAfterReactivation: 'false',
			});
		} finally {
			disposeTestPage(context);
		}
	});

	test('renders static candidate text when the flow provides no row actions', () => {
		const context = createTestPage({ withRowActions: false });
		try {
			context.page.update({
				loading: false,
				candidates: [{ id: 'workspace-a', name: 'Workspace A', path: '/workspace/a', group: 'workspace' }],
			});

			assert.deepStrictEqual({
				itemText: context.container.querySelector('.prompt-migration-item .item-text')?.textContent,
				virtualizedRow: !!context.container.querySelector('.prompt-migration-item')?.closest('.monaco-list-row'),
				openButton: context.container.querySelector('.prompt-migration-open-button'),
				moreButton: context.container.querySelector('.prompt-migration-more-action'),
			}, {
				itemText: 'Workspace A/workspace/a',
				virtualizedRow: true,
				openButton: null,
				moreButton: null,
			});
		} finally {
			disposeTestPage(context);
		}
	});

	test('virtualizes rows and aligns row action tab stops during keyboard traversal', () => {
		const context = createTestPage();
		const candidates = Array.from({ length: 12 }, (_, index): ITestCandidate => ({
			id: `workspace-${index}`,
			name: `Workspace ${index}`,
			path: `/workspace/${index}`,
			group: 'workspace',
		}));
		try {
			context.page.update({ loading: false, candidates });
			setMigrationListHeight(context, 112);
			const renderedRows = [...context.container.querySelectorAll<HTMLElement>('.virtualized-section-list .monaco-list-row')];
			const firstCheckbox = context.container.querySelector<HTMLElement>('.monaco-list-row[data-index="0"] .prompt-migration-checkbox [role="checkbox"]')!;
			firstCheckbox.focus();
			const controlSelector = '[role="checkbox"], .prompt-migration-open-button, .prompt-migration-more-action';
			const firstRowControls = [...context.container.querySelectorAll<HTMLElement>(`.monaco-list-row[data-index="0"] :is(${controlSelector})`)];
			const secondRowControlsBeforeTab = [...context.container.querySelectorAll<HTMLElement>(`.monaco-list-row[data-index="1"] :is(${controlSelector})`)];
			const firstMoreButton = context.container.querySelector<HTMLElement>('.monaco-list-row[data-index="0"] .prompt-migration-more-action')!;
			firstMoreButton.focus();
			const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
			Object.defineProperty(tabEvent, 'keyCode', { get: () => 9 });
			firstMoreButton.dispatchEvent(tabEvent);
			const focusedRowControls = [...context.container.querySelectorAll<HTMLElement>('.monaco-list-row[data-index="1"] :is([role="checkbox"], .prompt-migration-open-button, .prompt-migration-more-action)')];

			assert.deepStrictEqual({
				renderedFewerThanTotal: renderedRows.length < candidates.length,
				firstRowTabStops: firstRowControls.map(control => control.tabIndex),
				secondRowRenderedBeforeTab: secondRowControlsBeforeTab.length,
				focusedRowIndex: document.activeElement?.closest('.monaco-list-row')?.getAttribute('data-index'),
				focusedControlIsCheckbox: document.activeElement?.getAttribute('role'),
				focusedRowTabStops: focusedRowControls.map(control => control.tabIndex),
			}, {
				renderedFewerThanTotal: true,
				firstRowTabStops: [0, 0, 0],
				secondRowRenderedBeforeTab: 0,
				focusedRowIndex: '1',
				focusedControlIsCheckbox: 'checkbox',
				focusedRowTabStops: [0, 0, 0],
			});

		} finally {
			disposeTestPage(context);
		}
	});

	test('defers virtualized list layout while the page is hidden', () => {
		const context = createTestPage({ visible: false });
		const candidates = Array.from({ length: 12 }, (_, index): ITestCandidate => ({
			id: `workspace-${index}`,
			name: `Workspace ${index}`,
			path: `/workspace/${index}`,
			group: 'workspace',
		}));
		try {
			context.page.update({ loading: false, candidates });
			const section = getSectionLists(context)[0];
			const originalLayout = section.list.layout.bind(section.list);
			let layoutCount = 0;
			section.list.layout = (height?: number, width?: number) => {
				layoutCount++;
				originalLayout(height, width);
			};
			context.page.layout();
			const hiddenLayoutCount = layoutCount;
			context.page.setVisible(true);

			assert.deepStrictEqual({
				hiddenLayoutCount,
				visibleLayoutCount: layoutCount,
			}, {
				hiddenLayoutCount: 0,
				visibleLayoutCount: 1,
			});
		} finally {
			disposeTestPage(context);
		}
	});

	test('preserves focused row by stable key across loading and reactivation', () => {
		const context = createTestPage();
		const candidates: ITestCandidate[] = [
			{ id: 'workspace-a', name: 'Workspace A', path: '/workspace/a', group: 'workspace' },
			{ id: 'workspace-b', name: 'Workspace B', path: '/workspace/b', group: 'workspace' },
		];
		try {
			context.page.update({ loading: false, candidates });
			const focusedCheckbox = context.container.querySelectorAll<HTMLElement>('.prompt-migration-checkbox [role="checkbox"]')[1];
			focusedCheckbox.focus();
			context.page.update({ loading: true, candidates });
			context.page.update({ loading: false, candidates: candidates.map(candidate => ({ ...candidate })) });
			context.page.layout();
			const focusAfterLoading = document.activeElement?.getAttribute('aria-label');
			context.page.deactivate();
			context.page.activate(context.container);
			context.page.focus();

			assert.deepStrictEqual({
				focusAfterLoading,
				focusAfterReactivation: document.activeElement?.getAttribute('aria-label'),
			}, {
				focusAfterLoading: 'Select Workspace B',
				focusAfterReactivation: 'Select Workspace B',
			});
		} finally {
			disposeTestPage(context);
		}
	});

	test('keeps collapsed state scoped to the page category across rerender and reactivation', () => {
		const context = createTestPage();
		const candidates = [{ id: 'workspace-a', name: 'Workspace A', path: '/workspace/a', group: 'workspace' }];
		try {
			context.page.update({ loading: false, candidates });
			const collapseButton = context.container.querySelector<HTMLButtonElement>('.prompt-migration-group .customization-section-toggle')!;
			collapseButton.click();
			context.page.layout();
			const collapsedBeforeRefresh = context.container.querySelector<HTMLElement>('.prompt-migration-group-items')!;
			context.page.update({ loading: false, candidates: candidates.map(candidate => ({ ...candidate })) });
			const collapsedAfterRefresh = context.container.querySelector<HTMLElement>('.prompt-migration-group-items')!;
			context.page.deactivate();
			context.page.activate(context.container);
			const collapsedAfterReactivation = context.container.querySelector<HTMLElement>('.prompt-migration-group-items')!;

			assert.deepStrictEqual({
				ariaExpanded: collapseButton.getAttribute('aria-expanded'),
				beforeRefresh: { hidden: collapsedBeforeRefresh.hidden, height: collapsedBeforeRefresh.style.height },
				afterRefresh: collapsedAfterRefresh.hidden,
				afterReactivation: collapsedAfterReactivation.hidden,
			}, {
				ariaExpanded: 'false',
				beforeRefresh: { hidden: true, height: '0px' },
				afterRefresh: true,
				afterReactivation: true,
			});
		} finally {
			disposeTestPage(context);
		}
	});

	test('distributes available layout height across virtualized groups', () => {
		const context = createTestPage();
		const candidates = [
			...Array.from({ length: 6 }, (_, index): ITestCandidate => ({
				id: `workspace-${index}`,
				name: `Workspace ${index}`,
				path: `/workspace/${index}`,
				group: 'workspace',
			})),
			...Array.from({ length: 6 }, (_, index): ITestCandidate => ({
				id: `user-${index}`,
				name: `User ${index}`,
				path: `/user/${index}`,
				group: 'user',
			})),
		];
		try {
			context.page.update({ loading: false, candidates });
			setMigrationListHeight(context, 224);
			const heights = [...context.container.querySelectorAll<HTMLElement>('.virtualized-section-list')]
				.map(element => Number.parseInt(element.style.height, 10));

			assert.deepStrictEqual({
				count: heights.length,
				equalAllocation: new Set(heights).size,
				totalFits: heights.reduce((total, height) => total + height, 0) <= 224,
				atLeastOneRow: heights.every(height => height >= 56),
			}, {
				count: 2,
				equalAllocation: 1,
				totalFits: true,
				atLeastOneRow: true,
			});
		} finally {
			disposeTestPage(context);
		}
	});

	test('preserves section scroll position by stable group key', () => {
		const context = createTestPage();
		const candidates = Array.from({ length: 20 }, (_, index): ITestCandidate => ({
			id: `workspace-${index}`,
			name: `Workspace ${index}`,
			path: `/workspace/${index}`,
			group: 'workspace',
		}));
		try {
			context.page.update({ loading: false, candidates });
			setMigrationListHeight(context, 112);
			const originalSection = getSectionLists(context).find(section => section.key === 'test:workspace')!;
			originalSection.list.scrollTop = 168;
			context.page.update({ loading: false, candidates: candidates.map(candidate => ({ ...candidate })) });
			setMigrationListHeight(context, 112);
			const scrollAfterRefresh = getSectionLists(context).find(section => section.key === 'test:workspace')!.list.scrollTop;
			context.page.deactivate();
			context.page.activate(context.container);
			setMigrationListHeight(context, 112);
			const scrollAfterReactivation = getSectionLists(context).find(section => section.key === 'test:workspace')!.list.scrollTop;

			assert.deepStrictEqual({
				scrollAfterRefresh,
				scrollAfterReactivation,
			}, {
				scrollAfterRefresh: 168,
				scrollAfterReactivation: 168,
			});
		} finally {
			disposeTestPage(context);
		}
	});

	test('uses a virtualized ungrouped list for candidates outside declared groups', () => {
		const context = createTestPage({ withRowActions: false });
		try {
			context.page.update({
				loading: false,
				candidates: [{ id: 'other-a', name: 'Other A', path: '/other/a', group: 'other' }],
			});

			assert.deepStrictEqual({
				groupLists: context.container.querySelectorAll('.prompt-migration-group .virtualized-section-list').length,
				ungroupedRows: context.container.querySelectorAll('.prompt-migration-list > .virtualized-section-list .monaco-list-row').length,
				sectionKeys: getSectionLists(context).map(section => section.key),
			}, {
				groupLists: 0,
				ungroupedRows: 1,
				sectionKeys: ['test:ungrouped'],
			});
		} finally {
			disposeTestPage(context);
		}
	});

	test('keeps group selection and focus in sync', () => {
		const context = createTestPage();
		const candidates: ITestCandidate[] = [
			{ id: 'workspace-a', name: 'Workspace A', path: '/workspace/a', group: 'workspace' },
			{ id: 'workspace-b', name: 'Workspace B', path: '/workspace/b', group: 'workspace' },
		];
		try {
			context.page.update({ loading: false, candidates });
			const groupCheckbox = context.container.querySelector<HTMLElement>('.prompt-migration-group-checkbox [role="checkbox"]')!;
			const itemCheckboxes = [...context.container.querySelectorAll<HTMLElement>('.prompt-migration-checkbox [role="checkbox"]')];
			groupCheckbox.focus();
			groupCheckbox.click();
			const deselected = {
				groupRetainedFocus: document.activeElement === groupCheckbox,
				groupChecked: groupCheckbox.getAttribute('aria-checked'),
				itemStates: itemCheckboxes.map(checkbox => checkbox.getAttribute('aria-checked')),
			};
			itemCheckboxes[0].click();
			const partiallySelected = groupCheckbox.getAttribute('aria-checked');
			itemCheckboxes[1].click();

			assert.deepStrictEqual({
				deselected,
				partiallySelected,
				reselected: groupCheckbox.getAttribute('aria-checked'),
			}, {
				deselected: {
					groupRetainedFocus: true,
					groupChecked: 'false',
					itemStates: ['false', 'false'],
				},
				partiallySelected: 'mixed',
				reselected: 'true',
			});
		} finally {
			disposeTestPage(context);
		}
	});

	test('renders loading, error, and empty states and respects the shared lock', () => {
		const context = createTestPage();
		const candidate = { id: 'workspace-a', name: 'Workspace A', path: '/workspace/a', group: 'workspace' };
		try {
			context.page.update({ loading: true, candidates: [candidate] });
			const loading = context.container.querySelector('.prompt-migration-state')?.textContent;
			context.page.update({ loading: false, loadError: 'expected', candidates: [candidate] });
			const retryButton = context.container.querySelector<HTMLElement>('.prompt-migration-state .monaco-button');
			retryButton?.click();
			const error = context.container.querySelector('.prompt-migration-state')?.textContent;
			context.page.update({ loading: false, candidates: [] });
			const empty = context.container.querySelector('.prompt-migration-empty')?.textContent;
			context.page.update({ loading: false, candidates: [candidate] });
			const migrateButton = context.container.querySelector<HTMLElement>('.prompt-migration-button');
			context.migrationInProgress.set(true, undefined);

			assert.deepStrictEqual({
				loading,
				error,
				retries: context.getRetries(),
				empty,
				migrateDisabledWhileLocked: migrateButton?.classList.contains('disabled'),
			}, {
				loading: 'Loading customizations...Checking the active harness and available destinations.',
				error: 'Customizations could not be loadedCheck the active agent connection, then try again.Retry',
				retries: 1,
				empty: 'No test customizations are available.',
				migrateDisabledWhileLocked: true,
			});
		} finally {
			disposeTestPage(context);
		}
	});
});
