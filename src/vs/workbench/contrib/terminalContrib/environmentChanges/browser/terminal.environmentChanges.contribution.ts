/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EnvironmentVariableMutatorType, EnvironmentVariableScope, IEnvironmentVariableMutator, IMergedEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariable';
import { registerActiveInstanceAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

// TODO: The rest of the terminal environment changes feature should move here https://github.com/microsoft/vscode/issues/177241

registerActiveInstanceAction({
	id: TerminalCommandId.ShowEnvironmentContributions,
	title: { value: localize('workbench.action.terminal.showEnvironmentContributions', "Show Environment Contributions"), original: 'Show Environment Contributions' },
	run: async (activeInstance, c, accessor, arg) => {
		const collection = activeInstance.extEnvironmentVariableCollection;
		if (collection) {
			const scope = arg as EnvironmentVariableScope | undefined;
			const instantiationService = accessor.get(IInstantiationService);
			const outputProvider = instantiationService.createInstance(EnvironmentCollectionProvider);
			const editorService = accessor.get(IEditorService);
			const timestamp = new Date().getTime();
			const scopeDesc = scope?.workspaceFolder ? ` - ${scope.workspaceFolder.name}` : '';
			const textContent = await outputProvider.provideTextContent(URI.from(
				{
					scheme: EnvironmentCollectionProvider.scheme,
					path: `Environment changes${scopeDesc}`,
					fragment: describeEnvironmentChanges(collection, scope),
					query: `environment-collection-${timestamp}`
				}));
			if (textContent) {
				await editorService.openEditor({
					resource: textContent.uri
				});
			}
		}
	}
});


function describeEnvironmentChanges(collection: IMergedEnvironmentVariableCollection, scope: EnvironmentVariableScope | undefined): string {
	let content = `# ${localize('envChanges', 'Terminal Environment Changes')}`;
	for (const [ext, coll] of collection.collections) {
		content += `\n\n## ${localize('extension', 'Extension: {0}', ext)}`;
		content += '\n';
		if (coll.descriptionMap && coll.descriptionMap.size > 0) {
			for (const desc of coll.descriptionMap.values()) {
				content += `\n${desc.description}`;
				if (desc.scope?.workspaceFolder) {
					content += ` (${localize('ScopedEnvironmentContributionInfo', 'workspace')})`;
				}
			}
			content += '\n';
		}
		for (const mutator of coll.map.values()) {
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

class EnvironmentCollectionProvider implements ITextModelContentProvider {
	static scheme = 'ENVIRONMENT_CHANGES_COLLECTION';

	constructor(
		@ITextModelService textModelResolverService: ITextModelService,
		@IModelService private readonly _modelService: IModelService
	) {
		textModelResolverService.registerTextModelContentProvider(EnvironmentCollectionProvider.scheme, this);
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		return this._modelService.createModel(resource.fragment, { languageId: 'markdown', onDidChange: Event.None }, resource, false);
	}
}
