/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { INotebookKernelService, INotebookProxyKernel, INotebookProxyKernelChangeEvent, ProxyKernelState, NotebookKernelType } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { ExtHostContext, ExtHostNotebookProxyKernelsShape, INotebookProxyKernelDto, MainContext, MainThreadNotebookProxyKernelsShape } from '../common/extHost.protocol';
import { onUnexpectedError } from 'vs/base/common/errors';

abstract class MainThreadProxyKernel implements INotebookProxyKernel {
	readonly type: NotebookKernelType.Proxy = NotebookKernelType.Proxy;
	protected readonly _onDidChange = new Emitter<INotebookProxyKernelChangeEvent>();
	readonly onDidChange: Event<INotebookProxyKernelChangeEvent> = this._onDidChange.event;
	readonly id: string;
	readonly viewType: string;
	readonly extension: ExtensionIdentifier;
	readonly preloadProvides: string[] = [];
	label: string;
	description?: string;
	detail?: string;
	kind?: string;
	supportedLanguages: string[] = [];
	connectionState: ProxyKernelState;

	constructor(data: INotebookProxyKernelDto) {
		this.id = data.id;
		this.viewType = data.notebookType;
		this.extension = data.extensionId;

		this.label = data.label;
		this.description = data.description;
		this.detail = data.detail;
		this.kind = data.kind;

		this.connectionState = ProxyKernelState.Disconnected;
	}

	update(data: Partial<INotebookProxyKernel>) {
		const event: INotebookProxyKernelChangeEvent = Object.create(null);
		if (data.label !== undefined) {
			this.label = data.label;
			event.label = true;
		}
		if (data.description !== undefined) {
			this.description = data.description;
			event.description = true;
		}
		if (data.detail !== undefined) {
			this.detail = data.detail;
			event.detail = true;
		}
		if (data.kind !== undefined) {
			this.kind = data.kind;
			event.kind = true;
		}

		this._onDidChange.fire(event);
	}

	abstract resolveKernel(): Promise<string | null>;
}

@extHostNamedCustomer(MainContext.MainThreadNotebookProxyKernels)
export class MainThreadNotebookProxyKernels implements MainThreadNotebookProxyKernelsShape {

	private readonly _disposables = new DisposableStore();

	private readonly _proxyKernels = new Map<number, [kernel: MainThreadProxyKernel, registraion: IDisposable]>();
	private readonly _proxyKernelProxy: ExtHostNotebookProxyKernelsShape;

	constructor(
		extHostContext: IExtHostContext,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
	) {
		this._proxyKernelProxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebookProxyKernels);
	}

	dispose(): void {
		this._disposables.dispose();

		for (let [, registration] of this._proxyKernels.values()) {
			registration.dispose();
		}
	}

	// -- Proxy kernel

	async $addProxyKernel(handle: number, data: INotebookProxyKernelDto): Promise<void> {
		const that = this;
		const proxyKernel = new class extends MainThreadProxyKernel {
			async resolveKernel(): Promise<string | null> {
				try {
					this.connectionState = ProxyKernelState.Initializing;
					this._onDidChange.fire({ connectionState: true });
					const delegateKernel = await that._proxyKernelProxy.$resolveKernel(handle);
					this.connectionState = ProxyKernelState.Connected;
					this._onDidChange.fire({ connectionState: true });
					return delegateKernel;
				} catch (err) {
					onUnexpectedError(err);
					this.connectionState = ProxyKernelState.Disconnected;
					this._onDidChange.fire({ connectionState: true });
					return null;
				}
			}
		}(data);

		const registration = this._notebookKernelService.registerKernel(proxyKernel);
		this._proxyKernels.set(handle, [proxyKernel, registration]);
	}

	$updateProxyKernel(handle: number, data: Partial<INotebookProxyKernelDto>): void {
		const tuple = this._proxyKernels.get(handle);
		if (tuple) {
			tuple[0].update(data);
		}
	}

	$removeProxyKernel(handle: number): void {
		const tuple = this._proxyKernels.get(handle);
		if (tuple) {
			tuple[1].dispose();
			this._proxyKernels.delete(handle);
		}
	}
}
