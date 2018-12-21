/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { MenuRegistry } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as Input, IEditorInputFactory, IEditorInputFactoryRegistry } from 'vs/workbench/common/editor';
import { PerfviewInput } from 'vs/workbench/parts/performance/electron-browser/perfviewEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import './startupProfiler';
import './startupTimings';
import './stats';

Registry.as<IEditorInputFactoryRegistry>(Input.EditorInputFactories).registerEditorInputFactory(
	PerfviewInput.Id,
	class implements IEditorInputFactory {
		serialize(): string {
			return '';
		}
		deserialize(instantiationService: IInstantiationService): PerfviewInput {
			return instantiationService.createInstance(PerfviewInput);
		}
	}
);

CommandsRegistry.registerCommand('perfview.show', accessor => {

	const editorService = accessor.get(IEditorService);
	const instaService = accessor.get(IInstantiationService);
	return editorService.openEditor(instaService.createInstance(PerfviewInput));
});

MenuRegistry.addCommand({
	id: 'perfview.show',
	category: localize('show.cat', "Developer"),
	title: localize('show.label', "Startup Performance (2)")
});
