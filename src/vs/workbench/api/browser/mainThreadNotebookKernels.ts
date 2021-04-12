/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookKernel2, INotebookKernel2ChangeEvent, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { NotebookSelector } from 'vs/workbench/contrib/notebook/common/notebookSelector';
import { ExtHostContext, ExtHostNotebookKernelsShape, IExtHostContext, INotebookKernelDto2, MainContext, MainThreadNotebookKernelsShape } from '../common/extHost.protocol';

abstract class MainThreadKernel implements INotebookKernel2 {

	private readonly _onDidChange = new Emitter<INotebookKernel2ChangeEvent>();
	readonly onDidChange: Event<INotebookKernel2ChangeEvent> = this._onDidChange.event;

	readonly id: string;
	readonly selector: NotebookSelector;
	readonly extensionId: ExtensionIdentifier;

	implementsInterrupt: boolean;
	label: string;
	description?: string;
	detail?: string;
	isPreferred?: boolean;
	supportedLanguages: string[];
	implementsExecutionOrder: boolean;
	localResourceRoot: URI;
	preloads?: URI[];

	constructor(data: INotebookKernelDto2) {
		this.id = data.id;
		this.selector = data.selector;
		this.extensionId = data.extensionId;

		this.implementsInterrupt = data.supportsInterrupt ?? false;
		this.label = data.label;
		this.description = data.description;
		this.isPreferred = data.isPreferred;
		this.supportedLanguages = data.supportedLanguages;
		this.implementsExecutionOrder = data.hasExecutionOrder ?? false;
		this.localResourceRoot = URI.revive(data.extensionLocation);
		this.preloads = data.preloads && data.preloads.map(u => URI.revive(u));
	}


	update(data: Partial<INotebookKernelDto2>) {
		const event: INotebookKernel2ChangeEvent = Object.create(null);
		if (data.label !== undefined) {
			this.label = data.label;
			event.label = true;
		}
		if (data.description !== undefined) {
			this.description = data.description;
			event.description = true;
		}
		if (data.isPreferred !== undefined) {
			this.isPreferred = data.isPreferred;
			event.isPreferred = true;
		}
		if (data.supportedLanguages !== undefined) {
			this.supportedLanguages = data.supportedLanguages;
			event.supportedLanguages = true;
		}
		if (data.hasExecutionOrder !== undefined) {
			this.implementsExecutionOrder = data.hasExecutionOrder;
			event.hasExecutionOrder = true;
		}
		this._onDidChange.fire(event);
	}

	abstract setSelected(value: boolean): void;
	abstract executeCells(uri: URI, ranges: ICellRange[]): void;
	abstract cancelCells(uri: URI, ranges: ICellRange[]): void;
}

@extHostNamedCustomer(MainContext.MainThreadNotebookKernels)
export class MainThreadNotebookKernels implements MainThreadNotebookKernelsShape {

	private readonly _kernels = new Map<number, [kernel: MainThreadKernel, registraion: IDisposable]>();
	private readonly _proxy: ExtHostNotebookKernelsShape;

	constructor(
		extHostContext: IExtHostContext,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebookKernels);
	}

	dispose(): void {
		for (let [, registration] of this._kernels.values()) {
			registration.dispose();
		}
	}

	$addKernel(handle: number, data: INotebookKernelDto2): void {
		const that = this;
		const kernel = new class extends MainThreadKernel {
			setSelected(value: boolean): void {
				that._proxy.$acceptSelection(handle, value);
			}
			executeCells(uri: URI, ranges: ICellRange[]): void {
				that._proxy.$executeCells(handle, uri, ranges);
			}
			cancelCells(uri: URI, ranges: ICellRange[]): void {
				that._proxy.$cancelCells(handle, uri, ranges);
			}
		}(data);
		const disposable = this._notebookKernelService.addKernel(kernel);
		this._kernels.set(handle, [kernel, disposable]);
	}

	$updateKernel(handle: number, data: Partial<INotebookKernelDto2>): void {
		const tuple = this._kernels.get(handle);
		if (tuple) {
			tuple[0].update(data);
		}
	}

	$removeKernel(handle: number): void {
		const tuple = this._kernels.get(handle);
		if (tuple) {
			tuple[1].dispose();
			this._kernels.delete(handle);
		}
	}
}
