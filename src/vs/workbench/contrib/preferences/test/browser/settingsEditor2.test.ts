/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as DOM from '../../../../../base/browser/dom.js';
import { setARIAContainer } from '../../../../../base/browser/ui/aria/aria.js';
import { SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { ITreeElement } from '../../../../../base/browser/ui/tree/tree.js';
import { Delayer } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
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
import { SettingsTree, SettingTreeRenderers } from '../../browser/settingsTree.js';
import { parseQuery, SearchResultIdx, SettingsTreeElement, SettingsTreeModel, SettingsTreeSettingElement } from '../../browser/settingsTreeModels.js';
import { TOCTree, TOCTreeModel } from '../../browser/tocTree.js';

suite('SettingsEditor2', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Access private editor state without widening the production API. */
	suite('ExP assignment refresh', () => {
		function createEditor(query = '@tag:expassigned', advanced = false) {
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
			instantiationService.stub(IExtensionGalleryService, {});
			instantiationService.stub(IEditorProgressService, {});
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
			const tree = DOM.append(root, DOM.$('.settings-tree-container'));
			const splitView = DOM.append(root, DOM.$('.settings-body'));
			let renderedKeys: string[] = [];
			editor['rootElement'] = root;
			editor['countElement'] = count;
			editor['clearFilterLinkContainer'] = DOM.append(root, DOM.$('div'));
			editor['searchWidget'] = new class extends mock<SuggestEnabledInputWithHistory>() {
				override updateAriaLabel(label: string): void { input.setAttribute('aria-label', label); }
			}();
			editor['splitView'] = new class extends mock<SplitView<number>>() { override readonly el = splitView; }();
			editor['settingsTree'] = new class extends mock<SettingsTree>() {
				override getHTMLElement(): HTMLElement { return tree; }
				override hasElement(): boolean { return true; }
				override rerender(): void { }
				override setChildren(_element: SettingsTreeElement | null, children?: Iterable<ITreeElement<SettingsTreeElement>>): void {
					renderedKeys = Array.from(children ?? []).map(child => {
						assert.ok(child.element instanceof SettingsTreeSettingElement);
						return child.element.setting.key;
					});
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
			editor['tocTree'] = new class extends mock<TOCTree>() { override setChildren(): void { } }();

			const settings = ['test.assigned', 'test.unassigned'].map(key => new class extends mock<ISetting>() {
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
			return { editor, assignments, searchModel, settings, rebuild, read, tree, viewState, changeConfiguration };
		}

		test('configuration changes do not rebuild assignment-filtered results', () => {
			const { assignments, changeConfiguration, rebuild, searchModel } = createEditor();
			assignments.setAssignment('test.assigned', true);
			rebuild.resetHistory();
			const before = searchModel.root.children[0];
			changeConfiguration('test.assigned');
			changeConfiguration('editor.fontSize');
			assert.deepStrictEqual({ rebuilds: rebuild.callCount, sameRow: searchModel.root.children[0] === before }, { rebuilds: 0, sameRow: true });
		});

		test('assignment changes refresh counts, empty state and ARIA even with a focused setting', () => {
			const { assignments, read, tree } = createEditor();
			const initial = read();
			assignments.setAssignment('test.assigned', true);
			const assigned = read();
			const focusedRow = DOM.append(tree, DOM.$('.setting-item-contents'));
			const input = DOM.append(focusedRow, DOM.$('input'));
			input.focus();
			assignments.setAssignment('test.assigned', false);
			assert.deepStrictEqual({ initial, assigned, removed: read() }, {
				initial: { count: 'No Settings Found', noResults: true, visibility: 'hidden', inputLabel: 'Search settings. No Settings Found', announcement: 'No Settings Found', tocCount: 0, renderedKeys: [] },
				assigned: { count: '1 Setting Found', noResults: false, visibility: 'visible', inputLabel: 'Search settings. 1 Setting Found', announcement: '1 Setting Found', tocCount: 1, renderedKeys: ['test.assigned'] },
				removed: { count: 'No Settings Found', noResults: true, visibility: 'hidden', inputLabel: 'Search settings. No Settings Found', announcement: 'No Settings Found', tocCount: 0, renderedKeys: [] },
			});
		});

		test('assignment changes do not rebuild when the assignment filter is inactive', () => {
			const { assignments, rebuild } = createEditor('@modified');
			assignments.setAssignment('test.assigned', true);
			assert.strictEqual(rebuild.callCount, 0);
		});

		test('advanced assigned settings survive editor filtering while unassigned settings do not', () => {
			const { assignments, searchModel, read } = createEditor('@tag:expassigned', true);
			assignments.setAssignment('test.assigned', true);
			assert.deepStrictEqual({
				keys: searchModel.root.children.map(element => {
					assert.ok(element instanceof SettingsTreeSettingElement);
					return element.setting.key;
				}),
				count: read().count,
			}, { keys: ['test.assigned'], count: '1 Setting Found' });
		});

		test('advanced assignment exemption applies to text search and preserves policy filtering', async () => {
			const { editor, assignments, settings, viewState } = createEditor('@tag:expassigned example', true);
			assignments.setAssignment('test.assigned', true);
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
