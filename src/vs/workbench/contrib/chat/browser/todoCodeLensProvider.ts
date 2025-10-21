/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { CodeLens, CodeLensList, CodeLensProvider } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ITodoDetectionService } from '../../../services/todoDetection/common/todoDetectionService.js';
import { DELEGATE_TODO_TO_AGENT_COMMAND_ID } from './todoCodeActionProvider.js';

class TodoCodeLensProvider extends Disposable implements CodeLensProvider {

	constructor(
		@ITodoDetectionService private readonly todoDetectionService: ITodoDetectionService
	) {
		super();
	}

	async provideCodeLenses(model: ITextModel, token: CancellationToken): Promise<undefined | CodeLensList> {
		const todos = this.todoDetectionService.detectAllTodos(model);
		if (todos.length === 0) {
			return undefined;
		}

		const lenses: CodeLens[] = todos.map(todo => ({
			range: {
				startLineNumber: todo.range.startLineNumber,
				startColumn: todo.range.startColumn,
				endLineNumber: todo.range.startLineNumber,
				endColumn: todo.range.startColumn
			},
			command: {
				title: localize('delegateToAgent.lens', "$(sparkle) Delegate to Agent"),
				id: DELEGATE_TODO_TO_AGENT_COMMAND_ID,
				arguments: [model.uri, todo]
			}
		}));

		return { lenses, dispose: () => { } };
	}
}

export class TodoCodeLenses implements IWorkbenchContribution {

	private readonly _store = new DisposableStore();

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IConfigurationService configService: IConfigurationService,
	) {
		const setting = 'chat.delegation.showCodeLens';
		const enabledSetting = 'chat.delegation.enabled';
		const sessionStore = new DisposableStore();

		const update = () => {
			sessionStore.clear();
			const enabled = configService.getValue<boolean>(enabledSetting);
			const showCodeLens = configService.getValue<boolean>(setting);
			if (enabled && showCodeLens) {
				sessionStore.add(languageFeaturesService.codeLensProvider.register('*', instantiationService.createInstance(TodoCodeLensProvider)));
			}
		};

		update();
		this._store.add(configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(setting) || e.affectsConfiguration(enabledSetting)) {
				update();
			}
		}));
		this._store.add(sessionStore);
	}

	dispose(): void {
		this._store.dispose();
	}
}
