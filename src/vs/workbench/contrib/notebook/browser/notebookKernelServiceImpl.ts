/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { DisposableStore, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ICellRange, INotebookKernel, INotebookTextModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookKernelBindEvent, INotebookKernel2, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { score } from 'vs/workbench/contrib/notebook/common/notebookSelector';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { URI } from 'vs/base/common/uri';
import { ResourceMap } from 'vs/base/common/map';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/notebookEditorService';

export class NotebookKernelService implements INotebookKernelService {

	declare _serviceBrand: undefined;

	private readonly _kernels = new Map<string, INotebookKernel2>();
	private readonly _kernelBindings = new ResourceMap<INotebookKernel2>();

	private readonly _onDidChangeNotebookKernelBinding = new Emitter<INotebookKernelBindEvent>();
	private readonly _onDidAddKernel = new Emitter<INotebookKernel2>();
	private readonly _onDidRemoveKernel = new Emitter<INotebookKernel2>();

	readonly onDidChangeNotebookKernelBinding: Event<INotebookKernelBindEvent> = this._onDidChangeNotebookKernelBinding.event;
	readonly onDidAddKernel: Event<INotebookKernel2> = this._onDidAddKernel.event;
	readonly onDidRemoveKernel: Event<INotebookKernel2> = this._onDidRemoveKernel.event;

	dispose() {
		this._onDidChangeNotebookKernelBinding.dispose();
		this._onDidAddKernel.dispose();
		this._onDidRemoveKernel.dispose();
		this._kernels.clear();
	}

	registerKernel(kernel: INotebookKernel2): IDisposable {
		if (this._kernels.has(kernel.id)) {
			throw new Error(`KERNEL with id '${kernel.id}' already exists`);
		}

		this._kernels.set(kernel.id, kernel);
		this._onDidAddKernel.fire(kernel);

		return toDisposable(() => {
			if (this._kernels.delete(kernel.id)) {
				this._onDidRemoveKernel.fire(kernel);
			}
			for (let [uri, candidate] of this._kernelBindings) {
				if (candidate === kernel) {
					this._kernelBindings.delete(uri);
					this._onDidChangeNotebookKernelBinding.fire({ notebook: uri, oldKernel: kernel, newKernel: undefined });
				}
			}
		});
	}

	getKernels(notebook: INotebookTextModel): INotebookKernel2[] {
		const result: INotebookKernel2[] = [];
		for (const kernel of this._kernels.values()) {
			if (score(kernel.selector, notebook.uri, notebook.viewType) > 0) {
				result.push(kernel);
			}
		}
		const boundKernel = this._kernelBindings.get(notebook.uri);
		return result.sort((a, b) => {
			// (1) binding a kernel
			if (a === boundKernel) {
				return -1;
			} else if (b === boundKernel) {
				return 1;
			}
			// (2) preferring a kernel
			if (a.isPreferred === b.isPreferred) {
				return 0;
			} else if (a.isPreferred) {
				return -1;
			} else {
				return 1;
			}
		});
	}

	// a notebook has one kernel, a kernel has N notebooks
	// notebook <-1----N-> kernel
	updateNotebookKernelBinding(notebook: INotebookTextModel, kernel: INotebookKernel2 | undefined): void {
		const oldKernel = this._kernelBindings.get(notebook.uri);
		if (oldKernel !== kernel) {
			if (kernel) {
				this._kernelBindings.set(notebook.uri, kernel);
			} else {
				this._kernelBindings.delete(notebook.uri);
			}
			this._onDidChangeNotebookKernelBinding.fire({ notebook: notebook.uri, oldKernel, newKernel: kernel });
		}
	}
}

// below is some GLUE code to bridge managed kernels into the existing kernel pull
// world. this should eventually disappear

class KernelAdaptorBridge implements IWorkbenchContribution {

	readonly dispose: () => void;

	constructor(
		@INotebookKernelService notebookKernelService: INotebookKernelService,
		@INotebookService notebookService: INotebookService,
		@INotebookEditorService notebookEditorService: INotebookEditorService
	) {

		const disposables = new DisposableStore();

		const emitter = new Emitter<URI | undefined>();
		const kernels = new Map<INotebookKernel2, IDisposable>();

		disposables.add(notebookKernelService.onDidAddKernel(kernel => {
			const reg = kernel.onDidChange(() => emitter.fire(undefined));
			kernels.set(kernel, reg);
			emitter.fire(undefined);
		}));

		disposables.add(notebookKernelService.onDidRemoveKernel(kernel => {
			const reg = kernels.get(kernel);
			if (reg) {
				reg.dispose();
				kernels.delete(kernel);
				emitter.fire(undefined);
			}
		}));

		// kernel -> provider
		const registration = notebookService.registerNotebookKernelProvider({
			onDidChangeKernels: emitter.event,
			providerExtensionId: 'notAnExtension',
			selector: { filenamePattern: '**/*' },
			async provideKernels(uri: URI) {

				const model = notebookService.getNotebookTextModel(uri);
				if (!model) {
					return [];
				}
				return notebookKernelService.getKernels(model).map((kernel: INotebookKernel2): INotebookKernel => {
					return {
						id: kernel.id,
						friendlyId: kernel.id,
						label: kernel.label,
						description: kernel.description,
						detail: kernel.detail,
						isPreferred: kernel.isPreferred,
						preloadUris: kernel.preloadUris,
						preloadProvides: kernel.preloadProvides,
						localResourceRoot: kernel.localResourceRoot,
						supportedLanguages: kernel.supportedLanguages,
						implementsInterrupt: kernel.implementsInterrupt,
						implementsExecutionOrder: kernel.implementsExecutionOrder,
						extension: kernel.extension,
						async resolve() { },
						async executeNotebookCellsRequest(uri: URI, ranges: ICellRange[]): Promise<void> { kernel.executeNotebookCellsRequest(uri, ranges); },
						async cancelNotebookCellExecution(uri: URI, ranges: ICellRange[]): Promise<void> { kernel.cancelNotebookCellExecution(uri, ranges); },
					};
				});
			}
		});

		// kernel binding
		const editorListener = new Map<string, IDisposable>();
		disposables.add(notebookEditorService.onDidAddNotebookEditor(e => {
			const r1 = e.onDidChangeKernel(() => {
				if (!e.viewModel) {
					return;
				}
				let kernel: INotebookKernel2 | undefined;
				if (e.activeKernel) {
					for (const candidate of kernels.keys()) {
						if (e.activeKernel.friendlyId === candidate.id) {
							kernel = candidate;
							break;
						}
					}
				}
				notebookKernelService.updateNotebookKernelBinding(e.viewModel.notebookDocument, kernel);
			});
			editorListener.set(e.getId(), r1);
		}));
		disposables.add(notebookEditorService.onDidRemoveNotebookEditor(e => {
			editorListener.get(e.getId())?.dispose();
			editorListener.delete(e.getId());
		}));


		this.dispose = () => {
			dispose(editorListener.values());
			disposables.dispose();
			emitter.dispose();
			registration.dispose();
		};
	}
}

Registry
	.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(KernelAdaptorBridge, LifecyclePhase.Ready);
