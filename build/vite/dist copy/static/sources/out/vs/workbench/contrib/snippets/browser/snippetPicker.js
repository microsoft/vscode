/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { ISnippetsService } from './snippets.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
export async function pickSnippet(accessor, languageIdOrSnippets, resourceUri) {
    const snippetService = accessor.get(ISnippetsService);
    const quickInputService = accessor.get(IQuickInputService);
    let snippets;
    if (Array.isArray(languageIdOrSnippets)) {
        snippets = languageIdOrSnippets;
    }
    else {
        snippets = (await snippetService.getSnippets(languageIdOrSnippets, resourceUri, { includeDisabledSnippets: true, includeNoPrefixSnippets: true }));
    }
    snippets.sort((a, b) => a.snippetSource - b.snippetSource);
    const makeSnippetPicks = () => {
        const result = [];
        let prevSnippet;
        for (const snippet of snippets) {
            const pick = {
                label: snippet.prefix || snippet.name,
                detail: snippet.description || snippet.body,
                snippet
            };
            if (!prevSnippet || prevSnippet.snippetSource !== snippet.snippetSource || prevSnippet.source !== snippet.source) {
                let label = '';
                switch (snippet.snippetSource) {
                    case 1 /* SnippetSource.User */:
                        label = nls.localize('sep.userSnippet', "User Snippets");
                        break;
                    case 3 /* SnippetSource.Extension */:
                        label = snippet.source;
                        break;
                    case 2 /* SnippetSource.Workspace */:
                        label = nls.localize('sep.workspaceSnippet', "Workspace Snippets");
                        break;
                }
                result.push({ type: 'separator', label });
            }
            if (snippet.snippetSource === 3 /* SnippetSource.Extension */) {
                const isEnabled = snippetService.isEnabled(snippet);
                if (isEnabled) {
                    pick.buttons = [{
                            iconClass: ThemeIcon.asClassName(Codicon.eyeClosed),
                            tooltip: nls.localize('disableSnippet', 'Hide from IntelliSense')
                        }];
                }
                else {
                    pick.description = nls.localize('isDisabled', "(hidden from IntelliSense)");
                    pick.buttons = [{
                            iconClass: ThemeIcon.asClassName(Codicon.eye),
                            tooltip: nls.localize('enable.snippet', 'Show in IntelliSense')
                        }];
                }
            }
            result.push(pick);
            prevSnippet = snippet;
        }
        return result;
    };
    const disposables = new DisposableStore();
    const picker = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
    picker.placeholder = nls.localize('pick.placeholder', "Select a snippet");
    picker.matchOnDetail = true;
    picker.ignoreFocusOut = false;
    picker.keepScrollPosition = true;
    disposables.add(picker.onDidTriggerItemButton(ctx => {
        const isEnabled = snippetService.isEnabled(ctx.item.snippet);
        snippetService.updateEnablement(ctx.item.snippet, !isEnabled);
        picker.items = makeSnippetPicks();
    }));
    picker.items = makeSnippetPicks();
    if (!picker.items.length) {
        picker.validationMessage = nls.localize('pick.noSnippetAvailable', "No snippet available");
    }
    picker.show();
    // wait for an item to be picked or the picker to become hidden
    await Promise.race([Event.toPromise(picker.onDidAccept), Event.toPromise(picker.onDidHide)]);
    const result = picker.selectedItems[0]?.snippet;
    disposables.dispose();
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldFBpY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NuaXBwZXRzL2Jyb3dzZXIvc25pcHBldFBpY2tlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUVqRCxPQUFPLEVBQWtCLGtCQUFrQixFQUFrQixNQUFNLHNEQUFzRCxDQUFDO0FBQzFILE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXpELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUd2RSxNQUFNLENBQUMsS0FBSyxVQUFVLFdBQVcsQ0FBQyxRQUEwQixFQUFFLG9CQUF3QyxFQUFFLFdBQWlCO0lBRXhILE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUN0RCxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQU0zRCxJQUFJLFFBQW1CLENBQUM7SUFDeEIsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQztRQUN6QyxRQUFRLEdBQUcsb0JBQW9CLENBQUM7SUFDakMsQ0FBQztTQUFNLENBQUM7UUFDUCxRQUFRLEdBQUcsQ0FBQyxNQUFNLGNBQWMsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLEVBQUUsV0FBVyxFQUFFLEVBQUUsdUJBQXVCLEVBQUUsSUFBSSxFQUFF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