/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as DOM from '../../../../../base/browser/dom.js';
import { setARIAContainer } from '../../../../../base/browser/ui/aria/aria.js';
import { SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { ITreeElement, TreeVisibility } from '../../../../../base/browser/ui/tree/tree.js';
import { Delayer, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IEditorProgressService, IProgressRunner } from '../../../../../platform/progress/common/progress.js';
import { IUserDataSyncEnablementService } from '../../../../../platform/userDataSync/common/userDataSync.js';
import { ExperimentalSettingsService, IExperimentalSettingsService } from '../../../../services/configuration/common/experimentalSettings.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IPreferencesService, ISetting, ISettingsGroup, SettingMatchType } from '../../../../services/preferences/common/preferences.js';
import { Settings2EditorModel } from '../../../../services/preferences/common/preferencesModels.js';
import { IUserDataSyncWorkbenchService } from '../../../../services/userDataSync/common/userDataSync.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { SuggestEnabledInputWithHistory } from '../../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js';
import { ADVANCED_SETTING_TAG, IPreferencesSearchService, POLICY_SETTING_TAG } from '../../common/preferences.js';
import { isSettingsSearchUpToDate, SettingsEditor2 } from '../../browser/settingsEditor2.js';
import { SettingsTree, SettingsTreeFilter, SettingTreeRenderers } from '../../browser/settingsTree.js';
import { parseQuery, SearchResultIdx, SettingsTreeElement, SettingsTreeGroupElement, SettingsTreeModel, SettingsTreeSettingElement } from '../../browser/settingsTreeModels.js';
import { TOCTree, TOCTreeModel } from '../../browser/tocTree.js';
import { SettingsTargetsWidget } from '../../browser/preferencesWidgets.js';

suite('SettingsEditor2', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Access private editor state without widening the production API. */
	suite('ExP assignment refresh', () => {
		function createEditor(query = '@tag:expassigned', advanced = false, settingKeys = ['test.assigned', 'test.unassigned']) {
			const configuration = new class extends TestConfigurationService {
				readonly onDidChangeRestrictedSettings = Event.None;
				isSettingAppliedForAllProfiles(): boolean { return false; }
			}();
			store.add(configuration.onDidChangeConfigurationEmitter);
			const assignments = store.add(new ExperimentalSettingsService());
			const instantiationService = workbenchInstantiationService({ configurationService: () => configuration }, store);
			instantiationService.stub(IPreferencesService, {});
			instantiationService.stub(IPreferencesSearchService, {});
			instantiationService.stub(IUserDataSyncWorkbenchService, {});
			instantiationService.stub(IUserDataSyncEnablementService, {});
			instantiationService.stub(IExtensionManagementService, { onDidInstallExtensions: Event.None, onDidUninstallExtension: Event.None });
			instantiationService.stub(IExtensionGalleryService, { isEnabled: () => false });
			instantiationService.stub(IEditorProgressService, { show: () => new class extends mock<IProgressRunner>() { override done(): void { } }() });
			instantiationService.stub(IExperimentalSettingsService, assignments);

			const editor = store.add(instantiationService.createInstance(class extends SettingsEditor2 {
				override layout(): void { }
				override isVisible(): boolean { return true; }
			}, instantiationService.get(IEditorGroupsService).activeGroup));
			const root = DOM.append(document.body, DOM.$('.settings-editor'));
			store.add(toDisposable(() => root.remove()));
			setARIAContainer(root);
			const count = DOM.append(root, DOM.$('.settings-count'));
			const input = DOM.append(root, DOM.$('input'));
			const splitView = DOM.append(root, DOM.$('.settings-body'));
			const tree = DOM.append(splitView, DOM.$('.settings-tree-container'));
			const onDidRender = store.add(new Emitter<void>());
			let renderedKeys: string[] = [];
			editor['rootElement'] = root;
			editor['countElement'] = count;
			editor['clearFilterLinkContainer'] = DOM.append(root, DOM.$('div'));
			editor['searchWidget'] = new class extends mock<SuggestEnabledInputWithHistory>() {
				override updateAriaLabel(label: string): void { input.setAttribute('aria-label', label); }
			}();
			editor['bodyContainer'] = splitView;
			editor['dimension'] = new DOM.Dimension(900, 600);
			editor['splitView'] = new class extends mock<SplitView<number>>() {
				override readonly el = splitView;
				override layout(): void { }
				override style(): void { }
				override isViewVisible(): boolean { return true; }
				override setViewVisible(): void { }
			}();
			editor['settingsTree'] = new class extends mock<SettingsTree>() {
				override getHTMLElement(): HTMLElement { return tree; }
				override hasElement(): boolean { return true; }
				override rerender(): void { }
				override setChildren(_element: SettingsTreeElement | null, children?: Iterable<ITreeElement<SettingsTreeElement>>): void {
					DOM.clearNode(tree);
					renderedKeys = [];
					const render = (children: Iterable<ITreeElement<SettingsTreeElement>>) => {
						for (const child of children) {
							if (child.element instanceof SettingsTreeSettingElement) {
								const row = DOM.append(tree, DOM.$('.setting-item-contents', { 'data-key': child.element.setting.key }));
								DOM.append(row, DOM.$('input'));
								renderedKeys.push(child.element.setting.key);
							} else if (child.children) {
								render(child.children);
							}
						}
					};
					render(children ?? []);
					onDidRender.fire();
				}
			}();
			editor['settingRenderers'] = new class extends mock<SettingTreeRenderers>() {
				override getSettingDOMElementForDOMElement(element: HTMLElement): HTMLElement | null {
					return element.closest('.setting-item-contents');
				}
				override getDOMElementsForSettingKey(): NodeListOf<HTMLElement> {
					return tree.querySelectorAll('.setting-item-contents');
				}
			}();
			editor['tocTree'] = new class extends mock<TOCTree>() {
				override setChildren(): void { }
				override collapseAll(): void { }
				override expandAll(): void { }
				override setFocus(): void { }
				override setSelection(): void { }
			}();
			editor['settingsTargetsWidget'] = new class extends mock<SettingsTargetsWidget>() {
				override updateLanguageFilterIndicators(): void { }
			}();

			const settings = settingKeys.map(key => new class extends mock<ISetting>() {
				override key = key;
				override type = 'boolean';
				override description = ['Example setting'];
				override scope = ConfigurationScope.RESOURCE;
				override tags = advanced ? [ADVANCED_SETTING_TAG] : [];
			}());
			editor['defaultSettingsEditorModel'] = new class extends mock<Settings2EditorModel>() {
				override get settingsGroups(): ISettingsGroup[] {
					return [
						new class extends mock<ISettingsGroup>() { override sections = []; }(),
						new class extends mock<ISettingsGroup>() { override sections = [{ settings }]; }(),
					];
				}
			}();
			const viewState = editor['viewState'];
			viewState.query = query;
			viewState.tagFilters = new Set(parseQuery(query).tags);
			const settingsModel = instantiationService.createInstance(SettingsTreeModel, viewState, true);
			editor['settingsTreeModel'].value = settingsModel;
			settingsModel.update({ id: 'root', label: 'Test', settings });
			const tocModel = instantiationService.createInstance(TOCTreeModel, viewState);
			editor['tocTreeModel'] = tocModel;
			tocModel.settingsTreeRoot = settingsModel.root;
			editor['searchResultModel'] = editor['createFilterModel']();
			const searchModel = editor['searchResultModel']!;
			tocModel.currentSearchModel = searchModel;
			editor['renderResultCountMessages'](false);
			editor['refreshTree']();
			const rebuild = sinon.spy(searchModel, 'updateChildren');
			const read = () => ({
				count: count.innerText,
				noResults: root.classList.contains('no-results'),
				visibility: splitView.style.visibility,
				inputLabel: input.getAttribute('aria-label'),
				announcement: [...root.querySelectorAll('.monaco-status')].map(element => element.textContent).join(''),
				tocCount: settingsModel.root.count,
				renderedKeys,
			});
			const changeConfiguration = (key: string) => configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override readonly affectedKeys = new Set([key]);
				override readonly source = ConfigurationTarget.USER;
				override affectsConfiguration(section: string): boolean { return section === key; }
			}());
			return { editor, assignments, searchModel, settings, rebuild, read, tree, settingsModel, treeFilter: instantiationService.createInstance(SettingsTreeFilter, viewState, false), searchInput: input, viewState, changeConfiguration, onDidRender: onDidRender.event, contextViewService: instantiationService.get(IContextViewService) };
		}

		test('configuration changes do not rebuild assignment-filtered results', async () => {
			const { assignments, changeConfiguration, rebuild, searchModel } = createEditor();
			assignments.setAssignment('test.assigned', true);
			await timeout(0);
			rebuild.resetHistory();
			const before = searchModel.root.children[0];
			changeConfiguration('test.assigned');
			changeConfiguration('editor.fontSize');
			assert.deepStrictEqual({ rebuilds: rebuild.callCount, sameRow: searchModel.root.children[0] === before }, { rebuilds: 0, sameRow: true });
		});

		test('assignment changes refresh counts, empty state and ARIA when no setting is focused', async () => {
			const { assignments, read } = createEditor();
			const initial = read();
			assignments.setAssignment('test.assigned', true);
			await timeout(0);
			const assigned = read();
			assignments.setAssignment('test.assigned', false);
			await timeout(0);
			assert.deepStrictEqual({ initial, assigned, removed: read() }, {
				initial: { count: 'No Settings Found', noResults: true, visibility: 'hidden', inputLabel: 'Search settings. No Settings Found', announcement: 'No Settings Found', tocCount: 0, renderedKeys: [] },
				assigned: { count: '1 Setting Found', noResults: false, visibility: 'visible', inputLabel: 'Search settings. 1 Setting Found', announcement: '1 Setting Found', tocCount: 1, renderedKeys: ['test.assigned'] },
				removed: { count: 'No Settings Found', noResults: true, visibility: 'hidden', inputLabel: 'Search settings. No Settings Found', announcement: 'No Settings Found', tocCount: 0, renderedKeys: [] },
			});
		});

		for (const changedKey of ['test.assigned', 'test.unassigned']) {
			test(`defers assignment refresh for ${changedKey} until the focused setting loses focus`, async () => {
				const { assignments, read, tree, searchInput, searchModel, rebuild, changeConfiguration, onDidRender } = createEditor();
				assignments.setAssignment('test.assigned', true);
				await timeout(0);
				rebuild.resetHistory();
				const before = read();
				const row = searchModel.root.children[0];
				const input = tree.querySelector('input')!;
				input.focus();
				const assigned = changedKey === 'test.unassigned';
				assignments.setAssignment(changedKey, assigned);
				assignments.setAssignment(changedKey, !assigned);
				assignments.setAssignment(changedKey, assigned);
				await timeout(0);
				changeConfiguration('editor.fontSize');
				const during = {
					state: read(),
					focused: document.activeElement === input,
					sameRow: searchModel.root.children[0] === row,
					rebuilds: rebuild.callCount,
				};
				const rendered = Event.toPromise(onDidRender, store.add(new DisposableStore()));
				searchInput.focus();
				// Hidden test windows change activeElement without dispatching native blur events.
				input.dispatchEvent(new FocusEvent('blur', { relatedTarget: searchInput }));
				await rendered;

				assert.deepStrictEqual({ during, after: read(), rebuilds: rebuild.callCount, searchFocused: document.activeElement === searchInput }, {
					during: { state: before, focused: true, sameRow: true, rebuilds: 0 },
					after: assigned
						? { count: '2 Settings Found', noResults: false, visibility: 'visible', inputLabel: 'Search settings. 2 Settings Found', announcement: '2 Settings Found', tocCount: 2, renderedKeys: ['test.assigned', 'test.unassigned'] }
						: { count: 'No Settings Found', noResults: true, visibility: 'hidden', inputLabel: 'Search settings. No Settings Found', announcement: 'No Settings Found', tocCount: 0, renderedKeys: [] },
					rebuilds: 1,
					searchFocused: true,
				});
			});
		}

		test('defers assignment refresh while a context menu is focused', async () => {
			const { assignments, read, searchInput, rebuild, onDidRender, contextViewService } = createEditor();
			assignments.setAssignment('test.assigned', true);
			await timeout(0);
			rebuild.resetHistory();
			const before = read();
			const menuItem = DOM.$('button');
			contextViewService.showContextView({
				getAnchor: () => searchInput,
				render: container => {
					DOM.append(container, menuItem);
					return toDisposable(() => menuItem.remove());
				},
			}, document.body);
			store.add(toDisposable(() => contextViewService.hideContextView()));
			menuItem.focus();
			assignments.setAssignment('test.assigned', false);
			await timeout(0);
			const during = { state: read(), focused: document.activeElement === menuItem, rebuilds: rebuild.callCount };
			const rendered = Event.toPromise(onDidRender, store.add(new DisposableStore()));
			searchInput.focus();
			menuItem.dispatchEvent(new FocusEvent('blur', { relatedTarget: searchInput }));
			await rendered;

			assert.deepStrictEqual({ during, after: read(), rebuilds: rebuild.callCount }, {
				during: { state: before, focused: true, rebuilds: 0 },
				after: { count: 'No Settings Found', noResults: true, visibility: 'hidden', inputLabel: 'Search settings. No Settings Found', announcement: 'No Settings Found', tocCount: 0, renderedKeys: [] },
				rebuilds: 1,
			});
		});

		test('assignment changes do not rebuild when the assignment filter is inactive', async () => {
			const { assignments, rebuild } = createEditor('@modified');
			assignments.setAssignment('test.assigned', true);
			await timeout(0);
			assert.strictEqual(rebuild.callCount, 0);
		});

		test('batches sequential assignment resolutions into one editor rebuild', async () => {
			const { assignments, rebuild, read } = createEditor();
			for (const key of ['test.assigned', 'test.unassigned']) {
				await Promise.resolve();
				assignments.setAssignment(key, true);
			}
			const beforeFlush = rebuild.callCount;
			await timeout(0);
			assert.deepStrictEqual({ beforeFlush, rebuilds: rebuild.callCount, keys: read().renderedKeys, count: read().count },
				{ beforeFlush: 0, rebuilds: 1, keys: ['test.assigned', 'test.unassigned'], count: '2 Settings Found' });
		});

		test('advanced assigned settings survive editor filtering while unassigned settings do not', async () => {
			const { assignments, searchModel, read } = createEditor('@tag:expassigned', true);
			assignments.setAssignment('test.assigned', true);
			await timeout(0);
			assert.deepStrictEqual({
				keys: searchModel.root.children.map(element => {
					assert.ok(element instanceof SettingsTreeSettingElement);
					return element.setting.key;
				}),
				count: read().count,
			}, { keys: ['test.assigned'], count: '1 Setting Found' });
		});

		test('assignment filter includes advanced settings in the resolved TOC and category filtering', async () => {
			const settingKey = 'chat.detectParticipant.enabled';
			const { editor, assignments, settingsModel, viewState, treeFilter } = createEditor('', true, [settingKey, 'chat.detectParticipant.unassigned']);
			await editor['onConfigUpdate']();
			const hiddenInitially = !settingsModel.getElementsByName(settingKey)?.length;
			assignments.setAssignment(settingKey, true);
			await timeout(0);

			const changeQuery = async (query: string) => {
				viewState.query = query;
				await editor['triggerSearch'](query, true);
			};
			await changeQuery('@tag:expassigned');
			const searchModel = editor['searchResultModel']!;
			const assigned = searchModel.root.children[0];
			assert.ok(assigned instanceof SettingsTreeSettingElement);
			const chat = settingsModel.root.children.find((child): child is SettingsTreeGroupElement => child instanceof SettingsTreeGroupElement && child.id === 'chat');
			const context = chat?.children.find((child): child is SettingsTreeGroupElement => child instanceof SettingsTreeGroupElement && child.id === 'chat/context');
			const categoryVisible = context ? treeFilter.filter(context, TreeVisibility.Visible) : false;
			viewState.categoryFilter = context ?? settingsModel.root;
			const categoryContainsAssignment = treeFilter.filter(assigned, TreeVisibility.Visible);
			const active = {
				inRoot: !!settingsModel.getElementsByName(settingKey)?.length,
				resultCount: searchModel.getUniqueResultsCount(),
				rootCount: settingsModel.root.count,
				categoryCount: context?.count,
				categoryVisible,
				categoryContainsAssignment,
			};
			viewState.categoryFilter = undefined;
			await changeQuery('');
			const hiddenAfterRemovingFilter = !settingsModel.getElementsByName(settingKey)?.length;
			await changeQuery('@tag:expassigned');
			const restored = !!settingsModel.getElementsByName(settingKey)?.length;

			assert.deepStrictEqual({ hiddenInitially, active, hiddenAfterRemovingFilter, restored }, {
				hiddenInitially: true,
				active: { inRoot: true, resultCount: 1, rootCount: 1, categoryCount: 1, categoryVisible: true, categoryContainsAssignment: true },
				hiddenAfterRemovingFilter: true,
				restored: true,
			});
		});

		test('advanced assignment exemption applies to text search and preserves policy filtering', async () => {
			const { editor, assignments, settings, viewState } = createEditor('@tag:expassigned example', true);
			assignments.setAssignment('test.assigned', true);
			await timeout(0);
			await editor['searchWithProvider'](SearchResultIdx.Local, {
				searchModel: async () => ({
					filterMatches: settings.map(setting => ({ setting, matches: [], matchType: SettingMatchType.DescriptionOrValueMatch, keyMatchScore: 0, score: 1 })),
					exactMatch: false,
				}),
			}, 'test', CancellationToken.None);
			const assignedKeys = editor['searchResultModel']!.root.children.map(element => {
				assert.ok(element instanceof SettingsTreeSettingElement);
				return element.setting.key;
			});
			viewState.query = '';
			viewState.tagFilters = new Set();
			const hiddenNormally = !editor['shouldShowSetting'](settings[0]);
			viewState.tagFilters.add(POLICY_SETTING_TAG);
			assert.deepStrictEqual({ assignedKeys, hiddenNormally, policyVisible: editor['shouldShowSetting'](settings[0]) }, {
				assignedKeys: ['test.assigned'], hiddenNormally: true, policyVisible: true,
			});
		});
	});
	/* eslint-enable local/code-no-bracket-notation-for-identifiers */

	suite('isSettingsSearchUpToDate', () => {
		test('allows focus when search is idle and query matches rendered results', () => {
			assert.strictEqual(isSettingsSearchUpToDate(false, 'font', 'font'), true);
			assert.strictEqual(isSettingsSearchUpToDate(false, '', ''), true);
		});

		test('trims the current search value before comparing', () => {
			assert.strictEqual(isSettingsSearchUpToDate(false, 'font', '  font  '), true);
			assert.strictEqual(isSettingsSearchUpToDate(false, 'font', ' font size '), false);
		});

		test('blocks focus while a debounced search is pending', () => {
			assert.strictEqual(isSettingsSearchUpToDate(true, 'font', 'font'), false);
			assert.strictEqual(isSettingsSearchUpToDate(true, '', ''), false);
		});

		test('blocks focus when rendered results are stale', () => {
			assert.strictEqual(isSettingsSearchUpToDate(false, 'font', 'theme'), false);
			assert.strictEqual(isSettingsSearchUpToDate(false, 'font', ''), false);
			assert.strictEqual(isSettingsSearchUpToDate(false, undefined, ''), false);
		});

		test('uses Delayer.isTriggered() return value (regression #327360)', async () => {
			const delayer = store.add(new Delayer<void>(1000));

			assert.strictEqual(delayer.isTriggered(), false);
			assert.strictEqual(isSettingsSearchUpToDate(delayer.isTriggered(), 'font', 'font'), true);

			const pending = assert.rejects(delayer.trigger(() => { }));
			assert.strictEqual(delayer.isTriggered(), true);
			assert.strictEqual(isSettingsSearchUpToDate(delayer.isTriggered(), 'font', 'font'), false);

			delayer.cancel();
			await pending;
			assert.strictEqual(delayer.isTriggered(), false);
			assert.strictEqual(isSettingsSearchUpToDate(delayer.isTriggered(), 'font', 'font'), true);
		});
	});
});
