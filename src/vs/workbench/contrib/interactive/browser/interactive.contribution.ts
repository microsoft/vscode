/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorDescriptor, IEditorRegistry } from 'vs/workbench/browser/editor';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { EditorExtensions } from 'vs/workbench/common/editor';
import { InteractiveEditor } from 'vs/workbench/contrib/interactive/browser/interactiveEditor';
import { InteractiveEditorInput } from 'vs/workbench/contrib/interactive/browser/interactiveEditorInput';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookContentProvider, INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';


Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	EditorDescriptor.create(
		InteractiveEditor,
		InteractiveEditor.ID,
		'Interactive Window'
	),
	[
		new SyncDescriptor(InteractiveEditorInput)
	]
);

export class InteractiveDocumentContribution extends Disposable implements IWorkbenchContribution {
	constructor(@INotebookService notebookService: INotebookService) {
		super();

		const contentOptions = {
			transientOutputs: true,
			transientCellMetadata: {},
			transientDocumentMetadata: {}
		};

		const controller: INotebookContentProvider = {
			get options() {
				return contentOptions;
			},
			set options(newOptions) {
				contentOptions.transientCellMetadata = newOptions.transientCellMetadata;
				contentOptions.transientDocumentMetadata = newOptions.transientDocumentMetadata;
				contentOptions.transientOutputs = newOptions.transientOutputs;
			},
			open: async (uri: URI, backupId: string | undefined, untitledDocumentData: VSBuffer | undefined, token: CancellationToken) => {
				return {
					data: {
						metadata: {},
						cells: [
							{
								source: `Started 'Python 3.9.1 64-bit ('testenv': conda)' kernel\nPython 3.9.1 (default, Dec 11 2020, 09:29:25) [MSC v.1916 64 bit (AMD64)]\nType 'copyright', 'credits' or 'license' for more information\nIPython 7.20.0 -- An enhanced Interactive Python. Type '?' for help.`,
								language: 'markdown',
								cellKind: CellKind.Markup,
								outputs: [],
							}
						]
					},
					transientOptions: contentOptions
				};
			},
			save: async (uri: URI) => {
				// return this._proxy.$saveNotebook(viewType, uri, token);
				return true;
			},
			saveAs: async (uri: URI, target: URI, token: CancellationToken) => {
				// return this._proxy.$saveNotebookAs(viewType, uri, target, token);
				return false;
			},
			backup: async (uri: URI, token: CancellationToken) => {
				// return this._proxy.$backupNotebook(viewType, uri, token);
				return '';
			}
		};
		this._register(notebookService.registerNotebookController('interactive', {
			id: new ExtensionIdentifier('interactive.builtin'),
			location: URI.parse('interactive://test')
		}, controller));

		this._register(notebookService.registerContributedNotebookType('interactive', {
			extension: new ExtensionIdentifier('interactive.builtin'),
			providerDisplayName: 'Interactive Notebook',
			displayName: 'Interactive',
			filenamePattern: ['*.interactive'],
			exclusive: true
		}));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
// TODO@rebornix, we set it to Eventually since we want to make sure the contributedEditors in notebookserviceImpl was not flushed by the extension update
workbenchContributionsRegistry.registerWorkbenchContribution(InteractiveDocumentContribution, LifecyclePhase.Eventually);


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'interactive.open',
			title: { value: localize('interactive.open', "Open Interactive Window"), original: 'Open Interactive Window' },
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		// const editorGroupsService = accessor.get(IEditorGroupsService);

		// const group = editorGroupsService.activeGroup;
		const editorService = accessor.get(IEditorService);
		// await editorService.openEditor({ options: { override: 'interactive', pinned: true } }, group);
		// const editorInput = NotebookEditorInput.create(accessor.get(IInstantiationService), URI.parse('inmem://test/test.interactive'), 'interactive', {});
		const editorInput = new InteractiveEditorInput(URI.parse('inmem://test.interactive'), undefined, accessor.get(ILabelService), accessor.get(IFileService), accessor.get(IInstantiationService));
		await editorService.openEditor(editorInput);
	}
});
