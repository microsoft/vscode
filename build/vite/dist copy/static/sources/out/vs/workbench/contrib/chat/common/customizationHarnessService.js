/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { observableValue } from '../../../../base/common/observable.js';
import { joinPath } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AICustomizationManagementSection } from './aiCustomizationWorkspaceService.js';
import { PromptsType } from './promptSyntax/promptTypes.js';
import { AGENT_MD_FILENAME } from './promptSyntax/config/promptFileLocations.js';
import { PromptsStorage } from './promptSyntax/service/promptsService.js';
export const ICustomizationHarnessService = createDecorator('customizationHarnessService');
/**
 * Identifies the AI harness (execution environment) that customizations
 * are filtered for. Storage answers "where did this come from?"; harness
 * answers "who consumes it?".
 */
export var CustomizationHarness;
(function (CustomizationHarness) {
    CustomizationHarness["VSCode"] = "vscode";
    CustomizationHarness["CLI"] = "cli";
    CustomizationHarness["Claude"] = "claude";
})(CustomizationHarness || (CustomizationHarness = {}));
// #region Shared filter constants
/**
 * Hooks filter — local, user, and plugin sources.
 */
const HOOKS_FILTER = {
    sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin],
};
// #endregion
// #region Well-known user directories
/**
 * Returns the user-home directories accessible to the Copilot CLI harness.
 */
export function getCliUserRoots(userHome) {
    return [
        joinPath(userHome, '.copilot'),
        joinPath(userHome, '.claude'),
        joinPath(userHome, '.agents'),
    ];
}
/**
 * Returns the user-home directories accessible to the Claude harness.
 */
export function getClaudeUserRoots(userHome) {
    return [joinPath(userHome, '.claude')];
}
// #endregion
// #region Harness descriptor factories
/**
 * Builds the full source list from the base set (local, user, plugin)
 * plus any additional sources specific to the window type.
 *
 * Core passes `[PromptsStorage.extension]`; sessions passes its
 * BUILTIN_STORAGE constant.
 */
function buildAllSources(extras) {
    return [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin, ...extras];
}
/**
 * Creates a "VS Code" harness descriptor that shows all storage sources
 * with no user-root restrictions.
 */
export function createVSCodeHarnessDescriptor(extras) {
    const filter = { sources: buildAllSources(extras) };
    return {
        id: CustomizationHarness.VSCode,
        label: localize('harness.local', "Local"),
        icon: ThemeIcon.fromId(Codicon.vm.id),
        sectionOverrides: new Map([
            [AICustomizationManagementSection.Instructions, {
                    rootFileShortcuts: [AGENT_MD_FILENAME],
                }],
        ]),
        getStorageSourceFilter: () => filter,
    };
}
function createRestrictedHarnessDescriptor(id, label, icon, restrictedUserRoots, extras, options) {
    const allSources = buildAllSources(extras);
    const allRootsFilter = { sources: allSources };
    const restrictedFilter = { sources: allSources, includedUserFileRoots: restrictedUserRoots };
    return {
        id,
        label,
        icon,
        hiddenSections: options?.hiddenSections,
        workspaceSubpaths: options?.workspaceSubpaths,
        hideGenerateButton: options?.hideGenerateButton,
        sectionOverrides: options?.sectionOverrides,
        requiredAgentId: options?.requiredAgentId,
        instructionFileFilter: options?.instructionFileFilter,
        getStorageSourceFilter(type) {
            if (type === PromptsType.hook) {
                return HOOKS_FILTER;
            }
            if (type === PromptsType.prompt) {
                return allRootsFilter;
            }
            return restrictedFilter;
        },
    };
}
/**
 * Creates a "Copilot CLI" harness descriptor.
 */
export function createCliHarnessDescriptor(cliUserRoots, extras) {
    return createRestrictedHarnessDescriptor(CustomizationHarness.CLI, localize('harness.cli', "Copilot CLI"), ThemeIcon.fromId(Codicon.worktree.id), cliUserRoots, extras, {
        hideGenerateButton: true,
        requiredAgentId: 'copilotcli',
        workspaceSubpaths: ['.github', '.copilot', '.agents', '.claude'],
        sectionOverrides: new Map([
            [AICustomizationManagementSection.Instructions, {
                    rootFileShortcuts: [AGENT_MD_FILENAME],
                }],
        ]),
    });
}
/**
 * Creates a "Claude" harness descriptor.
 * Claude does not support prompt files (.prompt.md), AGENTS.md, or extension-contributed plugins.
 * It supports agents (.claude/agents/), instructions (CLAUDE.md, .claude/rules/),
 * skills (.claude/skills/), and hooks (.claude/settings.json).
 */
export function createClaudeHarnessDescriptor(claudeRoots, extras) {
    return createRestrictedHarnessDescriptor(CustomizationHarness.Claude, localize('harness.claude', "Claude"), ThemeIcon.fromId(Codicon.claude.id), claudeRoots, extras, {
        hiddenSections: [AICustomizationManagementSection.Prompts, AICustomizationManagementSection.Plugins],
        workspaceSubpaths: ['.claude'],
        hideGenerateButton: true,
        requiredAgentId: 'claude-code',
        sectionOverrides: new Map([
            [AICustomizationManagementSection.Hooks, {
                    label: localize('claudeHooks', "Configure Claude Hooks"),
                    commandId: 'copilot.claude.hooks',
                }],
            [AICustomizationManagementSection.Instructions, {
                    label: localize('addClaudeMd', "Add CLAUDE.md"),
                    rootFile: 'CLAUDE.md',
                    typeLabel: localize('rule', "Rule"),
                    fileExtension: '.md',
                }],
        ]),
        instructionFileFilter: ['CLAUDE.md', 'CLAUDE.local.md', '.claude/rules/', 'copilot-instructions.md'],
    });
}
// #endregion
// #region Helpers
/**
 * Tests whether a file path belongs to one of the given workspace sub-paths.
 * Matches on path segment boundaries to avoid false positives
 * (e.g. `.claude` must appear as `/.claude/` in the path, not as part of
 * a longer segment like `not.claude`).
 */
export function matchesWorkspaceSubpath(filePath, subpaths) {
    return subpaths.some(sp => filePath.includes(`/${sp}/`) || filePath.endsWith(`/${sp}`));
}
/**
 * Tests whether an instruction file matches one of the harness's recognized
 * instruction file patterns. Patterns can be exact filenames (e.g. `CLAUDE.md`)
 * or path prefixes ending with `/` (e.g. `.claude/rules/`).
 */
export function matchesInstructionFileFilter(filePath, filters) {
    const name = filePath.substring(filePath.lastIndexOf('/') + 1);
    return filters.some(f => {
        if (f.endsWith('/')) {
            // Path prefix: check if the file is under this directory
            return filePath.includes(`/${f}`) || filePath.startsWith(f);
        }
        return name === f;
    });
}
// #endregion
// #region Base implementation
/**
 * Reusable base implementation of {@link ICustomizationHarnessService}.
 * Concrete registrations only need to supply the list of harness
 * descriptors and a default harness id.
 */
export class CustomizationHarnessServiceBase {
    constructor(staticHarnesses, defaultHarness) {
        this._externalHarnesses = [];
        this._staticHarnesses = staticHarnesses;
        this._activeHarness = observableValue(this, defaultHarness);
        this.activeHarness = this._activeHarness;
        this._availableHarnesses = observableValue(this, [...this._staticHarnesses]);
        this.availableHarnesses = this._availableHarnesses;
    }
    _getAllHarnesses() {
        // External harnesses shadow static ones with the same id so that
        // extension-contributed harnesses can upgrade a built-in entry.
        const externalIds = new Set(this._externalHarnesses.map(h => h.id));
        return [
            ...this._staticHarnesses.filter(h => !externalIds.has(h.id)),
            ...this._externalHarnesses,
        ];
    }
    _refreshAvailableHarnesses() {
        this._availableHarnesses.set(this._getAllHarnesses(), undefined);
    }
    registerExternalHarness(descriptor) {
        this._externalHarnesses.push(descriptor);
        this._refreshAvailableHarnesses();
        return {
            dispose: () => {
                const idx = this._externalHarnesses.indexOf(descriptor);
                if (idx >= 0) {
                    this._externalHarnesses.splice(idx, 1);
                    this._refreshAvailableHarnesses();
                    // If the removed harness was active, only fall back when no
                    // remaining harness (e.g. the restored static one) shares the id.
                    if (this._activeHarness.get() === descriptor.id) {
                        const all = this._getAllHarnesses();
                        if (!all.some(h => h.id === descriptor.id) && all.length > 0) {
                            this._activeHarness.set(all[0].id, undefined);
                        }
                    }
                }
            }
        };
    }
    setActiveHarness(id) {
        if (this._getAllHarnesses().some(h => h.id === id)) {
            this._activeHarness.set(id, undefined);
        }
    }
    getStorageSourceFilter(type) {
        const activeId = this._activeHarness.get();
        const all = this._getAllHarnesses();
        const descriptor = all.find(h => h.id === activeId);
        return descriptor?.getStorageSourceFilter(type) ?? all[0].getStorageSourceFilter(type);
    }
    getActiveDescriptor() {
        const activeId = this._activeHarness.get();
        const all = this._getAllHarnesses();
        return all.find(h => h.id === activeId) ?? all[0];
    }
}
// #endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQW9DLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRzFHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsZ0NBQWdDLEVBQXdCLE1BQU0sc0NBQXNDLENBQUM7QUFDOUcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzVELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUcxRSxNQUFNLENBQUMsTUFBTSw0QkFBNEIsR0FBRyxlQUFlLENBQStCLDZCQUE2QixDQUFDLENBQUM7QUFvQ3pIOzs7O0dBSUc7QUFDSCxNQUFNLENBQU4sSUFBWSxvQkFJWDtBQUpELFdBQVksb0JBQW9CO0lBQy9CLHlDQUFpQixDQUFBO0lBQ2pCLG1DQUFXLENBQUE7SUFDWCx5Q0FBaUIsQ0FBQTtBQUNsQixDQUFDLEVBSlcsb0JBQW9CLEtBQXBCLG9CQUFvQixRQUkvQjtBQTRMRCxrQ0FBa0M7QUFFbEM7O0dBRUc7QUFD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