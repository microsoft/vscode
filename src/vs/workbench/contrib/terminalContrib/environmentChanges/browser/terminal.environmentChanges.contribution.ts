/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { EnvironmentVariableMutatorType, EnvironmentVariableScope, IEnvironmentVariableMutator, IMergedEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariable';
import { registerActiveInstanceAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

// TODO: The rest of the terminal environment changes feature should move here https://github.com/microsoft/vscode/issues/177241

registerActiveInstanceAction({
	id: TerminalCommandId.ShowEnvironmentContributions,
	title: { value: localize('workbench.action.terminal.showEnvironmentContributions', "Show Environment Contributions"), original: 'Show Environment Contributions' },
	run: async (activeInstance, c, accessor, scope) => {
		const collection = activeInstance.extEnvironmentVariableCollection;
		if (collection) {
			const editorService = accessor.get(IEditorService);
			await editorService.openEditor({
				resource: URI.from({
					scheme: Schemas.untitled
				}),
				contents: describeEnvironmentChanges(collection, scope as EnvironmentVariableScope | undefined),
				languageId: 'markdown'
			});
		}
	}
});


function describeEnvironmentChanges(collection: IMergedEnvironmentVariableCollection, scope: EnvironmentVariableScope | undefined): string {
	let content = `# ${localize('envChanges', 'Terminal Environment Changes')}`;
	for (const [ext, coll] of collection.collections) {
		content += `\n\n## ${localize('extension', 'Extension: {0}', ext)}`;
		content += '\n';
		for (const [_, mutator] of coll.map.entries()) {
			if (filterScope(mutator, scope) === false) {
				continue;
			}
			content += `\n- \`${mutatorTypeLabel(mutator.type, mutator.value, mutator.variable)}\``;
		}
	}
	return content;
}

function filterScope(
	mutator: IEnvironmentVariableMutator,
	scope: EnvironmentVariableScope | undefined
): boolean {
	if (!mutator.scope) {
		return true;
	}
	// Only mutators which are applicable on the relevant workspace should be shown.
	if (mutator.scope.workspaceFolder && scope?.workspaceFolder && mutator.scope.workspaceFolder.index === scope.workspaceFolder.index) {
		return true;
	}
	return false;
}

function mutatorTypeLabel(type: EnvironmentVariableMutatorType, value: string, variable: string): string {
	switch (type) {
		case EnvironmentVariableMutatorType.Prepend: return `${variable}=${value}\${env:${variable}}`;
		case EnvironmentVariableMutatorType.Append: return `${variable}=\${env:${variable}}${value}`;
		default: return `${variable}=${value}`;
	}
}
