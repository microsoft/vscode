/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { QuickDiffWorkbenchController } from './quickDiffDecorator.js';
import { VIEWLET_ID, ISCMService, VIEW_PANE_ID, ISCMViewService, REPOSITORIES_VIEW_PANE_ID, HISTORY_VIEW_PANE_ID } from '../common/scm.js';
import { MenuRegistry, MenuId, registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { SCMActiveResourceContextKeyController, SCMActiveRepositoryController } from './activity.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { SCMService } from '../common/scmService.js';
import { Extensions as ViewContainerExtensions } from '../../../common/views.js';
import { SCMViewPaneContainer } from './scmViewPaneContainer.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ModesRegistry } from '../../../../editor/common/languages/modesRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ContextKeys, SCMViewPane } from './scmViewPane.js';
import { RepositoryPicker, SCMViewService } from './scmViewService.js';
import { SCMRepositoriesViewPane } from './scmRepositoriesViewPane.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Context as SuggestContext } from '../../../../editor/contrib/suggest/browser/suggest.js';
import { InlineCompletionContextKeys } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionContextKeys.js';
import { MANAGE_TRUST_COMMAND_ID, WorkspaceTrustContext } from '../../workspace/common/workspace.js';
import { IQuickDiffService } from '../common/quickDiff.js';
import { QuickDiffService } from '../common/quickDiffService.js';
import { getActiveElement, isActiveElement } from '../../../../base/browser/dom.js';
import { SCMWorkingSetController } from './workingSet.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IListService, WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { isSCMRepository } from './util.js';
import { SCMHistoryViewPane } from './scmHistoryViewPane.js';
import { QuickDiffModelService, IQuickDiffModelService } from './quickDiffModel.js';
import { QuickDiffEditorController } from './quickDiffWidget.js';
import { registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { RemoteNameContext, ResourceContextKey } from '../../../common/contextkeys.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { SCMAccessibilityHelp } from './scmAccessibilityHelp.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { SCMHistoryItemContextContribution } from './scmHistoryChatContext.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../../chat/browser/actions/chatActions.js';
import { SCMInputContextKeys } from './scmInput.js';
import product from '../../../../platform/product/common/product.js';
ModesRegistry.registerLanguage({
    id: 'scminput',
    extensions: [],
    aliases: [], // hide from language selector
    mimetypes: ['text/x-scm-input']
});
Registry.as(WorkbenchExtensions.Workbench)
    .registerWorkbenchContribution(QuickDiffWorkbenchController, 3 /* LifecyclePhase.Restored */);
registerEditorContribution(QuickDiffEditorController.ID, QuickDiffEditorController, 1 /* EditorContributionInstantiation.AfterFirstRender */);
const sourceControlViewIcon = registerIcon('source-control-view-icon', Codicon.sourceControl, localize('sourceControlViewIcon', 'View icon of the Source Control view.'));
const viewContainer = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
    id: VIEWLET_ID,
    title: localize2('source control', 'Source Control'),
    ctorDescriptor: new SyncDescriptor(SCMViewPaneContainer),
    storageId: 'workbench.scm.views.state',
    icon: sourceControlViewIcon,
    alwaysUseContainerInfo: true,
    order: 2,
    hideIfEmpty: true,
}, 0 /* ViewContainerLocation.Sidebar */, { doNotRegisterOpenCommand: true });
const viewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
const containerTitle = localize('source control view', "Source Control");
viewsRegistry.registerViewWelcomeContent(VIEW_PANE_ID, {
    content: localize('no open repo', "No source control providers registered."),
    when: 'default'
});
viewsRegistry.registerViewWelcomeContent(VIEW_PANE_ID, {
    content: localize('no open repo in an untrusted workspace', "None of the registered source control providers work in Restricted Mode."),
    when: ContextKeyExpr.and(ContextKeyExpr.equals('scm.providerCount', 0), WorkspaceTrustContext.IsEnabled, WorkspaceTrustContext.IsTrusted.toNegated())
});
viewsRegistry.registerViewWelcomeContent(VIEW_PANE_ID, {
    content: `[${localize('manageWorkspaceTrustAction', "Manage Workspace Trust")}](command:${MANAGE_TRUST_COMMAND_ID})`,
    when: ContextKeyExpr.and(ContextKeyExpr.equals('scm.providerCount', 0), WorkspaceTrustContext.IsEnabled, WorkspaceTrustContext.IsTrusted.toNegated())
});
viewsRegistry.registerViewWelcomeContent(HISTORY_VIEW_PANE_ID, {
    content: localize('no history items', "The selected source control provider does not have any source control history items."),
    when: ContextKeys.SCMHistoryItemCount.isEqualTo(0)
});
viewsRegistry.registerViews([{
        id: REPOSITORIES_VIEW_PANE_ID,
        containerTitle,
        name: localize2('scmRepositories', "Repositories"),
        singleViewPaneContainerTitle: localize('source control repositories', "Source Control Repositories"),
        ctorDescriptor: new SyncDescriptor(SCMRepositoriesViewPane),
        canToggleVisibility: true,
        hideByDefault: true,
        canMoveView: true,
        weight: 20,
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.has('scm.providerCount'), ContextKeyExpr.notEquals('scm.providerCount', 0)),
        // readonly when = ContextKeyExpr.or(ContextKeyExpr.equals('config.scm.alwaysShowProviders', true), ContextKeyExpr.and(ContextKeyExpr.notEquals('scm.providerCount', 0), ContextKeyExpr.notEquals('scm.providerCount', 1)));
        containerIcon: sourceControlViewIcon
    }], viewContainer);
viewsRegistry.registerViews([{
        id: VIEW_PANE_ID,
        containerTitle,
        name: localize2('scmChanges', 'Changes'),
        singleViewPaneContainerTitle: containerTitle,
        ctorDescriptor: new SyncDescriptor(SCMViewPane),
        canToggleVisibility: true,
        canMoveView: true,
        weight: 40,
        order: 1,
        containerIcon: sourceControlViewIcon,
        openCommandActionDescriptor: {
            id: viewContainer.id,
            mnemonicTitle: localize({ key: 'miViewSCM', comment: ['&& denotes a mnemonic'] }, "Source &&Control"),
            keybindings: {
                primary: 0,
                win: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 37 /* KeyCode.KeyG */ },
                linux: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 37 /* KeyCode.KeyG */ },
                mac: { primary: 256 /* KeyMod.WinCtrl */ | 1024 /* KeyMod.Shift */ | 37 /* KeyCode.KeyG */ },
            },
            order: 2,
        }
    }], viewContainer);
viewsRegistry.registerViews([{
        id: HISTORY_VIEW_PANE_ID,
        containerTitle,
        name: localize2('scmGraph', "Graph"),
        singleViewPaneContainerTitle: localize('source control graph', "Source Control Graph"),
        ctorDescriptor: new SyncDescriptor(SCMHistoryViewPane),
        canToggleVisibility: true,
        canMoveView: true,
        weight: 40,
        order: 2,
        when: ContextKeyExpr.and(ContextKeyExpr.has('scm.historyProviderCount'), ContextKeyExpr.notEquals('scm.historyProviderCount', 0)),
        containerIcon: sourceControlViewIcon
    }], viewContainer);
Registry.as(WorkbenchExtensions.Workbench)
    .registerWorkbenchContribution(SCMActiveRepositoryController, 3 /* LifecyclePhase.Restored */);
Registry.as(WorkbenchExtensions.Workbench)
    .registerWorkbenchContribution(SCMActiveResourceContextKeyController, 3 /* LifecyclePhase.Restored */);
registerWorkbenchContribution2(SCMWorkingSetController.ID, SCMWorkingSetController, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(SCMHistoryItemContextContribution.ID, SCMHistoryItemContextContribution, 3 /* WorkbenchPhase.AfterRestored */);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    id: 'scm',
    order: 5,
    title: localize('scmConfigurationTitle', "Source Control"),
    type: 'object',
    scope: 5 /* ConfigurationScope.RESOURCE */,
    properties: {
        'scm.diffDecorations': {
            type: 'string',
            enum: ['all', 'gutter', 'overview', 'minimap', 'none'],
            enumDescriptions: [
                localize('scm.diffDecorations.all', "Show the diff decorations in all available locations."),
                localize('scm.diffDecorations.gutter', "Show the diff decorations only in the editor gutter."),
                localize('scm.diffDecorations.overviewRuler', "Show the diff decorations only in the overview ruler."),
                localize('scm.diffDecorations.minimap', "Show the diff decorations only in the minimap."),
                localize('scm.diffDecorations.none', "Do not show the diff decorations.")
            ],
            default: 'all',
            description: localize('diffDecorations', "Controls diff decorations in the editor.")
        },
        'scm.diffDecorationsGutterWidth': {
            type: 'number',
            enum: [1, 2, 3, 4, 5],
            default: 3,
            description: localize('diffGutterWidth', "Controls the width(px) of diff decorations in gutter (added & modified).")
        },
        'scm.diffDecorationsGutterVisibility': {
            type: 'string',
            enum: ['always', 'hover'],
            enumDescriptions: [
                localize('scm.diffDecorationsGutterVisibility.always', "Show the diff decorator in the gutter at all times."),
                localize('scm.diffDecorationsGutterVisibility.hover', "Show the diff decorator in the gutter only on hover.")
            ],
            description: localize('scm.diffDecorationsGutterVisibility', "Controls the visibility of the Source Control diff decorator in the gutter."),
            default: 'always'
        },
        'scm.diffDecorationsGutterAction': {
            type: 'string',
            enum: ['diff', 'none'],
            enumDescriptions: [
                localize('scm.diffDecorationsGutterAction.diff', "Show the inline diff Peek view on click."),
                localize('scm.diffDecorationsGutterAction.none', "Do nothing.")
            ],
            description: localize('scm.diffDecorationsGutterAction', "Controls the behavior of Source Control diff gutter decorations."),
            default: 'diff'
        },
        'scm.diffDecorationsGutterPattern': {
            type: 'object',
            description: localize('diffGutterPattern', "Controls whether a pattern is used for the diff decorations in gutter."),
            additionalProperties: false,
            properties: {
                'added': {
                    type: 'boolean',
                    description: localize('diffGutterPatternAdded', "Use pattern for the diff decorations in gutter for added lines."),
                },
                'modified': {
                    type: 'boolean',
                    description: localize('diffGutterPatternModifed', "Use pattern for the diff decorations in gutter for modified lines."),
                },
            },
            default: {
                'added': false,
                'modified': true
            }
        },
        'scm.diffDecorationsIgnoreTrimWhitespace': {
            type: 'string',
            enum: ['true', 'false', 'inherit'],
            enumDescriptions: [
                localize('scm.diffDecorationsIgnoreTrimWhitespace.true', "Ignore leading and trailing whitespace."),
                localize('scm.diffDecorationsIgnoreTrimWhitespace.false', "Do not ignore leading and trailing whitespace."),
                localize('scm.diffDecorationsIgnoreTrimWhitespace.inherit', "Inherit from `diffEditor.ignoreTrimWhitespace`.")
            ],
            description: localize('diffDecorationsIgnoreTrimWhitespace', "Controls whether leading and trailing whitespace is ignored in Source Control diff gutter decorations."),
            default: 'false'
        },
        'scm.alwaysShowActions': {
            type: 'boolean',
            description: localize('alwaysShowActions', "Controls whether inline actions are always visible in the Source Control view."),
            default: false
        },
        'scm.countBadge': {
            type: 'string',
            enum: ['all', 'focused', 'off'],
            enumDescriptions: [
                localize('scm.countBadge.all', "Show the sum of all Source Control Provider count badges."),
                localize('scm.countBadge.focused', "Show the count badge of the focused Source Control Provider."),
                localize('scm.countBadge.off', "Disable the Source Control count badge.")
            ],
            description: localize('scm.countBadge', "Controls the count badge on the Source Control icon on the Activity Bar."),
            default: 'all'
        },
        'scm.providerCountBadge': {
            type: 'string',
            enum: ['hidden', 'auto', 'visible'],
            enumDescriptions: [
                localize('scm.providerCountBadge.hidden', "Hide Source Control Provider count badges."),
                localize('scm.providerCountBadge.auto', "Only show count badge for Source Control Provider when non-zero."),
                localize('scm.providerCountBadge.visible', "Show Source Control Provider count badges.")
            ],
            markdownDescription: localize('scm.providerCountBadge', "Controls the count badges on Source Control Provider headers. These headers appear in the Source Control view when there is more than one provider or when the {0} setting is enabled, and in the Source Control Repositories view.", '\`#scm.alwaysShowRepositories#\`'),
            default: 'hidden'
        },
        'scm.defaultViewMode': {
            type: 'string',
            enum: ['tree', 'list'],
            enumDescriptions: [
                localize('scm.defaultViewMode.tree', "Show the repository changes as a tree."),
                localize('scm.defaultViewMode.list', "Show the repository changes as a list.")
            ],
            description: localize('scm.defaultViewMode', "Controls the default Source Control repository view mode."),
            default: 'list'
        },
        'scm.defaultViewSortKey': {
            type: 'string',
            enum: ['name', 'path', 'status'],
            enumDescriptions: [
                localize('scm.defaultViewSortKey.name', "Sort the repository changes by file name."),
                localize('scm.defaultViewSortKey.path', "Sort the repository changes by path."),
                localize('scm.defaultViewSortKey.status', "Sort the repository changes by Source Control status.")
            ],
            description: localize('scm.defaultViewSortKey', "Controls the default Source Control repository changes sort order when viewed as a list."),
            default: 'path'
        },
        'scm.autoReveal': {
            type: 'boolean',
            description: localize('autoReveal', "Controls whether the Source Control view should automatically reveal and select files when opening them."),
            default: true
        },
        'scm.inputFontFamily': {
            type: 'string',
            markdownDescription: localize('inputFontFamily', "Controls the font for the input message. Use `default` for the workbench user interface font family, `editor` for the `#editor.fontFamily#`'s value, or a custom font family."),
            default: 'default'
        },
        'scm.inputFontSize': {
            type: 'number',
            markdownDescription: localize('inputFontSize', "Controls the font size for the input message in pixels."),
            default: 13
        },
        'scm.inputMaxLineCount': {
            type: 'number',
            markdownDescription: localize('inputMaxLines', "Controls the maximum number of lines that the input will auto-grow to."),
            minimum: 1,
            maximum: 50,
            default: 10
        },
        'scm.inputMinLineCount': {
            type: 'number',
            markdownDescription: localize('inputMinLines', "Controls the minimum number of lines that the input will auto-grow from."),
            minimum: 1,
            maximum: 50,
            default: 1
        },
        'scm.alwaysShowRepositories': {
            type: 'boolean',
            markdownDescription: localize('alwaysShowRepository', "Controls whether repositories should always be visible in the Source Control view."),
            default: false
        },
        'scm.repositories.sortOrder': {
            type: 'string',
            enum: ['discovery time', 'name', 'path'],
            enumDescriptions: [
                localize('scm.repositoriesSortOrder.discoveryTime', "Repositories in the Source Control Repositories view are sorted by discovery time. Repositories in the Source Control view are sorted in the order that they were selected."),
                localize('scm.repositoriesSortOrder.name', "Repositories in the Source Control Repositories and Source Control views are sorted by repository name."),
                localize('scm.repositoriesSortOrder.path', "Repositories in the Source Control Repositories and Source Control views are sorted by repository path.")
            ],
            description: localize('repositoriesSortOrder', "Controls the sort order of the repositories in the source control repositories view."),
            default: 'discovery time'
        },
        'scm.repositories.visible': {
            type: 'number',
            description: localize('providersVisible', "Controls how many repositories are visible in the Source Control Repositories section. Set to 0, to be able to manually resize the view."),
            default: 10
        },
        'scm.repositories.selectionMode': {
            type: 'string',
            enum: ['multiple', 'single'],
            enumDescriptions: [
                localize('scm.repositories.selectionMode.multiple', "Multiple repositories can be selected at the same time."),
                localize('scm.repositories.selectionMode.single', "Only one repository can be selected at a time.")
            ],
            description: localize('scm.repositories.selectionMode', "Controls the selection mode of the repositories in the Source Control Repositories view."),
            default: 'multiple'
        },
        'scm.repositories.explorer': {
            type: 'boolean',
            markdownDescription: localize('scm.repositories.explorer', "Controls whether to show repository artifacts in the Source Control Repositories view. This feature is experimental and only works when {0} is set to `{1}`.", '\`#scm.repositories.selectionMode#\`', 'single'),
            default: false,
            tags: ['experimental']
        },
        'scm.showActionButton': {
            type: 'boolean',
            markdownDescription: localize('showActionButton', "Controls whether an action button can be shown in the Source Control view."),
            default: true
        },
        'scm.showInputActionButton': {
            type: 'boolean',
            markdownDescription: localize('showInputActionButton', "Controls whether an action button can be shown in the Source Control input."),
            default: true
        },
        'scm.workingSets.enabled': {
            type: 'boolean',
            description: localize('scm.workingSets.enabled', "Controls whether to store editor working sets when switching between source control history item groups."),
            default: false
        },
        'scm.workingSets.default': {
            type: 'string',
            enum: ['empty', 'current'],
            enumDescriptions: [
                localize('scm.workingSets.default.empty', "Use an empty working set when switching to a source control history item group that does not have a working set."),
                localize('scm.workingSets.default.current', "Use the current working set when switching to a source control history item group that does not have a working set.")
            ],
            description: localize('scm.workingSets.default', "Controls the default working set to use when switching to a source control history item group that does not have a working set."),
            default: 'current'
        },
        'scm.compactFolders': {
            type: 'boolean',
            description: localize('scm.compactFolders', "Controls whether the Source Control view should render folders in a compact form. In such a form, single child folders will be compressed in a combined tree element."),
            default: true
        },
        'scm.graph.pageOnScroll': {
            type: 'boolean',
            description: localize('scm.graph.pageOnScroll', "Controls whether the Source Control Graph view will load the next page of items when you scroll to the end of the list."),
            default: true
        },
        'scm.graph.pageSize': {
            type: 'number',
            description: localize('scm.graph.pageSize', "The number of items to show in the Source Control Graph view by default and when loading more items."),
            minimum: 1,
            maximum: 1000,
            default: 50
        },
        'scm.graph.badges': {
            type: 'string',
            enum: ['all', 'filter'],
            enumDescriptions: [
                localize('scm.graph.badges.all', "Show badges of all history item groups in the Source Control Graph view."),
                localize('scm.graph.badges.filter', "Show only the badges of history item groups used as a filter in the Source Control Graph view.")
            ],
            description: localize('scm.graph.badges', "Controls which badges are shown in the Source Control Graph view. The badges are shown on the right side of the graph indicating the names of history item groups."),
            default: 'filter'
        },
        'scm.graph.showIncomingChanges': {
            type: 'boolean',
            description: localize('scm.graph.showIncomingChanges', "Controls whether to show incoming changes in the Source Control Graph view."),
            default: true
        },
        'scm.graph.showOutgoingChanges': {
            type: 'boolean',
            description: localize('scm.graph.showOutgoingChanges', "Controls whether to show outgoing changes in the Source Control Graph view."),
            default: true
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'scm.acceptInput',
    metadata: { description: localize('scm accept', "Source Control: Accept Input"), args: [] },
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.has('scmRepository'),
    primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
    handler: accessor => {
        const contextKeyService = accessor.get(IContextKeyService);
        const context = contextKeyService.getContext(getActiveElement());
        const repositoryId = context.getValue('scmRepository');
        if (!repositoryId) {
            return Promise.resolve(null);
        }
        const scmService = accessor.get(ISCMService);
        const repository = scmService.getRepository(repositoryId);
        if (!repository?.provider.acceptInputCommand) {
            return Promise.resolve(null);
        }
        const id = repository.provider.acceptInputCommand.id;
        const args = repository.provider.acceptInputCommand.arguments;
        const commandService = accessor.get(ICommandService);
        return commandService.executeCommand(id, ...(args || []));
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'scm.clearValidation',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(ContextKeyExpr.has('scmRepository'), SCMInputContextKeys.SCMInputHasValidationMessage),
    primary: 9 /* KeyCode.Escape */,
    handler: async (accessor) => {
        const scmViewService = accessor.get(ISCMViewService);
        scmViewService.activeRepository.get()?.repository.input.clearValidation();
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'scm.clearInput',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(ContextKeyExpr.has('scmRepository'), SuggestContext.Visible.toNegated(), InlineCompletionContextKeys.inlineSuggestionVisible.toNegated(), SCMInputContextKeys.SCMInputHasValidationMessage.toNegated(), EditorContextKeys.hasNonEmptySelection.toNegated()),
    primary: 9 /* KeyCode.Escape */,
    handler: async (accessor) => {
        const scmService = accessor.get(ISCMService);
        const contextKeyService = accessor.get(IContextKeyService);
        const context = contextKeyService.getContext(getActiveElement());
        const repositoryId = context.getValue('scmRepository');
        const repository = repositoryId ? scmService.getRepository(repositoryId) : undefined;
        repository?.input.setValue('', true);
    }
});
const viewNextCommitCommand = {
    description: { description: localize('scm view next commit', "Source Control: View Next Commit"), args: [] },
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    handler: (accessor) => {
        const contextKeyService = accessor.get(IContextKeyService);
        const scmService = accessor.get(ISCMService);
        const context = contextKeyService.getContext(getActiveElement());
        const repositoryId = context.getValue('scmRepository');
        const repository = repositoryId ? scmService.getRepository(repositoryId) : undefined;
        repository?.input.showNextHistoryValue();
    }
};
const viewPreviousCommitCommand = {
    description: { description: localize('scm view previous commit', "Source Control: View Previous Commit"), args: [] },
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    handler: (accessor) => {
        const contextKeyService = accessor.get(IContextKeyService);
        const scmService = accessor.get(ISCMService);
        const context = contextKeyService.getContext(getActiveElement());
        const repositoryId = context.getValue('scmRepository');
        const repository = repositoryId ? scmService.getRepository(repositoryId) : undefined;
        repository?.input.showPreviousHistoryValue();
    }
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
    ...viewNextCommitCommand,
    id: 'scm.viewNextCommit',
    when: ContextKeyExpr.and(ContextKeyExpr.has('scmRepository'), ContextKeyExpr.has('scmInputIsInLastPosition'), SuggestContext.Visible.toNegated()),
    primary: 18 /* KeyCode.DownArrow */
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    ...viewPreviousCommitCommand,
    id: 'scm.viewPreviousCommit',
    when: ContextKeyExpr.and(ContextKeyExpr.has('scmRepository'), ContextKeyExpr.has('scmInputIsInFirstPosition'), SuggestContext.Visible.toNegated()),
    primary: 16 /* KeyCode.UpArrow */
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    ...viewNextCommitCommand,
    id: 'scm.forceViewNextCommit',
    when: ContextKeyExpr.has('scmRepository'),
    primary: 512 /* KeyMod.Alt */ | 18 /* KeyCode.DownArrow */
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    ...viewPreviousCommitCommand,
    id: 'scm.forceViewPreviousCommit',
    when: ContextKeyExpr.has('scmRepository'),
    primary: 512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */
});
CommandsRegistry.registerCommand('scm.openInIntegratedTerminal', async (accessor, ...providers) => {
    if (!providers || providers.length === 0) {
        return;
    }
    const commandService = accessor.get(ICommandService);
    const listService = accessor.get(IListService);
    let provider = providers.length === 1 ? providers[0] : undefined;
    if (!provider) {
        const list = listService.lastFocusedList;
        const element = list?.getHTMLElement();
        if (list instanceof WorkbenchList && element && isActiveElement(element)) {
            const [index] = list.getFocus();
            const focusedElement = list.element(index);
            // Source Control Repositories
            if (isSCMRepository(focusedElement)) {
                provider = focusedElement.provider;
            }
        }
    }
    if (!provider?.rootUri) {
        return;
    }
    await commandService.executeCommand('openInIntegratedTerminal', provider.rootUri);
});
CommandsRegistry.registerCommand('scm.openInTerminal', async (accessor, provider) => {
    if (!provider || !provider.rootUri) {
        return;
    }
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand('openInTerminal', provider.rootUri);
});
CommandsRegistry.registerCommand('scm.setActiveProvider', async (accessor) => {
    const instantiationService = accessor.get(IInstantiationService);
    const scmViewService = accessor.get(ISCMViewService);
    const placeHolder = localize('scmActiveRepositoryPlaceHolder', "Select the active repository, type to filter all repositories");
    const autoQuickItemDescription = localize('scmActiveRepositoryAutoDescription', "The active repository is updated based on active editor");
    const repositoryPicker = instantiationService.createInstance(RepositoryPicker, placeHolder, autoQuickItemDescription);
    const result = await repositoryPicker.pickRepository();
    if (result?.repository) {
        const repository = result.repository !== 'auto' ? result.repository : undefined;
        scmViewService.pinActiveRepository(repository);
    }
});
MenuRegistry.appendMenuItem(MenuId.SCMSourceControl, {
    group: '99_terminal',
    command: {
        id: 'scm.openInTerminal',
        title: localize('open in external terminal', "Open in External Terminal")
    },
    when: ContextKeyExpr.and(RemoteNameContext.isEqualTo(''), ContextKeyExpr.equals('scmProviderHasRootUri', true), ContextKeyExpr.or(ContextKeyExpr.equals('config.terminal.sourceControlRepositoriesKind', 'external'), ContextKeyExpr.equals('config.terminal.sourceControlRepositoriesKind', 'both')))
});
MenuRegistry.appendMenuItem(MenuId.SCMSourceControl, {
    group: '99_terminal',
    command: {
        id: 'scm.openInIntegratedTerminal',
        title: localize('open in integrated terminal', "Open in Integrated Terminal")
    },
    when: ContextKeyExpr.and(ContextKeyExpr.equals('scmProviderHasRootUri', true), ContextKeyExpr.or(ContextKeyExpr.equals('config.terminal.sourceControlRepositoriesKind', 'integrated'), ContextKeyExpr.equals('config.terminal.sourceControlRepositoriesKind', 'both')))
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.scm.action.focusPreviousInput',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeys.RepositoryVisibilityCount.notEqualsTo(0),
    handler: async (accessor) => {
        const viewsService = accessor.get(IViewsService);
        const scmView = await viewsService.openView(VIEW_PANE_ID);
        if (scmView) {
            scmView.focusPreviousInput();
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.scm.action.focusNextInput',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeys.RepositoryVisibilityCount.notEqualsTo(0),
    handler: async (accessor) => {
        const viewsService = accessor.get(IViewsService);
        const scmView = await viewsService.openView(VIEW_PANE_ID);
        if (scmView) {
            scmView.focusNextInput();
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.scm.action.focusPreviousResourceGroup',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    handler: async (accessor) => {
        const viewsService = accessor.get(IViewsService);
        const scmView = await viewsService.openView(VIEW_PANE_ID);
        if (scmView) {
            scmView.focusPreviousResourceGroup();
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.scm.action.focusNextResourceGroup',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    handler: async (accessor) => {
        const viewsService = accessor.get(IViewsService);
        const scmView = await viewsService.openView(VIEW_PANE_ID);
        if (scmView) {
            scmView.focusNextResourceGroup();
        }
    }
});
MenuRegistry.appendMenuItem(MenuId.EditorLineNumberContext, {
    title: localize('quickDiffDecoration', "Diff Decorations"),
    submenu: MenuId.SCMQuickDiffDecorations,
    when: ContextKeyExpr.or(ContextKeyExpr.equals('config.scm.diffDecorations', 'all'), ContextKeyExpr.equals('config.scm.diffDecorations', 'gutter')),
    group: '9_quickDiffDecorations'
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'scm.editor.triggerSetup',
            title: localize('scmEditorResolveMergeConflict', "Resolve Conflicts with AI"),
            icon: Codicon.chatSparkle,
            f1: false,
            menu: {
                id: MenuId.EditorContent,
                when: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabled.negate(), ChatContextKeys.Setup.completed.negate(), ContextKeyExpr.in(ResourceContextKey.Resource.key, 'git.mergeChanges'), ContextKeyExpr.equals('git.activeResourceHasMergeConflicts', true))
            }
        });
    }
    async run(accessor, ...args) {
        const commandService = accessor.get(ICommandService);
        const result = await commandService.executeCommand(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID);
        if (!result) {
            return;
        }
        const command = product.defaultChatAgent?.resolveMergeConflictsCommand;
        if (!command) {
            return;
        }
        await commandService.executeCommand(command, ...args);
    }
});
registerSingleton(ISCMService, SCMService, 1 /* InstantiationType.Delayed */);
registerSingleton(ISCMViewService, SCMViewService, 1 /* InstantiationType.Delayed */);
registerSingleton(IQuickDiffService, QuickDiffService, 1 /* InstantiationType.Delayed */);
registerSingleton(IQuickDiffModelService, QuickDiffModelService, 1 /* InstantiationType.Delayed */);
AccessibleViewRegistry.register(new SCMAccessibilityHelp());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NtLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9icm93c2VyL3NjbS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFtQyw4QkFBOEIsRUFBRSxVQUFVLElBQUksbUJBQW1CLEVBQWtCLE1BQU0sa0NBQWtDLENBQUM7QUFDdEssT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdkUsT0FBTyxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFnQixlQUFlLEVBQUUseUJBQXlCLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUV6SixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEgsT0FBTyxFQUFFLHFDQUFxQyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sZUFBZSxDQUFDO0FBRXJHLE9BQU8sRUFBMEIsVUFBVSxJQUFJLHVCQUF1QixFQUFzQixNQUFNLG9FQUFvRSxDQUFDO0FBQ3ZLLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDckcsT0FBTyxFQUFFLG1CQUFtQixFQUFvQixNQUFNLCtEQUErRCxDQUFDO0FBQ3RILE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMv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