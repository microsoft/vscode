/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Event } from '../../../../../base/common/event.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EnvironmentVariableMutatorType, EnvironmentVariableScope, IEnvironmentVariableMutator, IMergedEnvironmentVariableCollection } from '../../../../../platform/terminal/common/environmentVariable.js';
import { registerActiveInstanceAction } from '../../../terminal/browser/terminalActions.js';
import { TerminalCommandId } from '../../../terminal/common/terminal.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';

// TODO: The rest of the terminal environment changes feature should move here https://github.com/microsoft/vscode/issues/177241

// #region Actions

registerActiveInstanceAction({
	id: TerminalCommandId.ShowEnvironmentContributions,
	title: localize2('workbench.action.terminal.showEnvironmentContributions', 'Show Environment Contributions'),
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

// #endregion

function describeEnvironmentChanges(collection: IMergedEnvironmentVariableCollection, scope: EnvironmentVariableScope | undefined): string {
	let content = `# ${localize('envChanges', 'Terminal Environment Changes')}`;
	const globalDescriptions = collection.getDescriptionMap(undefined);
	const workspaceDescriptions = collection.getDescriptionMap(scope);
	for (const [ext, coll] of collection.collections) {
		content += `\n\n## ${localize('extension', 'Extension: {0}', ext)}`;
		content += '\n';
		const globalDescription = globalDescriptions.get(ext);
		if (globalDescription) {
			content += `\n${globalDescription}\n`;
		}
		const workspaceDescription = workspaceDescriptions.get(ext);
		if (workspaceDescription) {
			// Only show '(workspace)' suffix if there is already a description for the extension.
			const workspaceSuffix = globalDescription ? ` (${localize('ScopedEnvironmentContributionInfo', 'workspace')})` : '';
			content += `\n${workspaceDescription}${workspaceSuffix}\n`;
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
