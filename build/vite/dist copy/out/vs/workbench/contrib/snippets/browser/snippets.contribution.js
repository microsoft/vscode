/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import * as JSONContributionRegistry from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { ConfigureSnippetsAction } from './commands/configureSnippets.js';
import { ApplyFileSnippetAction } from './commands/fileTemplateSnippets.js';
import { InsertSnippetAction } from './commands/insertSnippet.js';
import { SurroundWithSnippetEditorAction } from './commands/surroundWithSnippet.js';
import { SnippetCodeActions } from './snippetCodeActionProvider.js';
import { ISnippetsService } from './snippets.js';
import { SnippetsService } from './snippetsService.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import './tabCompletion.js';
import { editorConfigurationBaseNode } from '../../../../editor/common/config/editorConfigurationSchema.js';
// service
registerSingleton(ISnippetsService, SnippetsService, 1 /* InstantiationType.Delayed */);
// actions
registerAction2(InsertSnippetAction);
CommandsRegistry.registerCommandAlias('editor.action.showSnippets', 'editor.action.insertSnippet');
registerAction2(SurroundWithSnippetEditorAction);
registerAction2(ApplyFileSnippetAction);
registerAction2(ConfigureSnippetsAction);
// workbench contribs
const workbenchContribRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchContribRegistry.registerWorkbenchContribution(SnippetCodeActions, 3 /* LifecyclePhase.Restored */);
// config
Registry
    .as(Extensions.Configuration)
    .registerConfiguration({
    ...editorConfigurationBaseNode,
    'properties': {
        'editor.snippets.codeActions.enabled': {
            'description': nls.localize('editor.snippets.codeActions.enabled', 'Controls if surround-with-snippets or file template snippets show as Code Actions.'),
            'type': 'boolean',
            'default': true
        }
    }
});
// schema
const languageScopeSchemaId = 'vscode://schemas/snippets';
const snippetSchemaProperties = {
    prefix: {
        description: nls.localize('snippetSchema.json.prefix', 'The prefix to use when selecting the snippet in intellisense'),
        type: ['string', 'array']
    },
    isFileTemplate: {
        description: nls.localize('snippetSchema.json.isFileTemplate', 'The snippet is meant to populate or replace a whole file'),
        type: 'boolean'
    },
    body: {
        markdownDescription: nls.localize('snippetSchema.json.body', 'The snippet content. Use `$1`, `${1:defaultText}` to define cursor positions, use `$0` for the final cursor position. Insert variable values with `${varName}` and `${varName:defaultText}`, e.g. `This is file: $TM_FILENAME`.'),
        type: ['string', 'array'],
        items: {
            type: 'string'
        }
    },
    description: {
        description: nls.localize('snippetSchema.json.description', 'The snippet description.'),
        type: ['string', 'array']
    },
    include: {
        markdownDescription: nls.localize('snippetSchema.json.include', 'A list of [glob patterns](https://aka.ms/vscode-glob-patterns) to include the snippet for specific files, e.g. `["**/*.test.ts", "*.spec.ts"]` or `"**/*.spec.ts"`. Patterns will match on the absolute path of a file if they contain a path separator and will match on the name of the file otherwise. You can exclude matching files via the `exclude` property.'),
        type: ['string', 'array'],
        items: {
            type: 'string'
        }
    },
    exclude: {
        markdownDescription: nls.localize('snippetSchema.json.exclude', 'A list of [glob patterns](https://aka.ms/vscode-glob-patterns) to exclude the snippet from specific files, e.g. `["**/*.min.js"]` or `"*.min.js"`. Patterns will match on the absolute path of a file if they contain a path separator and will match on the name of the file otherwise. Exclude patterns take precedence over `include` patterns.'),
        type: ['string', 'array'],
        items: {
            type: 'string'
        }
    }
};
const languageScopeSchema = {
    id: languageScopeSchemaId,
    allowComments: true,
    allowTrailingCommas: true,
    defaultSnippets: [{
            label: nls.localize('snippetSchema.json.default', "Empty snippet"),
            body: { '${1:snippetName}': { 'prefix': '${2:prefix}', 'body': '${3:snippet}', 'description': '${4:description}' } }
        }],
    type: 'object',
    description: nls.localize('snippetSchema.json', 'User snippet configuration'),
    additionalProperties: {
        type: 'object',
        required: ['body'],
        properties: snippetSchemaProperties,
        additionalProperties: false
    }
};
const globalSchemaId = 'vscode://schemas/global-snippets';
const globalSchema = {
    id: globalSchemaId,
    allowComments: true,
    allowTrailingCommas: true,
    defaultSnippets: [{
            label: nls.localize('snippetSchema.json.default', "Empty snippet"),
            body: { '${1:snippetName}': { 'scope': '${2:scope}', 'prefix': '${3:prefix}', 'body': '${4:snippet}', 'description': '${5:description}' } }
        }],
    type: 'object',
    description: nls.localize('snippetSchema.json', 'User snippet configuration'),
    additionalProperties: {
        type: 'object',
        required: ['body'],
        properties: {
            ...snippetSchemaProperties,
            scope: {
                description: nls.localize('snippetSchema.json.scope', "A list of language names to which this snippet applies, e.g. 'typescript,javascript'."),
                type: 'string'
            }
        },
        additionalProperties: false
    }
};
const reg = Registry.as(JSONContributionRegistry.Extensions.JSONContribution);
reg.registerSchema(languageScopeSchemaId, languageScopeSchema);
reg.registerSchema(globalSchemaId, globalSchema);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHMuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc25pcHBldHMvYnJvd3Nlci9zbmlwcGV0cy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDcEYsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sS0FBSyx3QkFBd0IsTUFBTSxxRUFBcUUsQ0FBQztBQUNoSCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsSUFBSSxtQkFBbUIsRUFBbUMsTUFBTSxrQ0FBa0MsQ0FBQztBQUN0SCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRSxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDakQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRXZELE9BQU8sRUFBRSxVQUFVLEVBQTBCLE1BQU0sb0VBQW9FLENBQUM7QUFFeEgsT0FBTyxvQkFBb0Is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