/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../../browser/actions/listCommands.js';
import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { derived, observableValue } from '../../../../../../base/common/observable.js';
import { setARIAContainer } from '../../../../../../base/browser/ui/aria/aria.js';
import { IContextMenuDelegate } from '../../../../../../base/browser/contextmenu.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceService } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IListService, ListService } from '../../../../../../platform/list/browser/listService.js';
import { ColorScheme } from '../../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AICustomizationListWidget, getAlwaysVisibleCustomizationGroupKeys, getCollapsedCustomizationGroupKey, getCustomizationItemAriaLabel, getCustomizationSearchAriaLabel, getMultiRootWorkspaceRelativeFilename, getTargetedCreateActionLabel, usesCustomizationTreePresentation } from '../../../browser/aiCustomization/aiCustomizationListWidget.js';
import { AICustomizationItemNormalizer, IAICustomizationListItem, ICustomizationSkillItem } from '../../../browser/aiCustomization/aiCustomizationItemSource.js';
import { IAICustomizationItemsModel } from '../../../browser/aiCustomization/aiCustomizationItemsModel.js';
import { extractExtensionIdFromPath, getCustomizationSecondaryText, splitPathLabel, truncateToFirstLine } from '../../../browser/aiCustomization/aiCustomizationListWidgetUtils.js';
import { AICustomizationManagementSection, AICustomizationScopes, AICustomizationSources, IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, ICustomizationItem, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { createCustomizationCardPrimaryAction, CustomizationCardListController, focusFirstCustomizationTreeItem, getVirtualizedSectionMinimumHeight, layoutVirtualizedSectionList, layoutVirtualizedSections, renderVirtualizedSectionLoadingPlaceholder, setVirtualizedRowActionsTabbable, setupCollapsibleSection, stopListRowActionKeyDownPropagation } from '../../../browser/aiCustomization/customizationCardList.js';
import { getAICustomizationWorkspaceGroupForResource, getAICustomizationWorkspaceGroups } from '../../../browser/aiCustomization/aiCustomizationWorkspaceGroups.js';
import { getCustomizationGroupAriaLabel } from '../../../browser/aiCustomization/customizationGroupHeaderRenderer.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { testIWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';

suite('aiCustomizationListWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses tree presentations for the redesigned customization sections', () => {
		assert.deepStrictEqual({
			agents: usesCustomizationTreePresentation(AICustomizationManagementSection.Agents),
			skills: usesCustomizationTreePresentation(AICustomizationManagementSection.Skills),
			instructions: usesCustomizationTreePresentation(AICustomizationManagementSection.Instructions),
			hooks: usesCustomizationTreePresentation(AICustomizationManagementSection.Hooks),
			prompts: usesCustomizationTreePresentation(AICustomizationManagementSection.Prompts),
		}, {
			agents: true,
			skills: true,
			instructions: true,
			hooks: true,
			prompts: true,
		});
	});

	test('provides section-specific search labels', () => {
		assert.deepStrictEqual([
			getCustomizationSearchAriaLabel(AICustomizationManagementSection.Agents),
			getCustomizationSearchAriaLabel(AICustomizationManagementSection.Skills),
			getCustomizationSearchAriaLabel(AICustomizationManagementSection.Instructions),
			getCustomizationSearchAriaLabel(AICustomizationManagementSection.Hooks),
			getCustomizationSearchAriaLabel(AICustomizationManagementSection.Prompts),
		], [
			'Search agents...',
			'Search skills...',
			'Search instructions...',
			'Search hooks...',
			'Search prompts...',
		]);
	});

	test('group labels include their descriptions', () => {
		assert.strictEqual(
			getCustomizationGroupAriaLabel('User', 2, 'Customizations available across workspaces.'),
			'User, 2 items. Customizations available across workspaces.',
		);
	});

	test('focuses the first item when a customization tree receives focus', () => {
		type Entry = { type: 'group-header' } | { type: 'item'; id: string };
		const group: Entry = { type: 'group-header' };
		const firstItem: Entry = { type: 'item', id: 'first' };
		const secondItem: Entry = { type: 'item', id: 'second' };
		let focus: Entry[] = [];
		const focusChanges: Entry[][] = [];
		const list = {
			getFocus: () => focus,
			setFocus: (entries: Entry[]) => {
				focus = entries;
				focusChanges.push(entries);
			},
		};

		focusFirstCustomizationTreeItem(list, [group, firstItem, secondItem], entry => entry.type === 'item');
		focusFirstCustomizationTreeItem(list, [group, firstItem, secondItem], entry => entry.type === 'item');
		focus = [];
		focusFirstCustomizationTreeItem(list, [group], entry => entry.type === 'item');

		assert.deepStrictEqual(focusChanges, [[firstItem], [group]]);
	});

	test('moves focus that is kept inside a collapsed group to the first visible item', () => {
		type Entry = { type: 'group-header'; id: string } | { type: 'item'; id: string };
		const collapsedGroup: Entry = { type: 'group-header', id: 'user' };
		const hiddenItem: Entry = { type: 'item', id: 'hidden' };
		const expandedGroup: Entry = { type: 'group-header', id: 'workspace' };
		const visibleItem: Entry = { type: 'item', id: 'visible' };
		let focus: Entry[] = [hiddenItem];
		const focusChanges: Entry[][] = [];
		const list = {
			getFocus: () => focus,
			setFocus: (entries: Entry[]) => {
				focus = entries;
				focusChanges.push(entries);
			},
		};
		const isVisible = (entry: Entry) => entry !== hiddenItem;

		focusFirstCustomizationTreeItem(list, [collapsedGroup, hiddenItem, expandedGroup, visibleItem], entry => entry.type === 'item', isVisible);
		focusFirstCustomizationTreeItem(list, [collapsedGroup, hiddenItem, expandedGroup, visibleItem], entry => entry.type === 'item', isVisible);

		assert.deepStrictEqual(focusChanges, [[visibleItem]]);
	});

	test('keeps editable source sections visible until search filtering starts', () => {
		assert.deepStrictEqual({
			agents: getAlwaysVisibleCustomizationGroupKeys(AICustomizationManagementSection.Agents, false),
			skills: getAlwaysVisibleCustomizationGroupKeys(AICustomizationManagementSection.Skills, false),
			instructions: getAlwaysVisibleCustomizationGroupKeys(AICustomizationManagementSection.Instructions, false),
			hooks: getAlwaysVisibleCustomizationGroupKeys(AICustomizationManagementSection.Hooks, false),
			filtered: getAlwaysVisibleCustomizationGroupKeys(AICustomizationManagementSection.Agents, true),
			prompts: getAlwaysVisibleCustomizationGroupKeys(AICustomizationManagementSection.Prompts, false),
		}, {
			agents: [PromptsStorage.local, PromptsStorage.user],
			skills: [PromptsStorage.local, PromptsStorage.user],
			instructions: [PromptsStorage.local, PromptsStorage.user],
			hooks: [PromptsStorage.local, PromptsStorage.user],
			filtered: [],
			prompts: [PromptsStorage.local, PromptsStorage.user],
		});

	});

	test('search filter matches dashed and spaced queries with highlights', () => {
		const items = [
			{ id: '1', uri: URI.file('/skills/typescript-setup/SKILL.md'), name: 'typescript-setup', filename: 'SKILL.md', description: 'Set up TypeScript', promptType: PromptsType.skill, storage: PromptsStorage.local },
			{ id: '2', uri: URI.file('/skills/other/SKILL.md'), name: 'other', filename: 'SKILL.md', description: 'Unrelated', promptType: PromptsType.skill, storage: PromptsStorage.local },
			{
				id: '3', uri: URI.parse('mcp-resource:/skills/review'), name: 'review', filename: 'SKILL.md', promptType: PromptsType.skill, storage: PromptsStorage.user,
				skillBundle: { id: 'server', name: 'TypeScript Setup', description: 'MCP Server', namePrefix: 'server:' }
			},
		] as unknown as IAICustomizationListItem[];
		const filter = (searchQuery: string) => (AICustomizationListWidget.prototype as unknown as {
			applySearchFilter(this: { searchQuery: string; getContributionSource(): undefined }, items: readonly IAICustomizationListItem[]): IAICustomizationListItem[];
		}).applySearchFilter.call({ searchQuery, getContributionSource: () => undefined }, items).map(item => [item.name, item.nameMatches]);

		assert.deepStrictEqual({
			spaced: filter('typescript setup'),
			dashed: filter('typescript-setup'),
			underscored: filter('TypeScript_Setup'),
			mcpSpaced: filter('mcp server'),
			mcpDashed: filter('mcp-server'),
		}, {
			spaced: [['typescript-setup', [{ start: 0, end: 10 }, { start: 11, end: 16 }]], ['review', undefined]],
			dashed: [['typescript-setup', [{ start: 0, end: 16 }]], ['review', undefined]],
			underscored: [['typescript-setup', [{ start: 0, end: 16 }]], ['review', undefined]],
			mcpSpaced: [['review', undefined]],
			mcpDashed: [['review', undefined]],
		});
	});

	test('splits workspace groups only for multi-root workspaces', () => {
		const firstUri = URI.file('/workspace/first');
		const secondUri = URI.file('/workspace/second');
		const createWorkspaceService = (folders: IWorkspaceFolder[]) => new class extends mock<IWorkspaceContextService>() {
			override getWorkspace() {
				return testIWorkspace({ id: 'test', folders });
			}
			override getWorkspaceFolder(resource: URI) {
				return folders.find(folder => resource.path.startsWith(folder.uri.path)) ?? null;
			}
		}();
		const singleRoot = createWorkspaceService([{ uri: firstUri, name: 'First', index: 0, toResource: path => URI.joinPath(firstUri, path) }]);
		const multiRoot = createWorkspaceService([
			{ uri: firstUri, name: 'First', index: 0, toResource: path => URI.joinPath(firstUri, path) },
			{ uri: secondUri, name: 'Second', index: 1, toResource: path => URI.joinPath(secondUri, path) },
		]);

		assert.deepStrictEqual({
			singleRoot: getAICustomizationWorkspaceGroups(singleRoot),
			multiRoot: getAICustomizationWorkspaceGroups(multiRoot).map(group => ({ label: group.label, uri: group.uri.path })),
			secondOwner: getAICustomizationWorkspaceGroupForResource(URI.joinPath(secondUri, '.github/skills/review/SKILL.md'), multiRoot)?.label,
		}, {
			singleRoot: [],
			multiRoot: [
				{ label: 'First', uri: '/workspace/first' },
				{ label: 'Second', uri: '/workspace/second' },
			],
			secondOwner: 'Second',
		});
	});

	test('removes the workspace prefix from paths only in multi-root workspaces', () => {
		const firstUri = URI.file('/workspace/first');
		const secondUri = URI.file('/workspace/second');
		const createWorkspaceService = (folders: IWorkspaceFolder[]) => new class extends mock<IWorkspaceContextService>() {
			override getWorkspace() {
				return testIWorkspace({ id: 'test', folders });
			}
			override getWorkspaceFolder(resource: URI) {
				return folders.find(folder => resource.path.startsWith(folder.uri.path)) ?? null;
			}
		}();
		const firstFolder = { uri: firstUri, name: 'First', index: 0, toResource: (path: string) => URI.joinPath(firstUri, path) };
		const secondFolder = { uri: secondUri, name: 'Second', index: 1, toResource: (path: string) => URI.joinPath(secondUri, path) };
		const item: IAICustomizationListItem = {
			id: 'agents',
			uri: URI.joinPath(firstUri, 'AGENTS.md'),
			name: 'AGENTS.md',
			filename: 'First \u2022 AGENTS.md',
			source: PromptsStorage.local,
			promptType: PromptsType.instructions,
			disabled: false,
		};
		const labelService = new class extends mock<ILabelService>() {
			override getUriLabel(resource: URI, options?: Parameters<ILabelService['getUriLabel']>[1]): string {
				assert.deepStrictEqual(options, { relative: true, noPrefix: true });
				return resource.path.slice(firstUri.path.length + 1);
			}
		}();

		assert.deepStrictEqual({
			singleRoot: getMultiRootWorkspaceRelativeFilename(item, createWorkspaceService([firstFolder]), labelService),
			multiRoot: getMultiRootWorkspaceRelativeFilename(item, createWorkspaceService([firstFolder, secondFolder]), labelService),
		}, {
			singleRoot: 'First \u2022 AGENTS.md',
			multiRoot: 'AGENTS.md',
		});
	});

	test('uses localized compact labels instead of parsing display labels', () => {
		assert.deepStrictEqual([
			getTargetedCreateActionLabel('$(add) Nuevo agente (Espacio de trabajo)', 'Nuevo agente'),
			getTargetedCreateActionLabel('$(add) Create from provider'),
		], [
			'Nuevo agente',
			'Create from provider',
		]);
	});

	test('collapsible sections are expanded by default and only the disclosure toggles them', () => {
		const disposables = store.add(new DisposableStore());
		const heading = document.createElement('div');
		const content = document.createElement('div');
		const headerAction = document.createElement('button');
		heading.appendChild(headerAction);
		const changes: boolean[] = [];
		const toggle = setupCollapsibleSection(heading, content, 'Workspace', disposables, false, collapsed => changes.push(collapsed));

		headerAction.click();
		const initiallyExpanded = {
			expanded: toggle.getAttribute('aria-expanded'),
			controlsContent: toggle.getAttribute('aria-controls') === content.id,
			hidden: content.hidden,
			display: content.style.display,
			changes: [...changes],
		};
		toggle.click();
		const collapsed = {
			expanded: toggle.getAttribute('aria-expanded'),
			label: toggle.getAttribute('aria-label'),
			hidden: content.hidden,
			display: content.style.display,
			changes: [...changes],
		};
		toggle.click();

		assert.deepStrictEqual({
			initiallyExpanded,
			collapsed,
			expandedAgain: {
				expanded: toggle.getAttribute('aria-expanded'),
				label: toggle.getAttribute('aria-label'),
				hidden: content.hidden,
				display: content.style.display,
				changes,
			},
		}, {
			initiallyExpanded: {
				expanded: 'true',
				controlsContent: true,
				hidden: false,
				display: '',
				changes: [],
			},
			collapsed: {
				expanded: 'false',
				label: 'Expand Workspace',
				hidden: true,
				display: 'none',
				changes: [true],
			},
			expandedAgain: {
				expanded: 'true',
				label: 'Collapse Workspace',
				hidden: false,
				display: '',
				changes: [true, false],
			},
		});
	});

	test('collapsible sections create disclosures outside auxiliary document realms', () => {
		const disposables = store.add(new DisposableStore());
		const auxiliaryDocument = document.implementation.createHTMLDocument();
		const heading = auxiliaryDocument.createElement('div');
		const content = auxiliaryDocument.createElement('div');
		Object.defineProperty(auxiliaryDocument, 'createElement', {
			configurable: true,
			value: () => {
				throw new Error('Auxiliary documents must not create workbench controls');
			},
		});

		const toggle = setupCollapsibleSection(heading, content, 'Workspace', disposables, false, () => { });
		assert.deepStrictEqual({
			ownerDocument: toggle.ownerDocument === auxiliaryDocument,
			parent: toggle.parentElement === heading,
			expanded: toggle.getAttribute('aria-expanded'),
		}, {
			ownerDocument: true,
			parent: true,
			expanded: 'true',
		});
	});

	test('collapsed groups are scoped to their customization page', () => {
		assert.deepStrictEqual({
			agents: getCollapsedCustomizationGroupKey(AICustomizationManagementSection.Agents, PromptsStorage.local),
			skills: getCollapsedCustomizationGroupKey(AICustomizationManagementSection.Skills, PromptsStorage.local),
		}, {
			agents: 'agents:local',
			skills: 'skills:local',
		});
	});

	test('a source label replaces the secondary text in accessible labels', () => {
		const item: IAICustomizationListItem = {
			id: 'azure-deploy',
			uri: URI.file('/home/.copilot/plugins/azure/skills/azure-deploy/SKILL.md'),
			name: 'azure-deploy',
			filename: '~/.copilot/plugins/azure/skills/azure-deploy/SKILL.md',
			source: PromptsStorage.plugin,
			promptType: PromptsType.skill,
			disabled: false,
		};
		assert.deepStrictEqual({
			withSource: getCustomizationItemAriaLabel(item, 'Plugin: azure'),
			withoutSource: getCustomizationItemAriaLabel(item),
		}, {
			withSource: 'azure-deploy. Plugin: azure',
			withoutSource: 'azure-deploy. ~/.copilot/plugins/azure/skills/azure-deploy/SKILL.md',
		});
	});

	test('virtualized customization labels include item status', () => {
		const item: IAICustomizationListItem = {
			id: 'prompt',
			uri: URI.file('Q:\\workspace\\.github\\prompts\\review.prompt.md'),
			name: 'review',
			displayName: 'Review',
			filename: '.github\\prompts\\review.prompt.md',
			description: 'Review the current changes',
			source: PromptsStorage.local,
			promptType: PromptsType.prompt,
			disabled: false,
			status: 'degraded',
		};

		assert.strictEqual(getCustomizationItemAriaLabel(item), 'Review. .github\\prompts\\review.prompt.md. Needs attention');
	});

	test('virtualized row actions use a focused-row tab stop and skip disabled controls', () => {
		const actions = document.createElement('div');
		const action = document.createElement('a');
		action.setAttribute('role', 'button');
		const toggle = document.createElement('div');
		toggle.setAttribute('role', 'switch');
		const disabledAction = document.createElement('a');
		disabledAction.setAttribute('role', 'button');
		disabledAction.setAttribute('aria-disabled', 'true');
		actions.append(action, toggle, disabledAction);

		setVirtualizedRowActionsTabbable(actions, true);
		const focused = [action.tabIndex, toggle.tabIndex, disabledAction.tabIndex];
		setVirtualizedRowActionsTabbable(actions, false);

		assert.deepStrictEqual({
			focused,
			unfocused: [action.tabIndex, toggle.tabIndex, disabledAction.tabIndex],
		}, {
			focused: [0, 0, -1],
			unfocused: [-1, -1, -1],
		});
	});

	test('virtualized row actions isolate keyboard activation from the list', () => {
		const row = document.createElement('div');
		const actions = document.createElement('div');
		const action = document.createElement('button');
		actions.appendChild(action);
		row.appendChild(actions);
		const disposable = stopListRowActionKeyDownPropagation(actions);
		const bubbledKeys: string[] = [];
		row.addEventListener('keydown', event => bubbledKeys.push(event.key));
		const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

		store.add(toDisposable(() => disposable.dispose()));
		action.dispatchEvent(enterEvent);
		action.dispatchEvent(escapeEvent);
		assert.deepStrictEqual(
			{ bubbledKeys, enterDefaultPrevented: enterEvent.defaultPrevented, escapeDefaultPrevented: escapeEvent.defaultPrevented },
			{ bubbledKeys: ['Escape'], enterDefaultPrevented: false, escapeDefaultPrevented: false },
		);
	});

	test('virtualized section height is redistributed when a sibling collapses', () => {
		const root = document.createElement('div');
		const createSection = () => {
			const section = document.createElement('section');
			const list = document.createElement('div');
			section.appendChild(list);
			root.appendChild(section);
			Object.defineProperty(list, 'offsetHeight', { configurable: true, get: () => list.hidden ? 0 : Number.parseFloat(list.style.height) || 100 });
			Object.defineProperty(section, 'offsetHeight', { configurable: true, get: () => 40 + list.offsetHeight });
			return list;
		};
		const first = createSection();
		const second = createSection();
		Object.defineProperty(root, 'clientHeight', { configurable: true, value: 300 });

		const expanded = layoutVirtualizedSections(root, [
			{ container: first, contentHeight: 300, minimumHeight: 44 },
			{ container: second, contentHeight: 300, minimumHeight: 44 },
		]);
		first.hidden = true;
		const redistributed = layoutVirtualizedSections(root, [
			{ container: first, contentHeight: 300, minimumHeight: 44 },
			{ container: second, contentHeight: 300, minimumHeight: 44 },
		]);

		assert.deepStrictEqual({ expanded, redistributed }, {
			expanded: [110, 110],
			redistributed: [0, 220],
		});
	});

	test('virtualized sections show up to four rows by default', () => {
		assert.deepStrictEqual({
			fourOfFive: getVirtualizedSectionMinimumHeight([44, 44, 44, 44, 44], height => height),
			allOfThree: getVirtualizedSectionMinimumHeight([44, 66, 44], height => height),
		}, {
			fourOfFive: 176,
			allOfThree: 154,
		});
	});

	test('virtualized sections keep one complete row when the initial height is constrained', () => {
		const root = document.createElement('div');
		const sections = Array.from({ length: 3 }, () => {
			const section = document.createElement('section');
			const list = document.createElement('div');
			section.appendChild(list);
			root.appendChild(section);
			Object.defineProperty(list, 'offsetHeight', { configurable: true, get: () => Number.parseFloat(list.style.height) || 0 });
			Object.defineProperty(section, 'offsetHeight', { configurable: true, get: () => 40 + list.offsetHeight });
			return list;
		});
		Object.defineProperty(root, 'clientHeight', { configurable: true, value: 180 });

		const constrained = layoutVirtualizedSections(root, sections.map(container => ({
			container,
			contentHeight: 300,
			minimumHeight: 44,
		})));

		assert.deepStrictEqual({
			constrained,
			overflow: root.style.overflow,
			reservesPageScrollbarLane: root.classList.contains('virtualized-section-layout-overflow'),
		}, {
			constrained: [44, 44, 44],
			overflow: 'visible',
			reservesPageScrollbarLane: true,
		});
	});

	test('virtualized sections distribute remaining height after reserving complete rows', () => {
		const root = document.createElement('div');
		const sections = [352, 88, 44, 220].map(contentHeight => {
			const section = document.createElement('section');
			const list = document.createElement('div');
			section.appendChild(list);
			root.appendChild(section);
			Object.defineProperty(list, 'offsetHeight', { configurable: true, get: () => Number.parseFloat(list.style.height) || 44 });
			Object.defineProperty(section, 'offsetHeight', { configurable: true, get: () => 40 + list.offsetHeight });
			return { container: list, contentHeight, minimumHeight: 44 };
		});
		Object.defineProperty(root, 'clientHeight', { configurable: true, value: 349 });

		const heights = layoutVirtualizedSections(root, sections);

		assert.deepStrictEqual({
			heights,
			overflow: root.style.overflow,
			reservesPageScrollbarLane: root.classList.contains('virtualized-section-layout-overflow'),
		}, {
			heights: [48, 48, 44, 48],
			overflow: '',
			reservesPageScrollbarLane: false,
		});
	});

	test('loading placeholders and replacement lists keep a stable row height and scroll position', () => {
		const container = document.createElement('div');
		const placeholder = renderVirtualizedSectionLoadingPlaceholder(container, 'Loading customizations...', 44);
		const list = {
			scrollTop: 88,
			layout: (height: number) => {
				assert.strictEqual(height, 44);
				list.scrollTop = 0;
			},
		};

		layoutVirtualizedSectionList(list, container, 44);

		assert.deepStrictEqual({
			placeholderHeight: placeholder.style.height,
			containerHeight: container.style.height,
			scrollTop: list.scrollTop,
		}, {
			placeholderHeight: '44px',
			containerHeight: '44px',
			scrollTop: 88,
		});
	});

	test('collapsed virtualized lists retain their scroll position', () => {
		const container = document.createElement('div');
		let layoutCount = 0;
		const list = {
			scrollTop: 88,
			layout: () => layoutCount++,
		};

		layoutVirtualizedSectionList(list, container, 0);

		assert.deepStrictEqual({
			containerHeight: container.style.height,
			scrollTop: list.scrollTop,
			layoutCount,
		}, {
			containerHeight: '0px',
			scrollTop: 88,
			layoutCount: 0,
		});
	});

	test('card lists use roving focus and expose focused-row actions', async () => {
		const disposables = store.add(new DisposableStore());
		const list = document.createElement('div');
		document.body.appendChild(list);
		const controller = disposables.add(new CustomizationCardListController(list, 'Customizations'));
		const createItem = (label: string) => {
			const row = document.createElement('div');
			const primaryAction = createCustomizationCardPrimaryAction(row, label);
			const action = document.createElement('button');
			row.appendChild(action);
			list.appendChild(row);
			controller.addItem({ row, primaryAction, label, actions: [action], contextMenuAction: action });
			return { row, primaryAction, action };
		};
		const alpha = createItem('Alpha');
		const beta = createItem('Beta');
		const disabledActionRow = document.createElement('div');
		const disabledActionPrimary = createCustomizationCardPrimaryAction(disabledActionRow, 'Disabled Action');
		const disabledAction = document.createElement('button');
		disabledAction.disabled = true;
		const enabledAction = document.createElement('button');
		disabledActionRow.append(disabledAction, enabledAction);
		list.appendChild(disabledActionRow);
		controller.addItem({ row: disabledActionRow, primaryAction: disabledActionPrimary, label: 'Disabled Action', actions: [disabledAction, enabledAction], contextMenuAction: enabledAction });
		const remoteRow = document.createElement('div');
		const remoteAction = document.createElement('button');
		remoteRow.appendChild(remoteAction);
		list.appendChild(remoteRow);
		controller.addItem({ row: remoteRow, primaryAction: remoteRow, label: 'Remote', actions: [remoteAction], contextMenuAction: remoteAction });
		controller.finalize();

		store.add(toDisposable(() => list.remove()));
		alpha.primaryAction.focus();
		alpha.primaryAction.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		beta.primaryAction.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
		beta.action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
		const spaceKeyEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
		beta.primaryAction.dispatchEvent(spaceKeyEvent);
		disabledActionPrimary.focus();
		disabledActionPrimary.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
		const disabledActionTabTarget = document.activeElement;
		beta.primaryAction.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
		enabledAction.tabIndex = 0;
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual({
			listRole: list.getAttribute('role'),
			rowRoles: [alpha.row.getAttribute('role'), beta.row.getAttribute('role'), disabledActionRow.getAttribute('role'), remoteRow.getAttribute('role')],
			positions: [alpha.row.getAttribute('aria-posinset'), beta.row.getAttribute('aria-posinset')],
			remotePosition: remoteRow.getAttribute('aria-posinset'),
			setSizes: [alpha.row.getAttribute('aria-setsize'), beta.row.getAttribute('aria-setsize'), disabledActionRow.getAttribute('aria-setsize'), remoteRow.getAttribute('aria-setsize')],
			tabIndexes: [alpha.primaryAction.tabIndex, beta.primaryAction.tabIndex, remoteRow.tabIndex, alpha.action.tabIndex, beta.action.tabIndex, remoteAction.tabIndex],
			spaceDefaultPrevented: spaceKeyEvent.defaultPrevented,
			disabledActionTabIndexes: [disabledAction.tabIndex, enabledAction.tabIndex],
			disabledActionTabTarget,
			activeElement: document.activeElement,
		}, {
			listRole: 'list',
			rowRoles: ['listitem', 'listitem', 'listitem', 'listitem'],
			positions: ['1', '2'],
			remotePosition: '4',
			setSizes: ['4', '4', '4', '4'],
			tabIndexes: [0, -1, -1, -1, -1, -1],
			spaceDefaultPrevented: false,
			disabledActionTabIndexes: [-1, -1],
			disabledActionTabTarget: enabledAction,
			activeElement: alpha.primaryAction,
		});
	});

	suite('truncateToFirstLine', () => {
		test('keeps first line when text has multiple lines', () => {
			assert.strictEqual(
				truncateToFirstLine('First line\nSecond line'),
				'First line'
			);
		});

		test('returns full text when no newline is present', () => {
			assert.strictEqual(
				truncateToFirstLine('No newline here. Even with sentences.'),
				'No newline here. Even with sentences.'
			);
		});

		test('handles carriage return line endings', () => {
			assert.strictEqual(
				truncateToFirstLine('First line\r\nSecond line'),
				'First line'
			);
		});
	});

	suite('getCustomizationSecondaryText', () => {
		test('keeps hook descriptions intact', () => {
			assert.strictEqual(
				getCustomizationSecondaryText('echo "setup". echo "run".', 'hook.json', PromptsType.hook),
				'echo "setup". echo "run".'
			);
		});

		suite('splitPathLabel', () => {
			test('keeps the filename visible after a path separator', () => {
				assert.deepStrictEqual({
					posix: splitPathLabel('.github/prompts/deeply/nested/review.prompt.md'),
					windows: splitPathLabel('.github\\prompts\\deeply\\nested\\review.prompt.md'),
					filename: splitPathLabel('review.prompt.md'),
				}, {
					posix: {
						prefix: '.github/prompts/deeply/nested',
						suffix: '/review.prompt.md',
						suffixOffset: 29,
					},
					windows: {
						prefix: '.github\\prompts\\deeply\\nested',
						suffix: '\\review.prompt.md',
						suffixOffset: 29,
					},
					filename: {
						prefix: '',
						suffix: 'review.prompt.md',
						suffixOffset: 0,
					},
				});
			});
		});

		test('shows the file location for non-hook customizations', () => {
			assert.strictEqual(
				getCustomizationSecondaryText('Prompt description', '.github/prompts/review.prompt.md', PromptsType.prompt),
				'.github/prompts/review.prompt.md'
			);
		});

		test('falls back to filename when description is missing', () => {
			assert.strictEqual(
				getCustomizationSecondaryText(undefined, 'prompt.md', PromptsType.prompt),
				'prompt.md'
			);
		});
	});

	test('keeps MCP skill invocation names while shortening bundle child labels', () => {
		const normalizer = new AICustomizationItemNormalizer(new class extends mock<ILabelService>() { }(), new class extends mock<IProductService>() { }());
		const skillBundle = { id: 'opaque-server-id', name: 'Skills from Demo', description: 'MCP Server', namePrefix: 'demo:' };
		const items: ICustomizationSkillItem[] = ['demo:review-changes', 'demo:review:changes', 'unprefixed'].map(name => ({
			uri: URI.parse(`mcp-resource:/skills/${name}`), type: PromptsType.skill, name, source: PromptsStorage.plugin, groupKey: PromptsStorage.user,
			extensionId: undefined, pluginUri: undefined, skillBundle,
		}));
		assert.deepStrictEqual(items.map(item => normalizer.normalizeItem(item, PromptsType.skill)).map(item => ({
			name: item.name, displayName: item.displayName, bundle: item.skillBundle,
		})), [
			{ name: 'demo:review-changes', displayName: 'review-changes', bundle: skillBundle },
			{ name: 'demo:review:changes', displayName: 'review:changes', bundle: skillBundle },
			{ name: 'unprefixed', displayName: 'unprefixed', bundle: skillBundle },
		]);
	});

	test('normalizes remote workspace customization locations through the label service', () => {
		const labelService = new class extends mock<ILabelService>() {
			override getUriLabel(resource: URI, options?: Parameters<ILabelService['getUriLabel']>[1]): string {
				return `${options?.relative ? 'relative' : 'absolute'}:${resource.path}`;
			}
		}();
		const normalizer = new AICustomizationItemNormalizer(labelService, new class extends mock<IProductService>() { }());
		const item = normalizer.normalizeItem({
			uri: URI.parse('vscode-remote://ssh-remote+host/workspace/.github/prompts/review.prompt.md'),
			type: PromptsType.prompt,
			name: 'Review',
			source: PromptsStorage.local,
			extensionId: undefined,
			pluginUri: undefined,
		}, PromptsType.prompt);

		assert.strictEqual(item.filename, 'relative:/workspace/.github/prompts/review.prompt.md');
	});

	test('normalizes scope, origin, and delivery independently of storage', () => {
		const labelService = new class extends mock<ILabelService>() {
			override getUriLabel(resource: URI): string { return resource.path; }
		}();
		const productService = new class extends mock<IProductService>() {
			override readonly defaultChatAgent = { chatExtensionId: 'GitHub.copilot-chat' } as IProductService['defaultChatAgent'];
		}();
		const normalizer = new AICustomizationItemNormalizer(labelService, productService);
		const normalize = (item: Partial<ICustomizationItem> & Pick<ICustomizationItem, 'uri' | 'source'>) => {
			const normalized = normalizer.normalizeItem({ type: PromptsType.agent, name: 'Agent', extensionId: undefined, pluginUri: undefined, ...item }, PromptsType.agent);
			return { scope: normalized.scope, origin: normalized.origin, groupKey: normalized.groupKey };
		};

		assert.deepStrictEqual([
			normalize({ uri: URI.file('/workspace/.github/agents/a.agent.md'), source: PromptsStorage.local }),
			normalize({ uri: URI.file('/home/.copilot/agents/a.agent.md'), source: PromptsStorage.user, groupKey: 'remote-client' }),
			normalize({ uri: URI.file('/home/.copilot/plugins/azure/agents/a.agent.md'), source: PromptsStorage.plugin, pluginUri: URI.file('/home/.copilot/plugins/azure'), pluginLabel: 'azure', groupKey: 'remote-host' }),
			normalize({ uri: URI.file('/ext/acme/agents/a.agent.md'), source: PromptsStorage.extension, extensionId: 'acme.tools', extensionLabel: 'Acme Tools' }),
			normalize({ uri: URI.file('/ext/copilot/agents/Plan.agent.md'), source: PromptsStorage.extension, extensionId: 'GitHub.copilot-chat' }),
			normalize({ uri: URI.file('/home/dev/github/vscode/extensions/copilot-chat/agents/Plan.agent.md'), source: PromptsStorage.extension, extensionId: 'GitHub.copilot-chat' }),
			normalize({ uri: URI.file('/home/dev/.config/Code/User/globalStorage/github.copilot-chat/github/contoso/agents/a.agent.md'), source: PromptsStorage.extension, extensionId: 'GitHub.copilot-chat' }),
			normalize({ uri: URI.parse('copilot-builtin:/agents/ask.agent.md'), source: AICustomizationSources.builtin, origin: { kind: 'harness' } }),
			normalize({ uri: URI.file('/host/agents/a.agent.md'), source: PromptsStorage.user, scope: AICustomizationScopes.application }),
		], [
			{ scope: 'workspace', origin: undefined, groupKey: undefined },
			{ scope: 'user', origin: undefined, groupKey: undefined },
			{ scope: 'user', origin: { kind: 'plugin', id: 'plugin:file:///home/.copilot/plugins/azure', label: 'azure' }, groupKey: undefined },
			{ scope: 'user', origin: { kind: 'extension', id: 'extension:acme.tools', label: 'Acme Tools' }, groupKey: undefined },
			{ scope: 'application', origin: { kind: 'vscode', id: 'vscode:' }, groupKey: 'builtin' },
			{ scope: 'application', origin: { kind: 'vscode', id: 'vscode:' }, groupKey: 'builtin' },
			{ scope: 'user', origin: { kind: 'account', id: 'account:contoso', label: 'contoso' }, groupKey: 'builtin' },
			{ scope: 'application', origin: { kind: 'harness', id: 'harness:', label: undefined }, groupKey: 'builtin' },
			{ scope: 'application', origin: { kind: 'vscode', id: 'vscode:' }, groupKey: undefined },
		]);
	});

	suite('extractExtensionIdFromPath', () => {
		test('extracts extension ID from copilot-chat extension path', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-insiders/extensions/github.copilot-chat-0.43.2026040602/assets/prompts/skills/agent-customization/SKILL.md'),
				'github.copilot-chat'
			);
		});

		test('extracts extension ID from PR extension path', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-insiders/extensions/github.vscode-pull-request-github-0.135.2026040604/src/lm/skills/SKILL.md'),
				'github.vscode-pull-request-github'
			);
		});

		test('extracts extension ID from Code OSS dev path', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-oss-dev/extensions/github.copilot-chat-0.43.2026040602/assets/prompts/skills/troubleshoot/SKILL.md'),
				'github.copilot-chat'
			);
		});

		test('extracts extension ID from Windows-style path', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('C:/Users/dev/.vscode/extensions/ms-python.python-2024.1.1/skills/SKILL.md'),
				'ms-python.python'
			);
		});

		test('returns undefined for workspace paths', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/git/vscode/.github/skills/accessibility/SKILL.md'),
				undefined
			);
		});

		test('returns undefined for user home paths', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.copilot/skills/ios-project-setup/SKILL.md'),
				undefined
			);
		});

		test('returns undefined for plugin paths', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-insiders/agent-plugins/github.com/microsoft/vscode-team-kit/model-council/skills/council-review/SKILL.md'),
				undefined
			);
		});

		test('returns undefined for bare extensions folder without version', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/workspace/extensions/my-extension/SKILL.md'),
				undefined
			);
		});

		test('extracts extension ID from User/globalStorage path (Copilot Chat ask agent)', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-oss-dev/User/globalStorage/github.copilot-chat/ask-agent/Ask.agent.md'),
				'github.copilot-chat'
			);
		});

		test('extracts extension ID from User/globalStorage path on Insiders', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/Library/Application Support/Code - Insiders/User/globalStorage/github.copilot-chat/ask-agent/Ask.agent.md'),
				'github.copilot-chat'
			);
		});

		test('returns undefined for non-extension entries in globalStorage', () => {
			// e.g. `state.vscdb` or other workspace storage that lacks a publisher.name pattern
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-oss-dev/User/globalStorage/state.vscdb'),
				undefined
			);
		});
	});

	suite('disposed widget', () => {

		let disposables: DisposableStore;
		let instaService: TestInstantiationService;
		const searchBarHeight = 40;
		const headerHeight = 30;
		const searchBarMargin = 16;
		const setLayoutHeights = (widget: AICustomizationListWidget, clientHeight: number): void => {
			Object.defineProperty(widget.element, 'clientHeight', { configurable: true, value: clientHeight });
			Object.defineProperty(widget.element.querySelector('.list-search-and-button-container')!, 'offsetHeight', { configurable: true, value: searchBarHeight });
			Object.defineProperty(widget.element.querySelector('.section-title-header')!, 'offsetHeight', { configurable: true, value: headerHeight });
			Object.defineProperty(widget.element, 'getBoundingClientRect', { configurable: true, value: () => DOMRect.fromRect({ y: 0 }) });
			Object.defineProperty(widget.element.querySelector('.list-container')!, 'getBoundingClientRect', { configurable: true, value: () => DOMRect.fromRect({ y: headerHeight + searchBarHeight + searchBarMargin }) });
		};

		const descriptor: IHarnessDescriptor = {
			id: 'test',
			label: 'Test',
			icon: Codicon.settingsGear,
			itemProvider: {
				onDidChange: Event.None,
				provideChatSessionCustomizations: (sessionResource: URI, token: CancellationToken) => Promise.resolve(undefined),
			},
		};

		setup(() => {
			disposables = new DisposableStore();
			instaService = workbenchInstantiationService({}, disposables);

			instaService.stub(IPromptsService, {
				onDidChangeCustomAgents: Event.None,
				onDidChangeSlashCommands: Event.None,
				onDidChangeSkills: Event.None,
				onDidChangeHooks: Event.None,
				onDidChangeInstructions: Event.None,
				listPromptFiles: async () => [],
				getCustomAgents: async () => [],
				findAgentSkills: async () => [],
				getHooks: async () => undefined,
				getInstructionFiles: async () => [],
				getDisabledPromptFiles: () => new ResourceSet(),
			});

			instaService.stub(IAICustomizationWorkspaceService, {
				activeProjectRoot: observableValue('test', undefined),
				activeProjectLabel: observableValue('test', undefined),
				getActiveProjectRoot: () => undefined,
				managementSections: [AICustomizationManagementSection.Agents],
				isSessionsWindow: false,
				welcomePageFeatures: { showGettingStartedBanner: false },
				getSkillUIIntegrations: () => new Map(),
				hasOverrideProjectRoot: observableValue('test', false),
				commitFiles: async () => true,
				deleteFiles: async () => true,
				generateCustomization: async () => { },
				setOverrideProjectRoot: () => { },
				clearOverrideProjectRoot: () => { },
			});

			const activeSessionResource = observableValue('test', URI.parse('test:///session'));
			const activeHarness = derived(reader => getChatSessionType(activeSessionResource.read(reader)));

			instaService.stub(ICustomizationHarnessService, {
				activeSessionResource,
				activeHarness,
				availableHarnesses: observableValue('test', [descriptor]),
				setActiveSession: () => { },
				getActiveDescriptor: () => descriptor,
				findHarnessById: (id) => id === descriptor.id ? descriptor : undefined,
				registerExternalHarness: () => ({ dispose() { } }),
			});

			instaService.stub(IAgentPluginService, {
				plugins: observableValue('test', []),
				enablementModel: {
					readEnabled: () => ContributionEnablementState.EnabledProfile,
					readProfileEnabled: () => true,
					setEnabled: () => { },
					remove: () => { },
				},
			});

			instaService.stub(ICommandService, {
				executeCommand: async () => undefined,
				onWillExecuteCommand: Event.None,
				onDidExecuteCommand: Event.None,
			});
			instaService.stub(ICustomizationMarketplaceService, {
				sources: [],
			});

			// The widget reads items from the items model; stub it with empty
			// per-section observables. This avoids needing to wire up the full
			// ProviderCustomizationItemSource pipeline in tests.
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => observableValue('test', [] as readonly never[]),
				getCount: () => observableValue('test', 0),
				getPluginCount: () => observableValue('test', 0),
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: activeSessionResource.get(), dispose() { } }),
			});
		});

		teardown(() => disposables.dispose());

		test('generateDebugReport returns empty string when widget is disposed', async () => {
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			widget.dispose();
			const result = await widget.generateDebugReport();
			assert.strictEqual(result, '');
		});

		test('shared creation actions preserve generation and user creation without a workspace', () => {
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			const events: { type: PromptsType; target: string }[] = [];
			disposables.add(widget.onDidRequestCreateManual(({ type, target }) => events.push({ type, target })));
			const actions = widget.getCreateActions();
			actions.find(action => action.target === 'user')?.run();

			assert.deepStrictEqual({
				actions: actions.map(action => ({ label: action.label, enabled: action.enabled, target: action.target })),
				events,
			}, {
				actions: [
					{ label: 'Generate with AI', enabled: true, target: undefined },
					{ label: 'New Agent (User)', enabled: true, target: 'user' },
				],
				events: [{ type: PromptsType.agent, target: 'user' }],
			});
		});

		test('uses the rendered container height for list layout when available', () => {
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));

			setLayoutHeights(widget, 500);

			widget.layout(900, 320);

			assert.strictEqual(widget.element.querySelector<HTMLElement>('.list-container')!.style.height, '414px');
		});

		test('falls back to supplied layout height when rendered container height is 0', () => {
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));

			setLayoutHeights(widget, 0);

			widget.layout(900, 320);

			assert.strictEqual(widget.element.querySelector<HTMLElement>('.list-container')!.style.height, '814px');
		});

		test('instruction rows use an overflow menu without loaded status or targeting badges', async () => {
			const items = observableValue<readonly IAICustomizationListItem[]>('test', [{
				id: 'instruction',
				uri: URI.file('Q:\\workspace\\.github\\instructions\\typescript.instructions.md'),
				name: 'TypeScript',
				filename: '.github\\instructions\\typescript.instructions.md',
				description: 'TypeScript instructions',
				source: PromptsStorage.local,
				promptType: PromptsType.instructions,
				disabled: false,
				badge: '*.ts',
				status: 'loaded',
			}]);
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => items,
				getCount: () => observableValue('test', 1),
				getPluginCount: () => observableValue('test', 0),
				whenSectionLoaded: async () => { },
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('test:///session'), dispose() { } }),
			});
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));
			setLayoutHeights(widget, 500);

			await widget.setSection(AICustomizationManagementSection.Instructions);
			widget.layout(800, 500);

			const row = widget.element.querySelector('.ai-customization-list-item');
			assert.deepStrictEqual({
				badgeDisplay: row?.querySelector<HTMLElement>('.item-badge')?.style.display,
				statusDisplay: row?.querySelector<HTMLElement>('.item-status-icon')?.style.display,
				hasOverflowAction: !!row?.querySelector('.item-right .codicon-ellipsis'),
				descriptionDisplay: row?.querySelector<HTMLElement>('.item-description')?.style.display,
				secondaryText: row?.querySelector<HTMLElement>('.item-description')?.textContent,
				usesHookSecondaryTextStyling: !row?.querySelector<HTMLElement>('.item-description')?.classList.contains('is-filename'),
			}, {
				badgeDisplay: 'none',
				statusDisplay: 'none',
				hasOverflowAction: true,
				descriptionDisplay: '',
				secondaryText: '.github\\instructions\\typescript.instructions.md',
				usesHookSecondaryTextStyling: true,
			});
		});

		test('hook rows use an overflow menu without loaded status and keep commands separate from recycled path labels', async () => {
			const items = observableValue<readonly IAICustomizationListItem[]>('test', [{
				id: 'prompt',
				uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
				name: 'Review',
				filename: '.github/prompts/review.prompt.md',
				description: 'Review changes',
				source: PromptsStorage.local,
				promptType: PromptsType.prompt,
				disabled: false,
			}]);
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => items,
				getCount: () => observableValue('test', 1),
				getPluginCount: () => observableValue('test', 0),
				whenSectionLoaded: async () => { },
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('test:///session'), dispose() { } }),
			});
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));
			setLayoutHeights(widget, 500);

			await widget.setSection(AICustomizationManagementSection.Prompts);
			items.set([{
				id: 'hook',
				uri: URI.file('/workspace/.github/hooks/hooks.json'),
				name: 'Pre Tool Use',
				filename: '.github/hooks/hooks.json',
				description: 'npm run lint',
				source: PromptsStorage.local,
				promptType: PromptsType.hook,
				disabled: false,
				status: 'loaded',
			}], undefined);
			widget.layout(800, 500);

			const row = widget.element.querySelector('.ai-customization-list-item');
			assert.deepStrictEqual({
				statusDisplay: row?.querySelector<HTMLElement>('.item-status-icon')?.style.display,
				hasOverflowAction: !!row?.querySelector('.item-right .codicon-ellipsis'),
				command: row?.querySelector<HTMLElement>('.item-description > .monaco-highlighted-label')?.textContent,
				commandDisplay: row?.querySelector<HTMLElement>('.item-description > .monaco-highlighted-label')?.style.display,
				pathDisplay: row?.querySelector<HTMLElement>('.item-path')?.style.display,
			}, {
				statusDisplay: 'none',
				hasOverflowAction: true,
				command: 'npm run lint',
				commandDisplay: '',
				pathDisplay: 'none',
			});
		});

		test('keeps the overflow action visible while its context menu is open without moving tree focus', async () => {
			const item: IAICustomizationListItem = {
				id: 'skill',
				uri: URI.file('/workspace/.github/skills/review/SKILL.md'),
				name: 'Review',
				filename: '.github/skills/review/SKILL.md',
				description: 'Review changes',
				source: PromptsStorage.local,
				promptType: PromptsType.skill,
				disabled: false,
			};
			const items = observableValue<readonly IAICustomizationListItem[]>('test', [item]);
			let contextMenuDelegate: IContextMenuDelegate | undefined;
			instaService.stub(IContextMenuService, {
				onDidShowContextMenu: Event.None,
				onDidHideContextMenu: Event.None,
				showContextMenu: delegate => contextMenuDelegate = delegate as IContextMenuDelegate,
			});
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => items,
				getCount: () => observableValue('test', 1),
				getPluginCount: () => observableValue('test', 0),
				whenSectionLoaded: async () => { },
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('test:///session'), dispose() { } }),
			});
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));
			const selections: string[] = [];
			disposables.add(widget.onDidSelectItem(selected => selections.push(selected.id)));
			setLayoutHeights(widget, 500);

			await widget.setSection(AICustomizationManagementSection.Skills);
			widget.layout(800, 500);
			const getRow = () => widget.element.querySelector<HTMLElement>('.ai-customization-list-item')!;
			const initialAction = getRow().querySelector<HTMLElement>('.item-right .action-label')!;
			const initialFocusedRows = widget.element.querySelectorAll('.monaco-list-row.focused').length;
			initialAction.click();
			assert.ok(contextMenuDelegate);
			const openRow = getRow();
			const openAction = openRow.querySelector<HTMLElement>('.item-right .action-label')!;
			const openState = {
				menuOpen: openRow.classList.contains('menu-open'),
				hasPopup: openAction.getAttribute('aria-haspopup'),
				expanded: openAction.getAttribute('aria-expanded'),
				autoSelectItem: contextMenuDelegate.autoSelectItem,
				focusedRows: widget.element.querySelectorAll('.monaco-list-row.focused').length,
			};

			items.set([{ ...item, description: 'Updated review instructions' }], undefined);
			const refreshedRow = getRow();
			const refreshedAction = refreshedRow.querySelector<HTMLElement>('.item-right .action-label')!;
			const refreshedState = {
				menuOpen: refreshedRow.classList.contains('menu-open'),
				expanded: refreshedAction.getAttribute('aria-expanded'),
			};

			contextMenuDelegate.onHide?.(false);
			const closedRow = getRow();
			const closedAction = closedRow.querySelector<HTMLElement>('.item-right .action-label')!;
			assert.deepStrictEqual({
				initialFocusedRows,
				openState,
				refreshedState,
				closedState: {
					menuOpen: closedRow.classList.contains('menu-open'),
					expanded: closedAction.getAttribute('aria-expanded'),
				},
				selections,
			}, {
				initialFocusedRows: 0,
				openState: {
					menuOpen: true,
					hasPopup: 'menu',
					expanded: 'true',
					autoSelectItem: true,
					focusedRows: 0,
				},
				refreshedState: {
					menuOpen: true,
					expanded: 'true',
				},
				closedState: {
					menuOpen: false,
					expanded: 'false',
				},
				selections: [],
			});
		});

		test('shows one aligned icon per item when a marketplace skill has an icon', async () => {
			const marketplaceUri = URI.file('/workspace/.github/skills/marketplace/SKILL.md');
			const plainUri = URI.file('/workspace/.github/skills/plain/SKILL.md');
			const themeChanges = disposables.add(new Emitter<ReturnType<IThemeService['getColorTheme']>>());
			let themeType = ColorScheme.DARK;
			instaService.stub(IThemeService, new class extends mock<IThemeService>() {
				override readonly onDidColorThemeChange = themeChanges.event;
				override getColorTheme() { return { type: themeType } as ReturnType<IThemeService['getColorTheme']>; }
			}());
			const marketplaceItem: IAICustomizationListItem = {
				id: 'marketplace',
				uri: marketplaceUri,
				name: 'Marketplace Skill',
				filename: 'SKILL.md',
				source: PromptsStorage.local,
				promptType: PromptsType.skill,
				disabled: false,
				marketplace: {
					resource: {
						sourceId: 'testSource',
						identifier: 'marketplace',
						displayName: 'Marketplace Skill',
						description: '',
						mediaType: CustomizationMarketplaceMediaType.Skill,
						tags: [],
						capabilities: [],
						representativeQueries: [],
						icon: {
							light: URI.parse('https://example.com/skill-light.png'),
							dark: URI.parse('https://example.com/skill-dark.png'),
						},
					},
					state: { kind: 'installed', target: { kind: 'skill', uri: marketplaceUri } },
				},
			};
			const plainItem: IAICustomizationListItem = {
				id: 'plain',
				uri: plainUri,
				name: 'Plain Skill',
				filename: 'SKILL.md',
				source: PromptsStorage.local,
				promptType: PromptsType.skill,
				disabled: false,
			};
			const items = observableValue<readonly IAICustomizationListItem[]>('test', [marketplaceItem, plainItem]);
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => items,
				getCount: () => observableValue('test', 2),
				getPluginCount: () => observableValue('test', 0),
				whenSectionLoaded: async () => { },
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('test:///session'), dispose() { } }),
			});
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));
			setLayoutHeights(widget, 500);

			await widget.setSection(AICustomizationManagementSection.Skills);
			widget.layout(800, 500);
			const rows = [...widget.element.querySelectorAll<HTMLElement>('.ai-customization-list-item')];
			const withMarketplaceIcon = widget.element.classList.contains('show-item-type-icons');
			const readIconState = () => rows.map(row => {
				const icon = row.querySelector<HTMLElement>('.item-type-icon')!;
				return {
					name: row.querySelector('.item-name')?.textContent,
					image: icon.querySelector<HTMLImageElement>('img')?.src,
					fallbackDisplay: icon.querySelector<HTMLElement>('.codicon')?.style.display,
					visibleChildren: [...icon.children].filter(child => !(child instanceof HTMLElement) || !child.hidden).length,
				};
			});
			const darkIconState = readIconState();
			themeType = ColorScheme.LIGHT;
			themeChanges.fire({ type: themeType } as ReturnType<IThemeService['getColorTheme']>);
			const lightIconState = readIconState();
			items.set([plainItem], undefined);

			assert.deepStrictEqual({
				withMarketplaceIcon,
				darkIconState,
				lightIconState,
				withoutMarketplaceIcon: widget.element.classList.contains('show-item-type-icons'),
			}, {
				withMarketplaceIcon: true,
				darkIconState: [
					{ name: 'Marketplace Skill', image: 'https://example.com/skill-dark.png', fallbackDisplay: 'none', visibleChildren: 1 },
					{ name: 'Plain Skill', image: undefined, fallbackDisplay: '', visibleChildren: 1 },
				],
				lightIconState: [
					{ name: 'Marketplace Skill', image: 'https://example.com/skill-light.png', fallbackDisplay: 'none', visibleChildren: 1 },
					{ name: 'Plain Skill', image: undefined, fallbackDisplay: '', visibleChildren: 1 },
				],
				withoutMarketplaceIcon: false,
			});
		});

		test('expands MCP skill bundles in their source group and keeps children openable', async () => {
			const listService = disposables.add(new ListService());
			instaService.stub(IListService, listService);
			const normalizer = new AICustomizationItemNormalizer(new class extends mock<ILabelService>() { }(), new class extends mock<IProductService>() { }());
			const skillBundle = { id: 'opaque-server-id', name: 'Skills from Demo', description: 'MCP Server', namePrefix: 'demo:' };
			const skills: ICustomizationSkillItem[] = ['review-changes', 'disabled'].map(name => ({
				uri: URI.parse(`mcp-resource:/skills/${name}/SKILL.md`), type: PromptsType.skill, name: `demo:${name}`, source: PromptsStorage.plugin, groupKey: PromptsStorage.user,
				enabled: name !== 'disabled', extensionId: undefined, pluginUri: undefined, skillBundle,
			}));
			const items = observableValue<readonly IAICustomizationListItem[]>('skills', normalizer.normalizeItems(skills, PromptsType.skill));
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => items,
				getCount: () => observableValue('test', 1),
				getPluginCount: () => observableValue('test', 0),
				whenSectionLoaded: async () => { },
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => skills, fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('test:///session'), dispose() { } }),
			});
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));
			const selections: string[] = [];
			disposables.add(widget.onDidSelectItem(item => selections.push(`${item.name} ${item.uri.toString()}`)));
			setLayoutHeights(widget, 500);
			await widget.setSection(AICustomizationManagementSection.Skills);
			widget.layout(800, 500);
			widget.focusList();
			const labels = () => [...widget.element.querySelectorAll('.item-name')].map(element => element.textContent);
			const bundleRow = () => widget.element.querySelector('.item-name')!.closest<HTMLElement>('.monaco-list-row')!;
			const collapsed = {
				labels: labels(),
				group: bundleRow().previousElementSibling?.querySelector('.group-label')?.textContent,
				description: bundleRow().querySelector('.item-description')?.textContent,
				expanded: bundleRow().getAttribute('aria-expanded'),
				level: bundleRow().getAttribute('aria-level'),
			};
			bundleRow().querySelector('.item-name')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
			const expanded = {
				labels: labels(),
				expanded: bundleRow().getAttribute('aria-expanded'),
				disabled: [...widget.element.querySelectorAll('.ai-customization-list-item.disabled .item-name')].map(element => element.textContent),
			};
			widget.element.querySelectorAll('.item-name')[2].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
			widget.refresh();
			const afterRefresh = labels();
			bundleRow().querySelector('.item-name')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
			const list = widget.element.querySelector<HTMLElement>('.monaco-list')!;
			list.focus();
			list.dispatchEvent(new FocusEvent('focus'));
			const activeDescendant = list.getAttribute('aria-activedescendant');
			const focusedRow = activeDescendant ? document.getElementById(activeDescendant) : undefined;
			const keyboardFocus = focusedRow?.querySelector('.item-name')?.textContent;
			// Workbench trees route ArrowRight through keybindings, not their built-in DOM keyboard controller.
			await instaService.invokeFunction(CommandsRegistry.getCommand('list.expand')!.handler);
			assert.deepStrictEqual({ collapsed, expanded, selections, afterRefresh, keyboardFocus, afterKeyboardExpand: labels() }, {
				collapsed: { labels: ['Skills from Demo'], group: 'User', description: 'MCP Server', expanded: 'false', level: '2' },
				expanded: { labels: ['Skills from Demo', 'disabled', 'review-changes'], expanded: 'true', disabled: ['disabled'] },
				selections: ['demo:review-changes mcp-resource:/skills/review-changes/SKILL.md'],
				afterRefresh: ['Skills from Demo', 'disabled', 'review-changes'],
				keyboardFocus: 'Skills from Demo',
				afterKeyboardExpand: ['Skills from Demo', 'disabled', 'review-changes'],
			});
		});

		test('filters MCP skills by bundle identity, expands its source group and clears through search', async () => {
			const listService = disposables.add(new ListService());
			instaService.stub(IListService, listService);
			const normalizer = new AICustomizationItemNormalizer(new class extends mock<ILabelService>() { }(), new class extends mock<IProductService>() { }());
			const skills: ICustomizationSkillItem[] = ['target', 'same-name'].map(id => ({
				uri: URI.parse(`mcp-resource:/skills/${id}/SKILL.md`), type: PromptsType.skill, name: `${id}:review-changes`, source: PromptsStorage.plugin, groupKey: PromptsStorage.user,
				enabled: true, extensionId: undefined, pluginUri: undefined,
				skillBundle: { id, name: 'Skills from test-skills', description: 'MCP Server', namePrefix: `${id}:` },
			}));
			const items = observableValue<readonly IAICustomizationListItem[]>('skills', normalizer.normalizeItems(skills, PromptsType.skill));
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => items,
				getCount: () => observableValue('test', 2),
				getPluginCount: () => observableValue('test', 0),
				whenSectionLoaded: async () => { },
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => skills, fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('test:///session'), dispose() { } }),
			});
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));
			setLayoutHeights(widget, 500);
			await widget.setSection(AICustomizationManagementSection.Skills);
			widget.layout(800, 500);
			const labels = () => [...widget.element.querySelectorAll('.item-name')].map(element => element.textContent);
			const list = widget.element.querySelector<HTMLElement>('.monaco-list')!;
			widget.focusList();
			list.focus();
			list.dispatchEvent(new FocusEvent('focus'));
			await instaService.invokeFunction(CommandsRegistry.getCommand('list.collapse')!.handler);
			await instaService.invokeFunction(CommandsRegistry.getCommand('list.collapse')!.handler);
			const collapsedGroup = labels();
			widget.showSkillBundle('target');
			const filtered = {
				labels: labels(),
				search: widget.element.querySelector<HTMLInputElement>('input')?.value,
				expanded: widget.element.querySelector('.item-name')?.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
				focused: document.getElementById(list.getAttribute('aria-activedescendant')!)?.querySelector('.item-name')?.textContent,
			};
			const selected: string[] = [];
			disposables.add(widget.onDidSelectItem(item => selected.push(item.uri.toString())));
			widget.element.querySelectorAll('.item-name')[1].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
			widget.refresh();
			const afterRefresh = labels();
			widget.setSearchQuery('review changes');
			const afterEditingSearch = labels();
			widget.showSkillBundle('target');
			widget.clearSearch();
			assert.deepStrictEqual({ collapsedGroup, filtered, selected, afterRefresh, afterEditingSearch, cleared: labels() }, {
				collapsedGroup: [],
				filtered: { labels: ['Skills from test-skills', 'review-changes'], search: 'Skills from test-skills', expanded: 'true', focused: 'Skills from test-skills' },
				selected: ['mcp-resource:/skills/target/SKILL.md'],
				afterRefresh: ['Skills from test-skills', 'review-changes'],
				afterEditingSearch: ['Skills from test-skills', 'review-changes', 'Skills from test-skills', 'review-changes'],
				cleared: ['Skills from test-skills', 'Skills from test-skills'],
			});
		});

		test('replaces tree rows when switching customization pages', async () => {
			const agents = observableValue<readonly IAICustomizationListItem[]>('agents', [{
				id: 'agent-one',
				uri: URI.file('/workspace/.github/agents/agent-one.agent.md'),
				name: 'Agent One',
				filename: 'agent-one.agent.md',
				source: PromptsStorage.local,
				promptType: PromptsType.agent,
				disabled: false,
			}]);
			const skills = observableValue<readonly IAICustomizationListItem[]>('skills', [{
				id: 'skill-one',
				uri: URI.file('/workspace/.github/skills/skill-one/SKILL.md'),
				name: 'Skill One',
				filename: 'SKILL.md',
				source: PromptsStorage.local,
				promptType: PromptsType.skill,
				disabled: false,
			}]);
			instaService.stub(IAICustomizationItemsModel, {
				getItems: section => section === AICustomizationManagementSection.Agents ? agents : skills,
				getCount: section => observableValue('test', section === AICustomizationManagementSection.Agents ? agents.get().length : skills.get().length),
				getPluginCount: () => observableValue('test', 0),
				whenSectionLoaded: async () => { },
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('test:///session'), dispose() { } }),
			});
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));
			setLayoutHeights(widget, 500);

			await widget.setSection(AICustomizationManagementSection.Agents);
			widget.layout(800, 500);
			const agentRows = Array.from(widget.element.querySelectorAll('.item-name'), element => element.textContent);

			await widget.setSection(AICustomizationManagementSection.Skills);
			const skillRows = Array.from(widget.element.querySelectorAll('.item-name'), element => element.textContent);

			assert.deepStrictEqual({ agentRows, skillRows }, {
				agentRows: ['Agent One'],
				skillRows: ['Skill One'],
			});
		});

		test('toggles scope groups with a single click on the header', async () => {
			const agents = observableValue<readonly IAICustomizationListItem[]>('agents', [{
				id: 'agent-one',
				uri: URI.file('/workspace/.github/agents/agent-one.agent.md'),
				name: 'Agent One',
				filename: 'agent-one.agent.md',
				source: PromptsStorage.local,
				promptType: PromptsType.agent,
				disabled: false,
			}]);
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => agents,
				getCount: () => observableValue('test', 1),
				getPluginCount: () => observableValue('test', 0),
				whenSectionLoaded: async () => { },
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('test:///session'), dispose() { } }),
			});
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));
			setLayoutHeights(widget, 500);
			await widget.setSection(AICustomizationManagementSection.Agents);
			widget.layout(800, 500);
			const labels = () => Array.from(widget.element.querySelectorAll('.item-name'), element => element.textContent);
			const clickWorkspaceHeader = () => [...widget.element.querySelectorAll('.group-label')]
				.find(element => element.textContent === 'Workspace')!
				.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));

			const initial = labels();
			clickWorkspaceHeader();
			const afterCollapse = labels();
			clickWorkspaceHeader();

			assert.deepStrictEqual({ initial, afterCollapse, afterExpand: labels() }, {
				initial: ['Agent One'],
				afterCollapse: [],
				afterExpand: ['Agent One'],
			});
		});

		test('keeps collapsed groups and focus when the items refresh', async () => {
			const createAgent = (name: string, source: PromptsStorage): IAICustomizationListItem => ({
				id: name,
				uri: URI.file(`/${source}/.github/agents/${name}.agent.md`),
				name,
				filename: `${name}.agent.md`,
				source,
				promptType: PromptsType.agent,
				disabled: false,
			});
			const agents = observableValue<readonly IAICustomizationListItem[]>('agents', [createAgent('local-one', PromptsStorage.local), createAgent('user-one', PromptsStorage.user)]);
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => agents,
				getCount: () => observableValue('test', agents.get().length),
				getPluginCount: () => observableValue('test', 0),
				whenSectionLoaded: async () => { },
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('test:///session'), dispose() { } }),
			});
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));
			setLayoutHeights(widget, 500);
			await widget.setSection(AICustomizationManagementSection.Agents);
			widget.layout(800, 500);
			const labels = () => Array.from(widget.element.querySelectorAll('.item-name'), element => element.textContent);
			const list = widget.element.querySelector<HTMLElement>('.monaco-list')!;
			const focused = () => document.getElementById(list.getAttribute('aria-activedescendant')!)?.querySelector('.item-name')?.textContent;
			[...widget.element.querySelectorAll('.group-label')]
				.find(element => element.textContent === 'User')!
				.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
			widget.focusList();
			const collapsed = { labels: labels(), focused: focused() };

			agents.set([...agents.get(), createAgent('local-two', PromptsStorage.local), createAgent('user-two', PromptsStorage.user)], undefined);
			const afterItemsChange = { labels: labels(), focused: focused() };
			widget.setSearchQuery('one');
			const whileSearching = labels();
			widget.clearSearch();

			assert.deepStrictEqual({ collapsed, afterItemsChange, whileSearching, afterClearingSearch: labels() }, {
				collapsed: { labels: ['local-one'], focused: 'local-one' },
				afterItemsChange: { labels: ['local-one', 'local-two'], focused: 'local-one' },
				whileSearching: ['local-one', 'user-one'],
				afterClearingSearch: ['local-one', 'local-two'],
			});
		});

		test('focuses a visible item when entering a tree whose first group is collapsed', async () => {
			const createAgent = (name: string, source: PromptsStorage): IAICustomizationListItem => ({
				id: name,
				uri: URI.file(`/${source}/.github/agents/${name}.agent.md`),
				name,
				filename: `${name}.agent.md`,
				source,
				promptType: PromptsType.agent,
				disabled: false,
			});
			const agents = observableValue<readonly IAICustomizationListItem[]>('agents', [createAgent('local-one', PromptsStorage.local), createAgent('user-one', PromptsStorage.user)]);
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => agents,
				getCount: () => observableValue('test', agents.get().length),
				getPluginCount: () => observableValue('test', 0),
				whenSectionLoaded: async () => { },
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('test:///session'), dispose() { } }),
			});
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));
			setLayoutHeights(widget, 500);
			await widget.setSection(AICustomizationManagementSection.Agents);
			widget.layout(800, 500);
			const list = widget.element.querySelector<HTMLElement>('.monaco-list')!;
			const focused = () => document.getElementById(list.getAttribute('aria-activedescendant') ?? '')?.querySelector('.item-name, .group-label')?.textContent;
			const clickGroup = (label: string) => [...widget.element.querySelectorAll('.group-label')]
				.find(element => element.textContent === label)!
				.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
			clickGroup('Workspace');
			await widget.setSection(AICustomizationManagementSection.Skills);
			await widget.setSection(AICustomizationManagementSection.Agents);
			list.focus();
			list.dispatchEvent(new FocusEvent('focus'));
			const onTab = focused();
			widget.focusList();
			const onFocusList = focused();
			clickGroup('User');
			await widget.setSection(AICustomizationManagementSection.Skills);
			await widget.setSection(AICustomizationManagementSection.Agents);
			widget.focusList();
			const allCollapsed = focused();

			assert.deepStrictEqual({ onTab, onFocusList, allCollapsed }, {
				onTab: 'user-one',
				onFocusList: 'user-one',
				allCollapsed: 'Workspace',
			});
		});

		test('moves focus to the group header when clearing the search hides the focused item', async () => {
			const createAgent = (name: string, source: PromptsStorage): IAICustomizationListItem => ({
				id: name,
				uri: URI.file(`/${source}/.github/agents/${name}.agent.md`),
				name,
				filename: `${name}.agent.md`,
				source,
				promptType: PromptsType.agent,
				disabled: false,
			});
			const agents = observableValue<readonly IAICustomizationListItem[]>('agents', [createAgent('local-one', PromptsStorage.local), createAgent('user-one', PromptsStorage.user)]);
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => agents,
				getCount: () => observableValue('test', agents.get().length),
				getPluginCount: () => observableValue('test', 0),
				whenSectionLoaded: async () => { },
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('test:///session'), dispose() { } }),
			});
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));
			setLayoutHeights(widget, 500);
			await widget.setSection(AICustomizationManagementSection.Agents);
			widget.layout(800, 500);
			const list = widget.element.querySelector<HTMLElement>('.monaco-list')!;
			const focused = () => document.getElementById(list.getAttribute('aria-activedescendant') ?? '')?.querySelector('.item-name, .group-label')?.textContent;
			[...widget.element.querySelectorAll('.group-label')]
				.find(element => element.textContent === 'User')!
				.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
			widget.setSearchQuery('user-one');
			widget.focusList();
			const whileSearching = focused();
			widget.clearSearch();
			const afterClearingSearch = focused();
			list.dispatchEvent(new FocusEvent('focus'));

			assert.deepStrictEqual({ whileSearching, afterClearingSearch, onTab: focused() }, {
				whileSearching: 'user-one',
				afterClearingSearch: 'User',
				onTab: 'User',
			});
		});

		test('announces updated item count when the model changes after section load', async () => {
			const ariaHost = document.createElement('div');
			document.body.appendChild(ariaHost);
			disposables.add(toDisposable(() => ariaHost.remove()));
			setARIAContainer(ariaHost);

			const createAgent = (index: number): IAICustomizationListItem => ({
				id: `agent-${index}`,
				uri: URI.file(`Q:\\workspace\\.github\\agents\\agent-${index}.agent.md`),
				name: `agent-${index}`,
				filename: `agent-${index}.agent.md`,
				source: PromptsStorage.local,
				promptType: PromptsType.agent,
				disabled: false,
			});
			const items = observableValue<readonly IAICustomizationListItem[]>('test', [
				createAgent(1),
				createAgent(2),
				createAgent(3),
			]);
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => items,
				getCount: () => observableValue('test', items.get().length),
				getPluginCount: () => observableValue('test', 0),
				whenSectionLoaded: async () => { },
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('test:///session'), dispose() { } }),
			});
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));

			await widget.setSection(AICustomizationManagementSection.Agents);
			assert.deepStrictEqual(
				[...ariaHost.querySelectorAll('.monaco-status')].map(element => element.textContent).filter(Boolean),
				['3 agents'],
			);

			items.set([createAgent(1), createAgent(2)], undefined);
			assert.deepStrictEqual(
				[...ariaHost.querySelectorAll('.monaco-status')].map(element => element.textContent).filter(Boolean),
				['2 agents'],
			);
		});

		for (const isSessionsWindow of [false, true]) {
			test(`keyboard-focused skill rows expose validation diagnostics in the ${isSessionsWindow ? 'Agents' : 'editor'} window`, async () => {
				const listService = disposables.add(new ListService());
				instaService.stub(IListService, listService);
				instaService.stub(IAICustomizationWorkspaceService, 'isSessionsWindow', isSessionsWindow);
				const items = observableValue<readonly IAICustomizationListItem[]>('test', [{
					id: 'dreaming',
					uri: URI.file('/workspace/.codex/skills/dreaming/SKILL.md'),
					name: 'dreaming',
					filename: 'SKILL.md',
					source: PromptsStorage.local,
					promptType: PromptsType.skill,
					disabled: true,
					status: 'error',
					statusMessage: 'missing field `description`',
				}]);
				instaService.stub(IAICustomizationItemsModel, {
					getItems: () => items,
					getCount: () => observableValue('test', 1),
					getPluginCount: () => observableValue('test', 0),
					whenSectionLoaded: async () => { },
					getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('agent-host-codex:///session'), dispose() { } }),
				});
				const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
				document.body.appendChild(widget.element);
				disposables.add(toDisposable(() => widget.element.remove()));
				setLayoutHeights(widget, 500);

				await widget.setSection(AICustomizationManagementSection.Skills);
				widget.layout(800, 500);

				const row = widget.element.querySelector<HTMLElement>('.ai-customization-list-item');
				assert(row);
				const list = row.closest<HTMLElement>('.monaco-list');
				assert(list);
				list.focus();
				list.dispatchEvent(new FocusEvent('focus'));
				const focusedList = listService.lastFocusedList;
				assert(focusedList);
				const activeDescendant = list.getAttribute('aria-activedescendant');
				const focusedRow = activeDescendant ? document.getElementById(activeDescendant) : undefined;

				assert.deepStrictEqual({
					hasKeyboardFocus: document.activeElement === list,
					activeDescendant,
					label: focusedRow?.getAttribute('aria-label'),
				}, {
					hasKeyboardFocus: true,
					activeDescendant: focusedRow?.id,
					label: 'dreaming. SKILL.md. Error. missing field `description`, disabled',
				});
			});
		}

		test('async section rerenders update the grouped tree', async () => {
			const items = observableValue<readonly IAICustomizationListItem[]>('test', []);
			let completeLoading!: () => void;
			const loading = new Promise<void>(resolve => completeLoading = resolve);
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => items,
				getCount: () => observableValue('test', 0),
				getPluginCount: () => observableValue('test', 0),
				whenSectionLoaded: () => loading,
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('test:///session'), dispose() { } }),
			});
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));
			setLayoutHeights(widget, 500);

			const setSection = widget.setSection(AICustomizationManagementSection.Skills);
			items.set([
				...Array.from({ length: 4 }, (_, index): IAICustomizationListItem => ({
					id: `workspace-${index}`,
					uri: URI.file(`Q:\\workspace\\.github\\skills\\workspace-${index}\\SKILL.md`),
					name: `Workspace ${index}`,
					filename: 'SKILL.md',
					source: PromptsStorage.local,
					promptType: PromptsType.skill,
					disabled: false,
				})),
				...Array.from({ length: 2 }, (_, index): IAICustomizationListItem => ({
					id: `user-${index}`,
					uri: URI.file(`Q:\\user\\skills\\user-${index}\\SKILL.md`),
					name: `User ${index}`,
					filename: 'SKILL.md',
					source: PromptsStorage.user,
					promptType: PromptsType.skill,
					disabled: false,
				})),
			], undefined);
			completeLoading();
			await setSection;

			widget.layout(500, 800);

			const groups = Array.from(widget.element.querySelectorAll<HTMLElement>('.group-label'), label => label.textContent);
			const rowCount = widget.element.querySelectorAll('.list-container .ai-customization-list-item').length;
			assert.deepStrictEqual({
				groups,
				rowCount,
			}, {
				groups: ['Workspace', 'User'],
				rowCount: 6,
			});
		});

		test('renders contributed customizations as flat rows with source descriptions', async () => {
			const listItem = (id: string, source: IAICustomizationListItem['source'], extra: Partial<IAICustomizationListItem> = {}): IAICustomizationListItem => ({
				id,
				uri: URI.file(`/${id}/SKILL.md`),
				name: id,
				filename: 'SKILL.md',
				source,
				promptType: PromptsType.skill,
				disabled: false,
				...extra,
			});
			const items = observableValue<readonly IAICustomizationListItem[]>('test', [
				listItem('triage', PromptsStorage.user),
				listItem('review', PromptsStorage.user),
				listItem('azure-deploy', PromptsStorage.plugin, { origin: { kind: 'plugin', id: 'plugin:azure', label: 'azure' } }),
				listItem('azure-review', PromptsStorage.plugin, { origin: { kind: 'plugin', id: 'plugin:azure', label: 'azure' } }),
				listItem('workspace-review', PromptsStorage.local),
				listItem('release', AICustomizationSources.extension, { scope: AICustomizationScopes.user, origin: { kind: 'account', id: 'account:contoso', label: 'contoso' } }),
				listItem('acme-lint', AICustomizationSources.extension, { origin: { kind: 'extension', id: 'extension:acme.tools', label: 'Acme Tools' }, extensionId: 'acme.tools' }),
				listItem('init', AICustomizationSources.builtin, { scope: AICustomizationScopes.application, origin: { kind: 'vscode', id: 'vscode:' } }),
				listItem('ask', AICustomizationSources.builtin, { scope: AICustomizationScopes.application, origin: { kind: 'harness', id: 'harness:' } }),
			]);
			instaService.stub(IAICustomizationItemsModel, {
				getItems: () => items,
				getCount: () => observableValue('test', 0),
				getPluginCount: () => observableValue('test', 0),
				whenSectionLoaded: () => Promise.resolve(),
				getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: URI.parse('test:///session'), dispose() { } }),
			});
			const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
			document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));
			setLayoutHeights(widget, 1000);
			await widget.setSection(AICustomizationManagementSection.Skills);
			widget.layout(1000, 800);

			const rows = Array.from(widget.element.querySelectorAll<HTMLElement>('.list-container .monaco-list-row'), row => {
				const group = row.querySelector('.group-label')?.textContent;
				if (group) {
					return `# ${group}`;
				}
				const sourceDescription = row.querySelector('.item-description')?.textContent?.trim();
				return [
					row.querySelector('.item-name')?.textContent,
					...(sourceDescription?.includes(':') ? [`— ${sourceDescription}`] : []),
				].join(' ');
			});
			const ariaLabelFor = (name: string) => Array.from(widget.element.querySelectorAll<HTMLElement>('.list-container .monaco-list-row'))
				.find(row => row.querySelector('.item-name')?.textContent === name)?.getAttribute('aria-label');
			assert.deepStrictEqual({
				rows,
				contributionAriaLabels: [ariaLabelFor('acme-lint'), ariaLabelFor('azure-deploy')],
				sourceLinks: Array.from(widget.element.querySelectorAll<HTMLAnchorElement>('.item-source'))
					.filter(link => !!link.textContent)
					.map(link => ({ text: link.textContent, linked: link.classList.contains('source-link') })),
			}, {
				rows: [
					'# Workspace',
					'workspace-review',
					'# User',
					'review',
					'triage',
					'acme-lint — Extension: Acme Tools',
					'azure-deploy — Plugin: azure',
					'azure-review — Plugin: azure',
					'release — Organization: contoso',
					'# Built-in',
					'init',
					'ask',
				],
				contributionAriaLabels: ['acme-lint. Extension: Acme Tools', 'azure-deploy. Plugin: azure'],
				sourceLinks: [
					{ text: 'Extension: Acme Tools', linked: true },
					{ text: 'Plugin: azure', linked: false },
					{ text: 'Plugin: azure', linked: false },
					{ text: 'Organization: contoso', linked: false },
				],
			});

			widget.setSearchQuery('Acme Tools');
			assert.deepStrictEqual(
				Array.from(widget.element.querySelectorAll('.item-name'), item => item.textContent),
				['acme-lint'],
			);
		});
	});
});
