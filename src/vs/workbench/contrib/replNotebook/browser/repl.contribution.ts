/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer, IUntypedEditorInput } from 'vs/workbench/common/editor';
// is one contrib allowed to import from another?
import { parse } from 'vs/base/common/marshalling';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { NotebookWorkingCopyTypeIdentifier, REPL_EDITOR_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookEditorInput, NotebookEditorInputOptions } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { ReplEditor } from 'vs/workbench/contrib/replNotebook/browser/replEditor';
import { ReplEditorInput } from 'vs/workbench/contrib/replNotebook/browser/replEditorInput';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkingCopyIdentifier } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { IWorkingCopyEditorHandler, IWorkingCopyEditorService } from 'vs/workbench/services/workingCopy/common/workingCopyEditorService';
import { extname, isEqual } from 'vs/base/common/resources';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { localize, localize2 } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { Schemas } from 'vs/base/common/network';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';

type SerializedNotebookEditorData = { resource: URI; preferredResource: URI; viewType: string; options?: NotebookEditorInputOptions };
class ReplEditorSerializer implements IEditorSerializer {
	canSerialize(input: EditorInput): boolean {
		return input instanceof ReplEditorInput;
	}
	serialize(input: EditorInput): string {
		assertType(input instanceof ReplEditorInput);
		const data: SerializedNotebookEditorData = {
			resource: input.resource,
			preferredResource: input.preferredResource,
			viewType: input.viewType,
			options: input.options
		};
		return JSON.stringify(data);
	}
	deserialize(instantiationService: IInstantiationService, raw: string) {
		const data = <SerializedNotebookEditorData>parse(raw);
		if (!data) {
			return undefined;
		}
		const { resource, preferredResource, viewType, options } = data;
		if (!data || !URI.isUri(resource) || typeof viewType !== 'string') {
			return undefined;
		}

		const input = NotebookEditorInput.getOrCreate(instantiationService, resource, preferredResource, viewType, options);
		return input;
	}
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ReplEditor,
		REPL_EDITOR_ID,
		'REPL Editor'
	),
	[
		new SyncDescriptor(ReplEditorInput)
	]
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	ReplEditorInput.ID,
	ReplEditorSerializer
);

export class ReplDocumentContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.replDocument';

	constructor(
		@INotebookService notebookService: INotebookService,
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IEditorService editorService: IEditorService,
		@INotebookEditorModelResolverService private readonly notebookEditorModelResolverService: INotebookEditorModelResolverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		const info = notebookService.getContributedNotebookType('repl');

		// We need to register with the notebook service to let it know about this editor contribution
		if (!info) {
			this._register(notebookService.registerContributedNotebookType('repl', {
				providerDisplayName: 'REPL Notebook',
				displayName: 'Repl Notebook',
				filenamePattern: ['*.repl'],
				exclusive: false
			}));
		}

		editorResolverService.registerEditor(
			`*.repl`,
			{
				id: 'repl',
				label: 'repl Editor',
				priority: RegisteredEditorPriority.default
			},
			{
				canSupportResource: uri =>
					(uri.scheme === Schemas.untitled && extname(uri) === '.repl') ||
					(uri.scheme === Schemas.vscodeNotebookCell && extname(uri) === '.repl'),
				singlePerResource: true
			},
			{
				createUntitledEditorInput: async ({ resource, options }) => {
					const ref = await this.notebookEditorModelResolverService.resolve({ untitledResource: resource }, 'repl');

					// untitled notebooks are disposed when they get saved. we should not hold a reference
					// to such a disposed notebook and therefore dispose the reference as well
					ref.object.notebook.onWillDispose(() => {
						ref.dispose();
					});
					return { editor: this.instantiationService.createInstance(ReplEditorInput, resource!), options };
				}
			}
		);
	}
}

class ReplWindowWorkingCopyEditorHandler extends Disposable implements IWorkbenchContribution, IWorkingCopyEditorHandler {

	static readonly ID = 'workbench.contrib.replWorkingCopyEditorHandler';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkingCopyEditorService private readonly workingCopyEditorService: IWorkingCopyEditorService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		super();

		this._installHandler();
	}

	handles(workingCopy: IWorkingCopyIdentifier): boolean {
		const viewType = this._getViewType(workingCopy);
		return !!viewType && viewType === 'repl';

	}

	isOpen(workingCopy: IWorkingCopyIdentifier, editor: EditorInput): boolean {
		if (!this.handles(workingCopy)) {
			return false;
		}

		return editor instanceof ReplEditorInput && isEqual(workingCopy.resource, editor.resource);
	}

	createEditor(workingCopy: IWorkingCopyIdentifier): EditorInput {
		return this.instantiationService.createInstance(ReplEditorInput, workingCopy.resource);
	}

	private async _installHandler(): Promise<void> {
		await this.extensionService.whenInstalledExtensionsRegistered();

		this._register(this.workingCopyEditorService.registerHandler(this));
	}

	private _getViewType(workingCopy: IWorkingCopyIdentifier): string | undefined {
		return NotebookWorkingCopyTypeIdentifier.parse(workingCopy.typeId);
	}
}

registerWorkbenchContribution2(ReplWindowWorkingCopyEditorHandler.ID, ReplWindowWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ReplDocumentContribution.ID, ReplDocumentContribution, WorkbenchPhase.BlockRestore);


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'repl.open',
			title: localize2('repl.open', 'Open REPL Editor'),
			category: 'REPL',
			metadata: {
				description: localize('repl.open', 'Open REPL Editor'),
			}

		});
	}

	async run(accessor: ServicesAccessor) {
		const resource = URI.from({ scheme: Schemas.untitled, path: 'repl.repl' });
		const editorInput: IUntypedEditorInput = { resource, options: {} };

		const editorService = accessor.get(IEditorService);
		await editorService.openEditor(editorInput, 1);
	}
});
