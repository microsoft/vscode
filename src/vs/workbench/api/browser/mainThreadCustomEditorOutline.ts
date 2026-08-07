/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostCustomEditorOutlineShape, MainContext, MainThreadCustomEditorOutlineShape } from '../common/extHost.protocol.js';
import { ICustomEditorOutlineItemDto, ICustomEditorOutlineProvider, ICustomEditorOutlineProviderService } from '../../contrib/customEditor/common/customEditorOutlineService.js';

class EditorEntry {
	private readonly _onDidChangeOutline = new Emitter<void>();
	readonly onDidChangeOutline = this._onDidChangeOutline.event;

	private readonly _onDidChangeActiveItem = new Emitter<string | undefined>();
	readonly onDidChangeActiveItem = this._onDidChangeActiveItem.event;

	private _activeItemId: string | undefined;
	private _refCount = 0;

	get activeItemId(): string | undefined { return this._activeItemId; }
	get refCount(): number { return this._refCount; }

	retain(): void {
		this._refCount++;
	}

	release(): void {
		this._refCount--;
	}

	fireDidChangeOutline(): void {
		this._onDidChangeOutline.fire();
	}

	fireDidChangeActiveItem(itemId: string | undefined): void {
		this._activeItemId = itemId;
		this._onDidChangeActiveItem.fire(itemId);
	}

	dispose(): void {
		this._onDidChangeOutline.dispose();
		this._onDidChangeActiveItem.dispose();
	}
}

class CustomEditorOutlineProviderEntry {

	private readonly _editorEntries = new Map<string, EditorEntry>();

	constructor(readonly provider: ICustomEditorOutlineProvider) { }

	getOrCreateEditorEntry(webviewHandle: string): EditorEntry {
		const key = webviewHandle;
		let entry = this._editorEntries.get(key);
		if (!entry) {
			entry = new EditorEntry();
			this._editorEntries.set(key, entry);
		}
		return entry;
	}

	getEditorEntry(webviewHandle: string): EditorEntry | undefined {
		return this._editorEntries.get(webviewHandle);
	}

	fireDidChangeOutline(webviewHandle: string): void {
		this._editorEntries.get(webviewHandle)?.fireDidChangeOutline();
	}

	fireDidChangeActiveItem(webviewHandle: string, itemId: string | undefined): void {
		this.getOrCreateEditorEntry(webviewHandle).fireDidChangeActiveItem(itemId);
	}

	retainEditorEntry(webviewHandle: string): IDisposable {
		const entry = this.getOrCreateEditorEntry(webviewHandle);
		entry.retain();
		return toDisposable(() => {
			entry.release();
			if (entry.refCount === 0 && this._editorEntries.get(webviewHandle) === entry) {
				entry.dispose();
				this._editorEntries.delete(webviewHandle);
			}
		});
	}

	dispose(): void {
		for (const entry of this._editorEntries.values()) {
			entry.dispose();
		}
		this._editorEntries.clear();
	}
}

export class CustomEditorOutlineProviderService extends Disposable implements ICustomEditorOutlineProviderService {
	declare readonly _serviceBrand: undefined;

	private readonly _entries = this._register(new DisposableMap<string, CustomEditorOutlineProviderEntry>());

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	hasProvider(viewType: string): boolean {
		return this._entries.has(viewType);
	}

	async provideOutline(viewType: string, resource: URI, webviewHandle: string, token: CancellationToken): Promise<ICustomEditorOutlineItemDto[] | undefined> {
		return this._entries.get(viewType)?.provider.provideOutline(resource, webviewHandle, token);
	}

	revealItem(viewType: string, resource: URI, webviewHandle: string, itemId: string): void {
		this._entries.get(viewType)?.provider.revealItem(resource, webviewHandle, itemId);
	}

	getActiveItemId(viewType: string, webviewHandle: string): string | undefined {
		return this._entries.get(viewType)?.getEditorEntry(webviewHandle)?.activeItemId;
	}

	onDidChangeOutline(viewType: string, webviewHandle: string): Event<void> {
		const entry = this._entries.get(viewType);
		return entry ? entry.getOrCreateEditorEntry(webviewHandle).onDidChangeOutline : Event.None;
	}

	onDidChangeActiveItem(viewType: string, webviewHandle: string): Event<string | undefined> {
		const entry = this._entries.get(viewType);
		return entry ? entry.getOrCreateEditorEntry(webviewHandle).onDidChangeActiveItem : Event.None;
	}

	registerProvider(viewType: string, provider: ICustomEditorOutlineProvider): IDisposable {
		if (this._entries.has(viewType)) {
			throw new Error(`An outline provider for custom editor view type '${viewType}' is already registered`);
		}
		const entry = new CustomEditorOutlineProviderEntry(provider);
		this._entries.set(viewType, entry);
		this._onDidChange.fire();
		return toDisposable(() => {
			if (this._entries.get(viewType) === entry) {
				this._entries.deleteAndDispose(viewType);
				this._onDidChange.fire();
			}
		});
	}

	retainEditor(viewType: string, webviewHandle: string): IDisposable {
		return this._entries.get(viewType)?.retainEditorEntry(webviewHandle) ?? Disposable.None;
	}

	fireDidChangeOutline(viewType: string, webviewHandle: string): void {
		this._entries.get(viewType)?.fireDidChangeOutline(webviewHandle);
	}

	fireDidChangeActiveItem(viewType: string, webviewHandle: string, itemId: string | undefined): void {
		this._entries.get(viewType)?.fireDidChangeActiveItem(webviewHandle, itemId);
	}
}

registerSingleton(ICustomEditorOutlineProviderService, CustomEditorOutlineProviderService, InstantiationType.Delayed);

@extHostNamedCustomer(MainContext.MainThreadCustomEditorOutline)
export class MainThreadCustomEditorOutline extends Disposable implements MainThreadCustomEditorOutlineShape {

	private readonly _proxy: ExtHostCustomEditorOutlineShape;
	private readonly _registrations = this._register(new DisposableMap<string>());

	constructor(
		context: IExtHostContext,
		@ICustomEditorOutlineProviderService private readonly _service: ICustomEditorOutlineProviderService,
	) {
		super();
		this._proxy = context.getProxy(ExtHostContext.ExtHostCustomEditorOutline);
	}

	$registerCustomEditorOutlineProvider(viewType: string): void {
		const registration = this._service.registerProvider(viewType, {
			provideOutline: (resource, webviewHandle, token) => this._proxy.$provideOutline(viewType, resource, webviewHandle, token),
			revealItem: (resource, webviewHandle, itemId) => this._proxy.$revealItem(viewType, resource, webviewHandle, itemId),
		});
		this._registrations.set(viewType, registration);
	}

	$unregisterCustomEditorOutlineProvider(viewType: string): void {
		// deleteAndDispose disposes the registration returned by registerProvider(),
		// whose dispose handler already removes the entry and fires onDidChange.
		this._registrations.deleteAndDispose(viewType);
	}

	$onDidChangeOutline(viewType: string, webviewHandle: string): void {
		this._service.fireDidChangeOutline(viewType, webviewHandle);
	}

	$onDidChangeActiveItem(viewType: string, webviewHandle: string, itemId: string | undefined): void {
		this._service.fireDidChangeActiveItem(viewType, webviewHandle, itemId);
	}
}
