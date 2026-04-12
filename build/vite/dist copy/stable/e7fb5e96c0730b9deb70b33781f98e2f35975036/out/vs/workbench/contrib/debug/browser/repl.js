/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var Repl_1, ReplOptions_1;
import * as dom from '../../../../base/browser/dom.js';
import * as domStylesheetsJs from '../../../../base/browser/domStylesheets.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from '../../../../base/browser/ui/mouseCursor/mouseCursor.js';
import { RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { memoize } from '../../../../base/common/decorators.js';
import { Emitter } from '../../../../base/common/event.js';
import { HistoryNavigator } from '../../../../base/common/history.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI as uri } from '../../../../base/common/uri.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction, registerEditorAction } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EDITOR_FONT_DEFAULTS } from '../../../../editor/common/config/fontInfo.js';
import { Range } from '../../../../editor/common/core/range.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { CompletionItemKinds } from '../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextResourcePropertiesService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { localize, localize2 } from '../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { getFlatContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { registerAndCreateHistoryNavigationContext } from '../../../../platform/history/browser/contextScopedHistoryWidget.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { editorForeground, resolveColorValue } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { registerNavigableContainer } from '../../../browser/actions/widgetNavigationCommands.js';
import { FilterViewPane, ViewAction } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from '../../codeEditor/browser/simpleEditorOptions.js';
import { CONTEXT_DEBUG_STATE, CONTEXT_IN_DEBUG_REPL, CONTEXT_MULTI_SESSION_REPL, DEBUG_SCHEME, IDebugService, REPL_VIEW_ID, getStateLabel } from '../common/debug.js';
import { Variable } from '../common/debugModel.js';
import { resolveChildSession } from '../common/debugUtils.js';
import { ReplEvaluationResult, ReplGroup } from '../common/replModel.js';
import { FocusSessionActionViewItem } from './debugActionViewItems.js';
import { DEBUG_COMMAND_CATEGORY, FOCUS_REPL_ID } from './debugCommands.js';
import { DebugExpressionRenderer } from './debugExpressionRenderer.js';
import { debugConsoleClearAll, debugConsoleEvaluationPrompt } from './debugIcons.js';
import './media/repl.css';
import { ReplFilter } from './replFilter.js';
import { ReplAccessibilityProvider, ReplDataSource, ReplDelegate, ReplEvaluationInputsRenderer, ReplEvaluationResultsRenderer, ReplGroupRenderer, ReplOutputElementRenderer, ReplRawObjectsRenderer, ReplVariablesRenderer } from './replViewer.js';
const $ = dom.$;
const HISTORY_STORAGE_KEY = 'debug.repl.history';
const FILTER_HISTORY_STORAGE_KEY = 'debug.repl.filterHistory';
const FILTER_VALUE_STORAGE_KEY = 'debug.repl.filterValue';
const DECORATION_KEY = 'replinputdecoration';
function revealLastElement(tree) {
    tree.scrollTop = tree.scrollHeight - tree.renderHeight;
    // tree.scrollTop = 1e6;
}
const sessionsToIgnore = new Set();
const identityProvider = { getId: (element) => element.getId() };
let Repl = class Repl extends FilterViewPane {
    static { Repl_1 = this; }
    static { this.REFRESH_DELAY = 50; } // delay in ms to refresh the repl for new elements to show
    static { this.URI = uri.parse(`${DEBUG_SCHEME}:replinput`); }
    constructor(options, debugService, instantiationService, storageService, themeService, modelService, contextKeyService, codeEditorService, viewDescriptorService, contextMenuService, configurationService, textResourcePropertiesService, editorService, keybindingService, openerService, hoverService, menuService, languageFeaturesService, logService) {
        const filterText = storageService.get(FILTER_VALUE_STORAGE_KEY, 1 /* StorageScope.WORKSPACE */, '');
        super({
            ...options,
            filterOptions: {
                placeholder: localize({ key: 'workbench.debug.filter.placeholder', comment: ['Text in the brackets after e.g. is not localizable'] }, "Filter (e.g. text, !exclude, \\escape)"),
                text: filterText,
                history: JSON.parse(storageService.get(FILTER_HISTORY_STORAGE_KEY, 1 /* StorageScope.WORKSPACE */, '[]')),
            }
        }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.debugService = debugService;
        this.storageService = storageService;
        this.modelService = modelService;
        this.configurationService = configurationService;
        this.textResourcePropertiesService = textResourcePropertiesService;
        this.editorService = editorService;
        this.keybindingService = keybindingService;
        this.languageFeaturesService = languageFeaturesService;
        this.logService = logService;
        this.previousTreeScrollHeight = 0;
        this.styleChangedWhenInvisible = false;
        this.modelChangeListener = Disposable.None;
        this.findIsOpen = false;
        this.menu = menuService.createMenu(MenuId.DebugConsoleContext, contextKeyService);
        this._register(this.menu);
        this.history = this._register(new HistoryNavigator(new Set(JSON.parse(this.storageService.get(HISTORY_STORAGE_KEY, 1 /* StorageScope.WORKSPACE */, '[]'))), 100));
        this.filter = new ReplFilter();
        this.filter.filterQuery = filterText;
        this.multiSessionRepl = CONTEXT_MULTI_SESSION_REPL.bindTo(contextKeyService);
        this.replOptions = this._register(this.instantiationService.createInstance(ReplOptions, this.id, () => this.getLocationBasedColors().background));
        this._register(this.replOptions.onDidChange(() => this.onDidStyleChange()));
        this._register(codeEditorService.registerDecorationType('repl-decoration', DECORATION_KEY, {}));
        this.multiSessionRepl.set(this.isMultiSessionView);
        this.registerListeners();
    }
    registerListeners() {
        if (this.debugService.getViewModel().focusedSession) {
            this.onDidFocusSession(this.debugService.getViewModel().focusedSession);
        }
        this._register(this.debugService.getViewModel().onDidFocusSession(session => {
            this.onDidFocusSession(session);
        }));
        this._register(this.debugService.getViewModel().onDidEvaluateLazyExpression(async (e) => {
            if (e instanceof Variable && this.tree?.hasNode(e)) {
                await this.tree.updateChildren(e, false, true);
                await this.tree.expand(e);
            }
        }));
        this._register(this.debugService.onWillNewSession(async (newSession) => {
            // Need to listen to output events for sessions which are not yet fully initialised
            const input = this.tree?.getInput();
            if (!input || input.state === 0 /* State.Inactive */) {
                await this.selectSession(newSession);
            }
            this.multiSessionRepl.set(this.isMultiSessionView);
        }));
        this._register(this.debugService.onDidEndSession(async () => {
            // Update view, since orphaned sessions might now be separate
            await Promise.resolve(); // allow other listeners to go first, so sessions can update parents
            this.multiSessionRepl.set(this.isMultiSessionView);
        }));
        this._register(this.themeService.onDidColorThemeChange(() => {
            this.refreshReplElements(false);
            if (this.isVisible()) {
                this.updateInputDecoration();
            }
        }));
        this._register(this.onDidChangeBodyVisibility(visible => {
            if (!visible) {
                return;
            }
            if (!this.model) {
                this.model = this.modelService.getModel(Repl_1.URI) || this.modelService.createModel('', null, Repl_1.URI, true);
            }
            const focusedSession = this.debugService.getViewModel().focusedSession;
            if (this.tree && this.tree.getInput() !== focusedSession) {
                this.onDidFocusSession(focusedSession);
            }
            this.setMode();
            this.replInput.setModel(this.model);
            this.updateInputDecoration();
            this.refreshReplElements(true);
            if (this.styleChangedWhenInvisible) {
                this.styleChangedWhenInvisible = false;
                this.tree?.updateChildren(undefined, true, false);
                this.onDidStyleChange();
            }
        }));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('debug.console.wordWrap') && this.tree) {
                this.tree.dispose();
                this.treeContainer.innerText = '';
                dom.clearNode(this.treeContainer);
                this.createReplTree();
            }
            if (e.affectsConfiguration('debug.console.acceptSuggestionOnEnter')) {
                const config = this.configurationService.getValue('debug');
                this.replInput.updateOptions({
                    acceptSuggestionOnEnter: config.console.acceptSuggestionOnEnter === 'on' ? 'on' : 'off'
                });
            }
        }));
        this._register(this.editorService.onDidActiveEditorChange(() => {
            this.setMode();
        }));
        this._register(this.filterWidget.onDidChangeFilterText(() => {
            this.filter.filterQuery = this.filterWidget.getFilterText();
            if (this.tree) {
                this.tree.refilter();
                revealLastElement(this.tree);
            }
        }));
    }
    async onDidFocusSession(session) {
        if (session) {
            sessionsToIgnore.delete(session);
            this.completionItemProvider?.dispose();
            if (session.capabilities.supportsCompletionsRequest) {
                this.completionItemProvider = this.languageFeaturesService.completionProvider.register({ scheme: DEBUG_SCHEME, pattern: '**/replinput', hasAccessToAllModels: true }, {
                    _debugDisplayName: 'debugConsole',
                    triggerCharacters: session.capabilities.completionTriggerCharacters || ['.'],
                    provideCompletionItems: async (_, position, _context, token) => {
                        // Disable history navigation because up and down are used to navigate through the suggest widget
                        this.setHistoryNavigationEnablement(false);
                        const model = this.replInput.getModel();
                        if (model) {
                            const text = model.getValue();
                            const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
                            const frameId = focusedStackFrame ? focusedStackFrame.frameId : undefined;
                            const response = await session.completions(frameId, focusedStackFrame?.thread.threadId || 0, text, position, token);
                            const suggestions = [];
                            const computeRange = (length) => Range.fromPositions(position.delta(0, -length), position);
                            if (response && response.body && response.body.targets) {
                                response.body.targets.forEach(item => {
                                    if (item && item.label) {
                                        let insertTextRules = undefined;
                                        let insertText = item.text || item.label;
                                        if (typeof item.selectionStart === 'number') {
                                            // If a debug completion item sets a selection we need to use snippets to make sure the selection is selected #90974
                                            insertTextRules = 4 /* CompletionItemInsertTextRule.InsertAsSnippet */;
                                            const selectionLength = typeof item.selectionLength === 'number' ? item.selectionLength : 0;
                                            const placeholder = selectionLength > 0 ? '${1:' + insertText.substring(item.selectionStart, item.selectionStart + selectionLength) + '}$0' : '$0';
                                            insertText = insertText.substring(0, item.selectionStart) + placeholder + insertText.substring(item.selectionStart + selectionLength);
                                        }
                                        suggestions.push({
                                            label: item.label,
                                            insertText,
                                            detail: item.detail,
                                            kind: CompletionItemKinds.fromString(item.type || 'property'),
                                            filterText: (item.start && item.length) ? text.substring(item.start, item.start + item.length).concat(item.label) : undefined,
                                            range: computeRange(item.length || 0),
                                            sortText: item.sortText,
                                            insertTextRules
                                        });
                                    }
                                });
                            }
                            if (this.configurationService.getValue('debug').console.historySuggestions) {
                                const history = this.history.getHistory();
                                const idxLength = String(history.length).length;
                                history.forEach((h, i) => suggestions.push({
                                    label: h,
                                    insertText: h,
                                    kind: 18 /* CompletionItemKind.Text */,
                                    range: computeRange(h.length),
                                    sortText: 'ZZZ' + String(history.length - i).padStart(idxLength, '0')
                                }));
                            }
                            return { suggestions };
                        }
                        return Promise.resolve({ suggestions: [] });
                    }
                });
            }
        }
        await this.selectSession();
    }
    getFilterStats() {
        // This could be called before the tree is created when setting this.filterState.filterText value
        return {
            total: this.tree?.getNode().children.length ?? 0,
            filtered: this.tree?.getNode().children.filter(c => c.visible).length ?? 0
        };
    }
    get isReadonly() {
        // Do not allow to edit inactive sessions
        const session = this.tree?.getInput();
        if (session && session.state !== 0 /* State.Inactive */) {
            return false;
        }
        return true;
    }
    showPreviousValue() {
        if (!this.isReadonly) {
            this.navigateHistory(true);
        }
    }
    showNextValue() {
        if (!this.isReadonly) {
            this.navigateHistory(false);
        }
    }
    focusFilter() {
        this.filterWidget.focus();
    }
    openFind() {
        this.tree?.openFind();
    }
    setMode() {
        if (!this.isVisible()) {
            return;
        }
        const activeEditorControl = this.editorService.activeTextEditorControl;
        if (isCodeEditor(activeEditorControl)) {
            this.modelChangeListener.dispose();
            this.modelChangeListener = activeEditorControl.onDidChangeModelLanguage(() => this.setMode());
            if (this.model && activeEditorControl.hasModel()) {
                this.model.setLanguage(activeEditorControl.getModel().getLanguageId());
            }
        }
    }
    onDidStyleChange() {
        if (!this.isVisible()) {
            this.styleChangedWhenInvisible = true;
            return;
        }
        if (this.styleElement) {
            this.replInput.updateOptions({
                fontSize: this.replOptions.replConfiguration.fontSize,
                lineHeight: this.replOptions.replConfiguration.lineHeight,
                fontFamily: this.replOptions.replConfiguration.fontFamily === 'default' ? EDITOR_FONT_DEFAULTS.fontFamily : this.replOptions.replConfiguration.fontFamily
            });
            const replInputLineHeight = this.replInput.getOption(75 /* EditorOption.lineHeight */);
            // Set the font size, font family, line height and align the twistie to be centered, and input theme color
            this.styleElement.textContent = `
				.repl .repl-input-wrapper .repl-input-chevron {
					line-height: ${replInputLineHeight}px
				}

				.repl .repl-input-wrapper .monaco-editor .lines-content {
					background-color: ${this.replOptions.replConfiguration.backgroundColor};
				}
			`;
            const cssFontFamily = this.replOptions.replConfiguration.fontFamily === 'default' ? 'var(--monaco-monospace-font)' : this.replOptions.replConfiguration.fontFamily;
            this.container.style.setProperty(`--vscode-repl-font-family`, cssFontFamily);
            this.container.style.setProperty(`--vscode-repl-font-size`, `${this.replOptions.replConfiguration.fontSize}px`);
            this.container.style.setProperty(`--vscode-repl-font-size-for-twistie`, `${this.replOptions.replConfiguration.fontSizeForTwistie}px`);
            this.container.style.setProperty(`--vscode-repl-line-height`, this.replOptions.replConfiguration.cssLineHeight);
            this.tree?.rerender();
            if (this.bodyContentDimension) {
                this.layoutBodyContent(this.bodyContentDimension.height, this.bodyContentDimension.width);
            }
        }
    }
    navigateHistory(previous) {
        const historyInput = (previous ?
            (this.history.previous() ?? this.history.first()) : this.history.next())
            ?? '';
        this.replInput.setValue(historyInput);
        aria.status(historyInput);
        // always leave cursor at the end.
        this.replInput.setPosition({ lineNumber: 1, column: historyInput.length + 1 });
        this.setHistoryNavigationEnablement(true);
    }
    async selectSession(session) {
        const treeInput = this.tree?.getInput();
        if (!session) {
            const focusedSession = this.debugService.getViewModel().focusedSession;
            // If there is a focusedSession focus on that one, otherwise just show any other not ignored session
            if (focusedSession) {
                session = focusedSession;
            }
            else if (!treeInput || sessionsToIgnore.has(treeInput)) {
                session = this.debugService.getModel().getSessions(true).find(s => !sessionsToIgnore.has(s));
            }
        }
        if (session) {
            this.replElementsChangeListener?.dispose();
            this.replElementsChangeListener = session.onDidChangeReplElements(() => {
                this.refreshReplElements(session.getReplElements().length === 0);
            });
            if (this.tree && treeInput !== session) {
                try {
                    await this.tree.setInput(session);
                }
                catch (err) {
                    // Ignore error because this may happen multiple times while refreshing,
                    // then changing the root may fail. Log to help with debugging if needed.
                    this.logService.error(err);
                }
                revealLastElement(this.tree);
            }
        }
        this.replInput?.updateOptions({ readOnly: this.isReadonly });
        this.updateInputDecoration();
    }
    async clearRepl() {
        const session = this.tree?.getInput();
        if (session) {
            session.removeReplExpressions();
            if (session.state === 0 /* State.Inactive */) {
                // Ignore inactive sessions which got cleared - so they are not shown any more
                sessionsToIgnore.add(session);
                await this.selectSession();
                this.multiSessionRepl.set(this.isMultiSessionView);
            }
        }
        this.replInput.focus();
    }
    acceptReplInput() {
        const session = this.tree?.getInput();
        if (session && !this.isReadonly) {
            session.addReplExpression(this.debugService.getViewModel().focusedStackFrame, this.replInput.getValue());
            revealLastElement(this.tree);
            this.history.add(this.replInput.getValue());
            this.replInput.setValue('');
            if (this.bodyContentDimension) {
                // Trigger a layout to shrink a potential multi line input
                this.layoutBodyContent(this.bodyContentDimension.height, this.bodyContentDimension.width);
            }
        }
    }
    sendReplInput(input) {
        const session = this.tree?.getInput();
        if (session && !this.isReadonly) {
            session.addReplExpression(this.debugService.getViewModel().focusedStackFrame, input);
            revealLastElement(this.tree);
            this.history.add(input);
        }
    }
    getVisibleContent() {
        let text = '';
        if (this.model && this.tree) {
            const lineDelimiter = this.textResourcePropertiesService.getEOL(this.model.uri);
            const traverseAndAppend = (node) => {
                node.children.forEach(child => {
                    if (child.visible) {
                        text += child.element.toString().trimRight() + lineDelimiter;
                        if (!child.collapsed && child.children.length) {
                            traverseAndAppend(child);
                        }
                    }
                });
            };
            traverseAndAppend(this.tree.getNode());
        }
        return removeAnsiEscapeCodes(text);
    }
    layoutBodyContent(height, width) {
        this.bodyContentDimension = new dom.Dimension(width, height);
        const replInputHeight = Math.min(this.replInput.getContentHeight(), height);
        if (this.tree) {
            const lastElementVisible = this.tree.scrollTop + this.tree.renderHeight >= this.tree.scrollHeight;
            const treeHeight = height - replInputHeight;
            this.tree.getHTMLElement().style.height = `${treeHeight}px`;
            this.tree.layout(treeHeight, width);
            if (lastElementVisible) {
                revealLastElement(this.tree);
            }
        }
        this.replInputContainer.style.height = `${replInputHeight}px`;
        this.replInput.layout({ width: width - 30, height: replInputHeight });
    }
    collapseAll() {
        this.tree?.collapseAll();
    }
    getDebugSession() {
        return this.tree?.getInput();
    }
    getReplInput() {
        return this.replInput;
    }
    getReplDataSource() {
        return this.replDataSource;
    }
    getFocusedElement() {
        return this.tree?.getFocus()?.[0];
    }
    focusTree() {
        this.tree?.domFocus();
    }
    async focus() {
        super.focus();
        await timeout(0); // wait a task for the repl to get attached to the DOM, #83387
        this.replInput.focus();
    }
    createActionViewItem(action) {
        if (action.id === selectReplCommandId) {
            const session = (this.tree ? this.tree.getInput() : undefined) ?? this.debugService.getViewModel().focusedSession;
            return this.instantiationService.createInstance(SelectReplActionViewItem, action, session);
        }
        return super.createActionViewItem(action);
    }
    get isMultiSessionView() {
        return this.debugService.getModel().getSessions(true).filter(s => s.hasSeparateRepl() && !sessionsToIgnore.has(s)).length > 1;
    }
    // --- Cached locals
    get refreshScheduler() {
        const autoExpanded = new Set();
        return new RunOnceScheduler(async () => {
            if (!this.tree || !this.tree.getInput() || !this.isVisible()) {
                return;
            }
            await this.tree.updateChildren(undefined, true, false, { diffIdentityProvider: identityProvider });
            const session = this.tree.getInput();
            if (session) {
                // Automatically expand repl group elements when specified
                const autoExpandElements = async (elements) => {
                    for (const element of elements) {
                        if (element instanceof ReplGroup) {
                            if (element.autoExpand && !autoExpanded.has(element.getId())) {
                                autoExpanded.add(element.getId());
                                await this.tree.expand(element);
                            }
                            if (!this.tree.isCollapsed(element)) {
                                // Repl groups can have children which are repl groups thus we might need to expand those as well
                                await autoExpandElements(element.getChildren());
                            }
                        }
                    }
                };
                await autoExpandElements(session.getReplElements());
            }
            // Repl elements count changed, need to update filter stats on the badge
            const { total, filtered } = this.getFilterStats();
            this.filterWidget.updateBadge(total === filtered || total === 0 ? undefined : localize('showing filtered repl lines', "Showing {0} of {1}", filtered, total));
        }, Repl_1.REFRESH_DELAY);
    }
    // --- Creation
    render() {
        super.render();
        this._register(registerNavigableContainer({
            name: 'repl',
            focusNotifiers: [this, this.filterWidget],
            focusNextWidget: () => {
                const element = this.tree?.getHTMLElement();
                if (this.filterWidget.hasFocus()) {
                    this.tree?.domFocus();
                }
                else if (element && dom.isActiveElement(element)) {
                    this.focus();
                }
            },
            focusPreviousWidget: () => {
                const element = this.tree?.getHTMLElement();
                if (this.replInput.hasTextFocus()) {
                    this.tree?.domFocus();
                }
                else if (element && dom.isActiveElement(element)) {
                    this.focusFilter();
                }
            }
        }));
    }
    renderBody(parent) {
        super.renderBody(parent);
        this.container = dom.append(parent, $('.repl'));
        this.treeContainer = dom.append(this.container, $(`.repl-tree.${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`));
        this.createReplInput(this.container);
        this.createReplTree();
    }
    createReplTree() {
        this.replDelegate = new ReplDelegate(this.configurationService, this.replOptions);
        const wordWrap = this.configurationService.getValue('debug').console.wordWrap;
        this.treeContainer.classList.toggle('word-wrap', wordWrap);
        const expressionRenderer = this.instantiationService.createInstance(DebugExpressionRenderer);
        this.replDataSource = new ReplDataSource();
        const tree = this.tree = this.instantiationService.createInstance((WorkbenchAsyncDataTree), 'DebugRepl', this.treeContainer, this.replDelegate, [
            this.instantiationService.createInstance(ReplVariablesRenderer, expressionRenderer),
            this.instantiationService.createInstance(ReplOutputElementRenderer, expressionRenderer),
            new ReplEvaluationInputsRenderer(),
            this.instantiationService.createInstance(ReplGroupRenderer, expressionRenderer),
            new ReplEvaluationResultsRenderer(expressionRenderer),
            new ReplRawObjectsRenderer(expressionRenderer),
        ], this.replDataSource, {
            filter: this.filter,
            accessibilityProvider: new ReplAccessibilityProvider(),
            identityProvider,
            userSelection: true,
            mouseSupport: false,
            findWidgetEnabled: true,
            keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e) => e.toString(true) },
            horizontalScrolling: !wordWrap,
            setRowLineHeight: false,
            supportDynamicHeights: wordWrap,
            overrideStyles: this.getLocationBasedColors().listOverrideStyles
        });
        this._register(tree.onDidChangeContentHeight(() => {
            if (tree.scrollHeight !== this.previousTreeScrollHeight) {
                // Due to rounding, the scrollTop + renderHeight will not exactly match the scrollHeight.
                // Consider the tree to be scrolled all the way down if it is within 2px of the bottom.
                const lastElementWasVisible = tree.scrollTop + tree.renderHeight >= this.previousTreeScrollHeight - 2;
                if (lastElementWasVisible) {
                    setTimeout(() => {
                        // Can't set scrollTop during this event listener, the list might overwrite the change
                        revealLastElement(tree);
                    }, 0);
                }
            }
            this.previousTreeScrollHeight = tree.scrollHeight;
        }));
        this._register(tree.onContextMenu(e => this.onContextMenu(e)));
        this._register(tree.onDidChangeFindOpenState((open) => this.findIsOpen = open));
        let lastSelectedString;
        this._register(tree.onMouseClick(() => {
            if (this.findIsOpen) {
                return;
            }
            const selection = dom.getWindow(this.treeContainer).getSelection();
            if (!selection || selection.type !== 'Range' || lastSelectedString === selection.toString()) {
                // only focus the input if the user is not currently selecting and find isn't open.
                this.replInput.focus();
            }
            lastSelectedString = selection ? selection.toString() : '';
        }));
        // Make sure to select the session if debugging is already active
        this.selectSession();
        this.styleElement = domStylesheetsJs.createStyleSheet(this.container, undefined, this._store);
        this.onDidStyleChange();
    }
    createReplInput(container) {
        this.replInputContainer = dom.append(container, $('.repl-input-wrapper'));
        dom.append(this.replInputContainer, $('.repl-input-chevron' + ThemeIcon.asCSSSelector(debugConsoleEvaluationPrompt)));
        const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(this.scopedContextKeyService, this));
        this.setHistoryNavigationEnablement = enabled => {
            historyNavigationBackwardsEnablement.set(enabled);
            historyNavigationForwardsEnablement.set(enabled);
        };
        CONTEXT_IN_DEBUG_REPL.bindTo(this.scopedContextKeyService).set(true);
        this.scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
        const options = getSimpleEditorOptions(this.configurationService);
        options.readOnly = true;
        options.suggest = { showStatusBar: true };
        const config = this.configurationService.getValue('debug');
        options.acceptSuggestionOnEnter = config.console.acceptSuggestionOnEnter === 'on' ? 'on' : 'off';
        options.ariaLabel = this.getAriaLabel();
        this.replInput = this.scopedInstantiationService.createInstance(CodeEditorWidget, this.replInputContainer, options, getSimpleCodeEditorWidgetOptions());
        let lastContentHeight = -1;
        this._register(this.replInput.onDidChangeModelContent(() => {
            const model = this.replInput.getModel();
            this.setHistoryNavigationEnablement(!!model && model.getValue() === '');
            const contentHeight = this.replInput.getContentHeight();
            if (contentHeight !== lastContentHeight) {
                lastContentHeight = contentHeight;
                if (this.bodyContentDimension) {
                    this.layoutBodyContent(this.bodyContentDimension.height, this.bodyContentDimension.width);
                }
            }
        }));
        // We add the input decoration only when the focus is in the input #61126
        this._register(this.replInput.onDidFocusEditorText(() => this.updateInputDecoration()));
        this._register(this.replInput.onDidBlurEditorText(() => this.updateInputDecoration()));
        this._register(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.FOCUS, () => this.replInputContainer.classList.add('synthetic-focus')));
        this._register(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.BLUR, () => this.replInputContainer.classList.remove('synthetic-focus')));
    }
    getAriaLabel() {
        let ariaLabel = localize('debugConsole', "Debug Console");
        if (!this.configurationService.getValue("accessibility.verbosity.debug" /* AccessibilityVerbositySettingId.Debug */)) {
            return ariaLabel;
        }
        const keybinding = this.keybindingService.lookupKeybinding("editor.action.accessibilityHelp" /* AccessibilityCommandId.OpenAccessibilityHelp */)?.getAriaLabel();
        if (keybinding) {
            ariaLabel = localize('commentLabelWithKeybinding', "{0}, use ({1}) for accessibility help", ariaLabel, keybinding);
        }
        else {
            ariaLabel = localize('commentLabelWithKeybindingNoKeybinding', "{0}, run the command Open Accessibility Help which is currently not triggerable via keybinding.", ariaLabel);
        }
        return ariaLabel;
    }
    onContextMenu(e) {
        const actions = getFlatContextMenuActions(this.menu.getActions({ arg: e.element, shouldForwardArgs: false }));
        this.contextMenuService.showContextMenu({
            getAnchor: () => e.anchor,
            getActions: () => actions,
            getActionsContext: () => e.element
        });
    }
    // --- Update
    refreshReplElements(noDelay) {
        if (this.tree && this.isVisible()) {
            if (this.refreshScheduler.isScheduled()) {
                return;
            }
            this.refreshScheduler.schedule(noDelay ? 0 : undefined);
        }
    }
    updateInputDecoration() {
        if (!this.replInput) {
            return;
        }
        const decorations = [];
        if (this.isReadonly && this.replInput.hasTextFocus() && !this.replInput.getValue()) {
            const transparentForeground = resolveColorValue(editorForeground, this.themeService.getColorTheme())?.transparent(0.4);
            decorations.push({
                range: {
                    startLineNumber: 0,
                    endLineNumber: 0,
                    startColumn: 0,
                    endColumn: 1
                },
                renderOptions: {
                    after: {
                        contentText: localize('startDebugFirst', "Please start a debug session to evaluate expressions"),
                        color: transparentForeground ? transparentForeground.toString() : undefined
                    }
                }
            });
        }
        this.replInput.setDecorationsByType('repl-decoration', DECORATION_KEY, decorations);
    }
    saveState() {
        const replHistory = this.history.getHistory();
        if (replHistory.length) {
            this.storageService.store(HISTORY_STORAGE_KEY, JSON.stringify(replHistory), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(HISTORY_STORAGE_KEY, 1 /* StorageScope.WORKSPACE */);
        }
        const filterHistory = this.filterWidget.getHistory();
        if (filterHistory.length) {
            this.storageService.store(FILTER_HISTORY_STORAGE_KEY, JSON.stringify(filterHistory), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(FILTER_HISTORY_STORAGE_KEY, 1 /* StorageScope.WORKSPACE */);
        }
        const filterValue = this.filterWidget.getFilterText();
        if (filterValue) {
            this.storageService.store(FILTER_VALUE_STORAGE_KEY, filterValue, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(FILTER_VALUE_STORAGE_KEY, 1 /* StorageScope.WORKSPACE */);
        }
        super.saveState();
    }
    dispose() {
        this.replInput?.dispose(); // Disposed before rendered? #174558
        this.replElementsChangeListener?.dispose();
        this.refreshScheduler.dispose();
        this.modelChangeListener.dispose();
        super.dispose();
    }
};
__decorate([
    memoize
], Repl.prototype, "refreshScheduler", null);
Repl = Repl_1 = __decorate([
    __param(1, IDebugService),
    __param(2, IInstantiationService),
    __param(3, IStorageService),
    __param(4, IThemeService),
    __param(5, IModelService),
    __param(6, IContextKeyService),
    __param(7, ICodeEditorService),
    __param(8, IViewDescriptorService),
    __param(9, IContextMenuService),
    __param(10, IConfigurationService),
    __param(11, ITextResourcePropertiesService),
    __param(12, IEditorService),
    __param(13, IKeybindingService),
    __param(14, IOpenerService),
    __param(15, IHoverService),
    __param(16, IMenuService),
    __param(17, ILanguageFeaturesService),
    __param(18, ILogService)
], Repl);
export { Repl };
let ReplOptions = class ReplOptions extends Disposable {
    static { ReplOptions_1 = this; }
    static { this.lineHeightEm = 1.4; }
    get replConfiguration() {
        return this._replConfig;
    }
    constructor(viewId, backgroundColorDelegate, configurationService, themeService, viewDescriptorService) {
        super();
        this.backgroundColorDelegate = backgroundColorDelegate;
        this.configurationService = configurationService;
        this.themeService = themeService;
        this.viewDescriptorService = viewDescriptorService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._register(this.themeService.onDidColorThemeChange(e => this.update()));
        this._register(this.viewDescriptorService.onDidChangeLocation(e => {
            if (e.views.some(v => v.id === viewId)) {
                this.update();
            }
        }));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('debug.console.lineHeight') || e.affectsConfiguration('debug.console.fontSize') || e.affectsConfiguration('debug.console.fontFamily')) {
                this.update();
            }
        }));
        this.update();
    }
    update() {
        const debugConsole = this.configurationService.getValue('debug').console;
        this._replConfig = {
            fontSize: debugConsole.fontSize,
            fontFamily: debugConsole.fontFamily,
            lineHeight: debugConsole.lineHeight ? debugConsole.lineHeight : ReplOptions_1.lineHeightEm * debugConsole.fontSize,
            cssLineHeight: debugConsole.lineHeight ? `${debugConsole.lineHeight}px` : `${ReplOptions_1.lineHeightEm}em`,
            backgroundColor: this.themeService.getColorTheme().getColor(this.backgroundColorDelegate()),
            fontSizeForTwistie: debugConsole.fontSize * ReplOptions_1.lineHeightEm / 2 - 8
        };
        this._onDidChange.fire();
    }
};
ReplOptions = ReplOptions_1 = __decorate([
    __param(2, IConfigurationService),
    __param(3, IThemeService),
    __param(4, IViewDescriptorService)
], ReplOptions);
// Repl actions and commands
class AcceptReplInputAction extends EditorAction {
    constructor() {
        super({
            id: 'repl.action.acceptInput',
            label: localize2({ key: 'actions.repl.acceptInput', comment: ['Apply input from the debug console input box'] }, "Debug Console: Accept Input"),
            precondition: CONTEXT_IN_DEBUG_REPL,
            kbOpts: {
                kbExpr: EditorContextKeys.textInputFocus,
                primary: 3 /* KeyCode.Enter */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(accessor, editor) {
        SuggestController.get(editor)?.cancelSuggestWidget();
        const repl = getReplView(accessor.get(IViewsService));
        repl?.acceptReplInput();
    }
}
class FilterReplAction extends ViewAction {
    constructor() {
        super({
            viewId: REPL_VIEW_ID,
            id: 'repl.action.filter',
            title: localize('repl.action.filter', "Debug Console: Focus Filter"),
            precondition: CONTEXT_IN_DEBUG_REPL,
            keybinding: [{
                    when: EditorContextKeys.textInputFocus,
                    primary: 2048 /* KeyMod.CtrlCmd */ | 36 /* KeyCode.KeyF */,
                    weight: 100 /* KeybindingWeight.EditorContrib */
                }]
        });
    }
    runInView(accessor, repl) {
        repl.focusFilter();
    }
}
class FindReplAction extends ViewAction {
    constructor() {
        super({
            viewId: REPL_VIEW_ID,
            id: 'repl.action.find',
            title: localize('repl.action.find', "Debug Console: Focus Find"),
            precondition: CONTEXT_IN_DEBUG_REPL,
            keybinding: [{
                    when: ContextKeyExpr.or(CONTEXT_IN_DEBUG_REPL, ContextKeyExpr.equals('focusedView', 'workbench.panel.repl.view')),
                    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 36 /* KeyCode.KeyF */,
                    weight: 100 /* KeybindingWeight.EditorContrib */
                }],
            icon: Codicon.search,
            menu: [{
                    id: MenuId.ViewTitle,
                    group: 'navigation',
                    when: ContextKeyExpr.equals('view', REPL_VIEW_ID),
                    order: 15
                }, {
                    id: MenuId.DebugConsoleContext,
                    group: 'z_commands',
                    order: 25
                }],
        });
    }
    runInView(accessor, view) {
        view.openFind();
    }
}
class ReplCopyAllAction extends EditorAction {
    constructor() {
        super({
            id: 'repl.action.copyAll',
            label: localize('actions.repl.copyAll', "Debug: Console Copy All"),
            alias: 'Debug Console Copy All',
            precondition: CONTEXT_IN_DEBUG_REPL,
        });
    }
    run(accessor, editor) {
        const clipboardService = accessor.get(IClipboardService);
        const repl = getReplView(accessor.get(IViewsService));
        if (repl) {
            return clipboardService.writeText(repl.getVisibleContent());
        }
    }
}
registerEditorAction(AcceptReplInputAction);
registerEditorAction(ReplCopyAllAction);
registerAction2(FilterReplAction);
registerAction2(FindReplAction);
class SelectReplActionViewItem extends FocusSessionActionViewItem {
    getSessions() {
        return this.debugService.getModel().getSessions(true).filter(s => s.hasSeparateRepl() && !sessionsToIgnore.has(s));
    }
    mapFocusedSessionToSelected(focusedSession) {
        while (focusedSession.parentSession && !focusedSession.hasSeparateRepl()) {
            focusedSession = focusedSession.parentSession;
        }
        return focusedSession;
    }
}
export function getReplView(viewsService) {
    return viewsService.getActiveViewWithId(REPL_VIEW_ID) ?? undefined;
}
const selectReplCommandId = 'workbench.action.debug.selectRepl';
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: selectReplCommandId,
            viewId: REPL_VIEW_ID,
            title: localize('selectRepl', "Select Debug Console"),
            f1: false,
            menu: {
                id: MenuId.ViewTitle,
                group: 'navigation',
                when: ContextKeyExpr.and(ContextKeyExpr.equals('view', REPL_VIEW_ID), CONTEXT_MULTI_SESSION_REPL),
                order: 20
            }
        });
    }
    async runInView(accessor, view, session) {
        const debugService = accessor.get(IDebugService);
        // If session is already the focused session we need to manualy update the tree since view model will not send a focused change event
        if (session && session.state !== 0 /* State.Inactive */ && session !== debugService.getViewModel().focusedSession) {
            session = resolveChildSession(session, debugService.getModel().getSessions());
            await debugService.focusStackFrame(undefined, undefined, session, { explicit: true });
        }
        // Need to select the session in the view since the focussed session might not have changed
        await view.selectSession(session);
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: 'workbench.debug.panel.action.clearReplAction',
            viewId: REPL_VIEW_ID,
            title: localize2('clearRepl', 'Clear Console'),
            metadata: {
                description: localize2('clearRepl.descriotion', 'Clears all program output from your debug REPL')
            },
            f1: true,
            icon: debugConsoleClearAll,
            menu: [{
                    id: MenuId.ViewTitle,
                    group: 'navigation',
                    when: ContextKeyExpr.equals('view', REPL_VIEW_ID),
                    order: 30
                }, {
                    id: MenuId.DebugConsoleContext,
                    group: 'z_commands',
                    order: 20
                }],
            keybinding: [{
                    primary: 0,
                    mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */ },
                    // Weight is higher than work workbench contributions so the keybinding remains
                    // highest priority when chords are registered afterwards
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                    when: ContextKeyExpr.equals('focusedView', 'workbench.panel.repl.view')
                }],
        });
    }
    runInView(_accessor, view) {
        const accessibilitySignalService = _accessor.get(IAccessibilitySignalService);
        view.clearRepl();
        accessibilitySignalService.playSignal(AccessibilitySignal.clear);
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: 'debug.collapseRepl',
            title: localize('collapse', "Collapse All"),
            viewId: REPL_VIEW_ID,
            menu: {
                id: MenuId.DebugConsoleContext,
                group: 'z_commands',
                order: 10
            }
        });
    }
    runInView(_accessor, view) {
        view.collapseAll();
        view.focus();
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: 'debug.replPaste',
            title: localize('paste', "Paste"),
            viewId: REPL_VIEW_ID,
            precondition: CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(0 /* State.Inactive */)),
            menu: {
                id: MenuId.DebugConsoleContext,
                group: '2_cutcopypaste',
                order: 30
            }
        });
    }
    async runInView(accessor, view) {
        const clipboardService = accessor.get(IClipboardService);
        const clipboardText = await clipboardService.readText();
        if (clipboardText) {
            const replInput = view.getReplInput();
            replInput.setValue(replInput.getValue().concat(clipboardText));
            view.focus();
            const model = replInput.getModel();
            const lineNumber = model ? model.getLineCount() : 0;
            const column = model?.getLineMaxColumn(lineNumber);
            if (typeof lineNumber === 'number' && typeof column === 'number') {
                replInput.setPosition({ lineNumber, column });
            }
        }
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: 'workbench.debug.action.copyAll',
            title: localize('copyAll', "Copy All"),
            viewId: REPL_VIEW_ID,
            menu: {
                id: MenuId.DebugConsoleContext,
                group: '2_cutcopypaste',
                order: 20
            }
        });
    }
    async runInView(accessor, view) {
        const clipboardService = accessor.get(IClipboardService);
        await clipboardService.writeText(view.getVisibleContent());
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'debug.replCopy',
            title: localize('copy', "Copy"),
            menu: {
                id: MenuId.DebugConsoleContext,
                group: '2_cutcopypaste',
                order: 10
            }
        });
    }
    async run(accessor, element) {
        const clipboardService = accessor.get(IClipboardService);
        const debugService = accessor.get(IDebugService);
        const nativeSelection = dom.getActiveWindow().getSelection();
        const selectedText = nativeSelection?.toString();
        if (selectedText && selectedText.length > 0) {
            return clipboardService.writeText(selectedText);
        }
        else if (element) {
            const retValue = await this.tryEvaluateAndCopy(debugService, element);
            const textToCopy = retValue || removeAnsiEscapeCodes(element.toString());
            return clipboardService.writeText(textToCopy);
        }
    }
    async tryEvaluateAndCopy(debugService, element) {
        // todo: we should expand DAP to allow copying more types here (#187784)
        if (!(element instanceof ReplEvaluationResult)) {
            return;
        }
        const stackFrame = debugService.getViewModel().focusedStackFrame;
        const session = debugService.getViewModel().focusedSession;
        if (!stackFrame || !session || !session.capabilities.supportsClipboardContext) {
            return;
        }
        try {
            const evaluation = await session.evaluate(element.originalExpression, stackFrame.frameId, 'clipboard');
            return evaluation?.body.result;
        }
        catch (e) {
            return;
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: FOCUS_REPL_ID,
            category: DEBUG_COMMAND_CATEGORY,
            title: localize2({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugFocusConsole' }, "Focus on Debug Console View"),
        });
    }
    async run(accessor) {
        const viewsService = accessor.get(IViewsService);
        const repl = await viewsService.openView(REPL_VIEW_ID);
        await repl?.focus();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvcmVwbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEtBQUssZ0JBQWdCLE1BQU0sNENBQTRDLENBQUM7QUFHL0UsT0FBTyxLQUFLLElBQUksTUFBTSwwQ0FBMEMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUcxRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFN0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0QsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFdEUsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsR0FBRyxJQUFJLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzVELE9BQU8sRUFBZSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN4RixPQUFPLEVBQUUsWUFBWSxFQUFFLG9CQUFvQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMERBQTBE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