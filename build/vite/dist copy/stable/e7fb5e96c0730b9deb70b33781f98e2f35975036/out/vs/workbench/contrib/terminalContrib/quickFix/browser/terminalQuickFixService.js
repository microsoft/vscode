/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../../services/extensions/common/extensionsRegistry.js';
export class TerminalQuickFixService {
    get providers() { return this._providers; }
    constructor() {
        this._selectors = new Map();
        this._providers = new Map();
        this._pendingProviders = new Map();
        this._onDidRegisterProvider = new Emitter();
        this.onDidRegisterProvider = this._onDidRegisterProvider.event;
        this._onDidRegisterCommandSelector = new Emitter();
        this.onDidRegisterCommandSelector = this._onDidRegisterCommandSelector.event;
        this._onDidUnregisterProvider = new Emitter();
        this.onDidUnregisterProvider = this._onDidUnregisterProvider.event;
        this.extensionQuickFixes = new Promise((r) => quickFixExtensionPoint.setHandler(fixes => {
            r(fixes.filter(c => isProposedApiEnabled(c.description, 'terminalQuickFixProvider')).map(c => {
                if (!c.value) {
                    return [];
                }
                return c.value.map(fix => { return { ...fix, extensionIdentifier: c.description.identifier.value }; });
            }).flat());
        }));
        this.extensionQuickFixes.then(selectors => {
            for (const selector of selectors) {
                this.registerCommandSelector(selector);
            }
        });
    }
    registerCommandSelector(selector) {
        this._selectors.set(selector.id, selector);
        this._onDidRegisterCommandSelector.fire(selector);
        // Check if there's a pending provider for this selector
        const pendingProvider = this._pendingProviders.get(selector.id);
        if (pendingProvider) {
            this._pendingProviders.delete(selector.id);
            this._providers.set(selector.id, pendingProvider);
            this._onDidRegisterProvider.fire({ selector, provider: pendingProvider });
        }
    }
    registerQuickFixProvider(id, provider) {
        // This is more complicated than it looks like it should be because we need to return an
        // IDisposable synchronously but we must await ITerminalContributionService.quickFixes
        // asynchronously before actually registering the provider.
        let disposed = false;
        this.extensionQuickFixes.then(() => {
            if (disposed) {
                return;
            }
            const selector = this._selectors.get(id);
            if (selector) {
                // Selector is already available, register immediately
                this._providers.set(id, provider);
                this._onDidRegisterProvider.fire({ selector, provider });
            }
            else {
                // Selector not yet available, store provider as pending
                this._pendingProviders.set(id, provider);
            }
        });
        return toDisposable(() => {
            disposed = true;
            this._providers.delete(id);
            this._pendingProviders.delete(id);
            const selector = this._selectors.get(id);
            if (selector) {
                this._selectors.delete(id);
                this._onDidUnregisterProvider.fire(selector.id);
            }
        });
    }
}
const quickFixExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'terminalQuickFixes',
    defaultExtensionKind: ['workspace'],
    activationEventsGenerator: function* (terminalQuickFixes) {
        for (const quickFixContrib of terminalQuickFixes ?? []) {
            yield `onTerminalQuickFixRequest:${quickFixContrib.id}`;
        }
    },
    jsonSchema: {
        description: localize('vscode.extension.contributes.terminalQuickFixes', 'Contributes terminal quick fixes.'),
        type: 'array',
        items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'commandLineMatcher', 'outputMatcher', 'commandExitResult'],
            defaultSnippets: [{
                    body: {
                        id: '$1',
                        commandLineMatcher: '$2',
                        outputMatcher: '$3',
                        exitStatus: '$4'
                    }
                }],
            properties: {
                id: {
                    description: localize('vscode.extension.contributes.terminalQuickFixes.id', "The ID of the quick fix provider"),
                    type: 'string',
                },
                commandLineMatcher: {
                    description: localize('vscode.extension.contributes.terminalQuickFixes.commandLineMatcher', "A regular expression or string to test the command line against"),
                    type: 'string',
                },
                outputMatcher: {
                    markdownDescription: localize('vscode.extension.contributes.terminalQuickFixes.outputMatcher', "A regular expression or string to match a single line of the output against, which provides groups to be referenced in terminalCommand and uri.\n\nFor example:\n\n `lineMatcher: /git push --set-upstream origin (?<branchName>[^\s]+)/;`\n\n`terminalCommand: 'git push --set-upstream origin ${group:branchName}';`\n"),
                    type: 'object',
                    required: ['lineMatcher', 'anchor', 'offset', 'length'],
                    properties: {
                        lineMatcher: {
                            description: 'A regular expression or string to test the command line against',
                            type: 'string'
                        },
                        anchor: {
                            description: 'Where the search should begin in the buffer',
                            enum: ['top', 'bottom']
                        },
                        offset: {
                            description: 'The number of lines vertically from the anchor in the buffer to start matching against',
                            type: 'number'
                        },
                        length: {
                            description: 'The number of rows to match against, this should be as small as possible for performance reasons',
                            type: 'number'
                        }
                    }
                },
                commandExitResult: {
                    description: localize('vscode.extension.contributes.terminalQuickFixes.commandExitResult', "The command exit result to match on"),
                    enum: ['success', 'error'],
                    enumDescriptions: [
                        'The command exited with an exit code of zero.',
                        'The command exited with a non-zero exit code.'
                    ]
                },
                kind: {
                    description: localize('vscode.extension.contributes.terminalQuickFixes.kind', "The kind of the resulting quick fix. This changes how the quick fix is presented. Defaults to {0}.", '`"fix"`'),
                    enum: ['default', 'explain'],
                    enumDescriptions: [
                        'A high confidence quick fix.',
                        'An explanation of the problem.'
                    ]
                }
            },
        }
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxRdWlja0ZpeFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvcXVpY2tGaXgvYnJvd3Nlci90ZXJtaW5hbFF1aWNrRml4U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFlLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUdqRCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM1RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUVsRyxNQUFNLE9BQU8sdUJBQXVCO0lBTW5DLElBQUksU0FBUyxLQUE2QyxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0lBYW5GO1FBaEJRLGVBQVUsR0FBMEMsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUU5RCxlQUFVLEdBQTJDLElBQUksR0FBRyxFQUFFLENBQUM7UUFHL0Qsc0JBQWlCLEdBQTJDLElBQUksR0FBRyxFQUFFLENBQUM7UUFFN0QsMkJBQXNCLEdBQUcsSUFBSSxPQUFPLEVBQXFDLENBQUM7UUFDbEYsMEJBQXFCLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEtBQUssQ0FBQztRQUNsRCxrQ0FBNkIsR0FBRyxJQUFJLE9BQU8sRUFBNEIsQ0FBQztRQUNoRixpQ0FBNEIsR0FBRyxJQUFJLENBQUMsNkJBQTZCLENBQUMsS0FBSyxDQUFDO1FBQ2hFLDZCQUF3QixHQUFHLElBQUksT0FBTyxFQUFVLENBQUM7UUFDekQsNEJBQXVCLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQztRQUt0RSxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLHNCQUFzQixDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUN2RixDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsMEJBQTBCLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDNUYsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDZCxPQUFPLEVBQUUsQ0FBQztnQkFDWCxDQUFDO2dCQUNELE9BQU8sQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxPQUFPLEVBQUUsR0FBRyxHQUFHLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4RyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ1osQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDekMsS0FBSyxNQUFNLFFBQVEsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDbEMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3hDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCx1QkFBdUIsQ0FBQyxRQUFrQztRQUN6RCxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzNDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFbEQsd0RBQXdEO1FBQ3hELE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2hFLElBQUksZUFBZSxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDM0MsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUNsRCxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLENBQUM7SUFDRixDQUFDO0lBRUQsd0JBQXdCLENBQUMsRUFBVSxFQUFFLFFBQW1DO1FBQ3ZFLHdGQUF3RjtRQUN4RixzRkFBc0Y7UUFDdEYsMkRBQTJEO1FBQzNELElBQUksUUFBUSxHQUFHLEtBQUssQ0FBQztRQUNyQixJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUNsQyxJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUNkLE9BQU87WUFDUixDQUFDO1lBQ0QsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDekMsSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDZCxzREFBc0Q7Z0JBQ3RELElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDbEMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQzFELENBQUM7aUJBQU0sQ0FBQztnQkFDUCx3REFBd0Q7Z0JBQ3hELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzFDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUNILE9BQU8sWUFBWSxDQUFDLEdBQUcsRUFBRTtZQUN4QixRQUFRLEdBQUcsSUFBSSxDQUFDO1lBQ2hCLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQzNCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDekMsSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDZCxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDM0IsSUFBSSxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDakQsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEO0FBRUQsTUFBTSxzQkFBc0IsR0FBRyxrQkFBa0IsQ0FBQyxzQkFBc0IsQ0FBNkI7SUFDcEcsY0FBYyxFQUFFLG9CQUFvQjtJQUNwQyxvQkFBb0IsRUFBRSxDQUFDLFdBQVcsQ0FBQztJQUNuQyx5QkFBeUIsRUFBRSxRQUFRLENBQUMsRUFBRSxrQkFBdUQ7UUFDNUYsS0FBSyxNQUFNLGVBQWUsSUFBSSxrQkFBa0IsSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUN4RCxNQUFNLDZCQUE2QixlQUFlLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDekQsQ0FBQztJQUNGLENBQUM7SUFDRCxVQUFVLEVBQUU7UUFDWCxXQUFXLEVBQUUsUUFBUSxDQUFDLGlEQUFpRCxFQUFFLG1DQUFtQyxDQUFDO1FBQzdHLElBQUksRUFBRSxPQUFPO1FBQ2IsS0FBSyxFQUFFO1lBQ04sSUFBSSxFQUFFLFFBQVE7WUFDZCxvQkFBb0IsRUFBRSxLQUFLO1lBQzNCLFFBQVEsRUFBRSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRSxlQUFlLEVBQUUsbUJBQW1CLENBQUM7WUFDNUUsZUFBZSxFQUFFLENBQUM7b0JBQ2pCLElBQUksRUFBRTt3QkFDTCxFQUFFLEVBQUUsSUFBSTt3QkFDUixrQkFBa0IsRUFBRSxJQUFJO3dCQUN4QixhQUFhLEVBQUUsSUFBSTt3QkFDbkIsVUFBVSxFQUFFLElBQUk7cUJBQ2hCO2lCQUNELENBQUM7WUFDRixVQUFVLEVBQUU7Z0JBQ1gsRUFBRSxFQUFFO29CQUNILFdBQVcsRUFBRSxRQUFRLENBQUMsb0RBQW9ELEVBQUUsa0NBQWtDLENBQUM7b0JBQy9HLElBQUksRUFBRSxRQUFRO2lCQUNkO2dCQUNELGtCQUFrQixFQUFFO29CQUNuQixXQUFXLEVBQUUsUUFBUSxDQUFDLG9FQUFvRSxFQUFFLGlFQUFpRSxDQUFDO29CQUM5SixJQUFJLEVBQUUsUUFBUTtpQkFDZDtnQkFDRCxhQUFhLEVBQUU7b0JBQ2QsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLCtEQUErRCxFQUFFLDBUQUEwVCxDQUFDO29CQUMxWixJQUFJLEVBQUUsUUFBUTtvQkFDZCxRQUFRLEVBQUUsQ0FBQyxhQUFhLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUM7b0JBQ3ZELFVBQVUsRUFBRTt3QkFDWCxXQUFXLEVBQUU7NEJBQ1osV0FBVyxFQUFFLGlFQUFpRTs0QkFDOUUsSUFBSSxFQUFFLFFBQVE7eUJBQ2Q7d0JBQ0QsTUFBTSxFQUFFOzRCQUNQLFdBQVcsRUFBRSw2Q0FBNkM7NEJBQzFELElBQUksRUFBRSxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUM7eUJBQ3ZCO3dCQUNELE1BQU0sRUFBRTs0QkFDUCxXQUFXLEVBQUUsd0ZBQXdGOzRCQUNyRyxJQUFJLEVBQUUsUUFBUTt5QkFDZDt3QkFDRCxNQUFNLEVBQUU7NEJBQ1AsV0FBVyxFQUFFLGtHQUFrRzs0QkFDL0csSUFBSSxFQUFFLFFBQVE7eUJBQ2Q7cUJBQ0Q7aUJBQ0Q7Z0JBQ0QsaUJBQWlCLEVBQUU7b0JBQ2xCLFdBQVcsRUFBRSxRQUFRLENBQUMsbUVBQW1FLEVBQUUscUNBQXFDLENBQUM7b0JBQ2pJLElBQUksRUFBRSxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUM7b0JBQzFCLGdCQUFnQixFQUFFO3dCQUNqQiwrQ0FBK0M7d0JBQy9DLCtDQUErQztxQkFDL0M7aUJBQ0Q7Z0JBQ0QsSUFBSSxFQUFFO29CQUNMLFdBQVcsRUFBRSxRQUFRLENBQUMsc0RBQXNELEVBQUUsb0dBQW9HLEVBQUUsU0FBUyxDQUFDO29CQUM5TCxJQUFJLEVBQUUsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDO29CQUM1QixnQkFBZ0IsRUFBRTt3QkFDakIsOEJBQThCO3dCQUM5QixnQ0FBZ0M7cUJBQ2hDO2lCQUNEO2FBQ0Q7U0FDRDtLQUNEO0NBQ0QsQ0FBQyxDQUFDIn0=