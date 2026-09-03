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
import { ICustomizationMigrationPageCategory, ICustomizationMigrationPageDelegate, SelectableCustomizationMigrationPage } from '../../../browser/aiCustomization/customizationMigrationPage.js';

interface ITestCandidate {
	readonly id: string;
	readonly name: string;
	readonly path: string;
	readonly group: string;
}

suite('SelectableCustomizationMigrationPage', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTestPage(options: { readonly activate?: boolean; readonly withRowActions?: boolean } = {}) {
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
		const page = store.add(new SelectableCustomizationMigrationPage(
			category,
			migrationInProgress,
			delegate,
			{ open: async () => true } as unknown as IOpenerService,
			{
				setupManagedHover: () => ({
					dispose() { },
					show() { },
					hide() { },
					update() { },
				}),
			} as unknown as IHoverService,
			{
				showContextMenu: (delegate: IContextMenuDelegate) => {
					menuActions = delegate.getActions();
					hideMenu = delegate.onHide;
				},
			} as unknown as IContextMenuService,
		));
		const container = document.createElement('div');
		document.body.appendChild(container);
		if (options.activate !== false) {
			page.activate(container);
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
				openButton: context.container.querySelector('.prompt-migration-open-button'),
				moreButton: context.container.querySelector('.prompt-migration-more-action'),
			}, {
				itemText: 'Workspace A/workspace/a',
				openButton: null,
				moreButton: null,
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
