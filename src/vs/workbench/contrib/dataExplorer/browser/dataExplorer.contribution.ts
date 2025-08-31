/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { URI } from '../../../../base/common/uri.js';
import { DataExplorerEditorPane } from './editor/dataExplorerEditorPane.js';
import { DataExplorerEditorInput } from './editor/dataExplorerEditorInput.js';
import { DataExplorerEditorSerializer } from './editor/dataExplorerEditorSerializer.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';

/**
 * Data Explorer contribution for registering editors and file associations
 */
export class DataExplorerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.dataExplorer';

	constructor(
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.registerEditor();
	}

	private registerEditor(): void {
		
		// Register for CSV files
		this._register(this.editorResolverService.registerEditor(
			'*.csv',
			{
				id: DataExplorerEditorPane.ID,
				label: localize('dataExplorer', 'Data Explorer'),
				detail: localize('dataExplorerDetail', 'CSV/TSV Data Grid Editor'),
				priority: RegisteredEditorPriority.default
			},
			{
				singlePerResource: true,
				canSupportResource: (resource: URI) => {
					return DataExplorerEditorInput.canSupportResource(resource);
				}
			},
			{
				createEditorInput: ({ resource }) => {
					try {
						const editor = this.instantiationService.createInstance(DataExplorerEditorInput, resource);
						return { editor };
					} catch (error) {
						console.error('DataExplorerContribution: Error creating editor input:', error);
						throw error;
					}
				}
			}
		));

		// Register for TSV files
		this._register(this.editorResolverService.registerEditor(
			'*.tsv',
			{
				id: DataExplorerEditorPane.ID,
				label: localize('dataExplorer', 'Data Explorer'),
				detail: localize('dataExplorerDetail', 'CSV/TSV Data Grid Editor'),
				priority: RegisteredEditorPriority.default
			},
			{
				singlePerResource: true,
				canSupportResource: (resource: URI) => DataExplorerEditorInput.canSupportResource(resource)
			},
			{
				createEditorInput: ({ resource }) => ({ 
					editor: this.instantiationService.createInstance(DataExplorerEditorInput, resource)
				})
			}
		));


	}
}

// Register the Data Explorer editor pane
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		DataExplorerEditorPane,
		DataExplorerEditorPane.ID,
		localize('dataExplorerEditorPane', 'Data Explorer')
	),
	[
		new SyncDescriptor(DataExplorerEditorInput)
	]
);

// Register the editor serializer
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	DataExplorerEditorInput.ID,
	DataExplorerEditorSerializer
);

// Register the workbench contribution
registerWorkbenchContribution2(
	DataExplorerContribution.ID,
	DataExplorerContribution,
	WorkbenchPhase.AfterRestored
);
