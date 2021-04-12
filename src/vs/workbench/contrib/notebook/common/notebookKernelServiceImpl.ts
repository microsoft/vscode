/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ICellRange, INotebookKernel, INotebookTextModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookKernel2, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { score } from 'vs/workbench/contrib/notebook/common/notebookSelector';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { URI } from 'vs/base/common/uri';

export class NotebookKernelService implements INotebookKernelService {

	declare _serviceBrand: undefined;

	private readonly _kernels = new Set<INotebookKernel2>();
	private readonly _onDidAddKernel = new Emitter<INotebookKernel2>();
	private readonly _onDidRemoveKernel = new Emitter<INotebookKernel2>();

	readonly onDidAddKernel: Event<INotebookKernel2> = this._onDidAddKernel.event;
	readonly onDidRemoveKernel: Event<INotebookKernel2> = this._onDidRemoveKernel.event;

	addKernel(kernel: INotebookKernel2): IDisposable {
		this._kernels.add(kernel);
		this._onDidAddKernel.fire(kernel);
		return toDisposable(() => {
			if (this._kernels.delete(kernel)) {
				this._onDidRemoveKernel.fire(kernel);
			}
		});
	}

	selectKernels(notebook: INotebookTextModel): INotebookKernel2[] {
		const result: INotebookKernel2[] = [];
		for (let kernel of this._kernels) {
			if (score(kernel.selector, notebook.uri, notebook.viewType) > 0) {
				result.push(kernel);
			}
		}
		return result;
	}
}

// below is some GLUE code to bridge managed kernels into the existing kernel pull
// world. this should eventually disappear

class KernelAdaptorBridge implements IWorkbenchContribution {

	readonly dispose: () => void;

	constructor(
		@INotebookKernelService notebookKernelService: INotebookKernelService,
		@INotebookService notebookService: INotebookService,
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


		const registration = notebookService.registerNotebookKernelProvider({
			onDidChangeKernels: emitter.event,
			providerExtensionId: 'notAnExtension',
			selector: { filenamePattern: '**/*' },
			async provideKernels(uri: URI) {

				const model = notebookService.getNotebookTextModel(uri);
				if (!model) {
					return [];
				}
				const kernels = notebookKernelService.selectKernels(model);
				return kernels.map((kernel: INotebookKernel2): INotebookKernel => {
					return {
						id: kernel.id,
						friendlyId: kernel.id,
						label: kernel.label,
						description: kernel.description,
						detail: kernel.detail,
						isPreferred: kernel.isPreferred,
						preloads: kernel.preloads,
						extensionLocation: kernel.localResourceRoot,
						supportedLanguages: kernel.supportedLanguages,
						implementsInterrupt: kernel.implementsInterrupt,
						implementsExecutionOrder: kernel.implementsExecutionOrder,
						extension: kernel.extensionId,
						async resolve() { },
						async executeNotebookCellsRequest(uri: URI, ranges: ICellRange[]): Promise<void> { kernel.executeCells(uri, ranges); },
						async cancelNotebookCellExecution(uri: URI, ranges: ICellRange[]): Promise<void> { kernel.cancelCells(uri, ranges); },
					};
				});
			}
		});

		this.dispose = () => {
			disposables.dispose();
			emitter.dispose();
			registration.dispose();
		};
	}
}

Registry
	.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(KernelAdaptorBridge, LifecyclePhase.Ready);
