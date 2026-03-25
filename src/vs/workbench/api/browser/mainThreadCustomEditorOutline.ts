/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostCustomEditorOutlineShape, MainContext, MainThreadCustomEditorOutlineShape } from '../common/extHost.protocol.js';
import { ICustomEditorOutlineItemDto, ICustomEditorOutlineProviderService } from '../../contrib/customEditor/common/customEditorOutlineService.js';

class CustomEditorOutlineProviderEntry {
	private readonly _onDidChangeOutline = new Emitter<void>();
	readonly onDidChangeOutline = this._onDidChangeOutline.event;

	private readonly _onDidChangeActiveItem = new Emitter<string | undefined>();
	readonly onDidChangeActiveItem = this._onDidChangeActiveItem.event;

	private _activeItemId: string | undefined;

	get activeItemId(): string | undefined { return this._activeItemId; }

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

class CustomEditorOutlineProviderService extends Disposable implements ICustomEditorOutlineProviderService {
	declare readonly _serviceBrand: undefined;

	private readonly _entries = this._register(new DisposableMap<string, CustomEditorOutlineProviderEntry>());

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _provideOutline?: (viewType: string, token: CancellationToken) => Promise<ICustomEditorOutlineItemDto[] | undefined>;
	private _revealItem?: (viewType: string, itemId: string) => void;

	setDelegate(delegate: {
		provideOutline: (viewType: string, token: CancellationToken) => Promise<ICustomEditorOutlineItemDto[] | undefined>;
		revealItem: (viewType: string, itemId: string) => void;
	}): void {
		this._provideOutline = delegate.provideOutline;
		this._revealItem = delegate.revealItem;
	}

	hasProvider(viewType: string): boolean {
		return this._entries.has(viewType);
	}

	getProviderViewTypes(): string[] {
		return [...this._entries.keys()];
	}

	async provideOutline(viewType: string, token: CancellationToken): Promise<ICustomEditorOutlineItemDto[] | undefined> {
		if (this._provideOutline) {
			return this._provideOutline(viewType, token);
		}
		return undefined;
	}

	revealItem(viewType: string, itemId: string): void {
		if (this._revealItem) {
			this._revealItem(viewType, itemId);
		}
	}

	getActiveItemId(viewType: string): string | undefined {
		return this._entries.get(viewType)?.activeItemId;
	}

	onDidChangeOutline(viewType: string): Event<void> {
		const entry = this._entries.get(viewType);
		return entry ? entry.onDidChangeOutline : Event.None;
	}

	onDidChangeActiveItem(viewType: string): Event<string | undefined> {
		const entry = this._entries.get(viewType);
		return entry ? entry.onDidChangeActiveItem : Event.None;
	}

	registerProvider(viewType: string): IDisposable {
		const entry = new CustomEditorOutlineProviderEntry();
		this._entries.set(viewType, entry);
		this._onDidChange.fire();
		return toDisposable(() => {
			this._entries.deleteAndDispose(viewType);
			this._onDidChange.fire();
		});
	}

	unregisterProvider(viewType: string): void {
		this._entries.deleteAndDispose(viewType);
		this._onDidChange.fire();
	}

	fireDidChangeOutline(viewType: string): void {
		this._entries.get(viewType)?.fireDidChangeOutline();
	}

	fireDidChangeActiveItem(viewType: string, itemId: string | undefined): void {
		this._entries.get(viewType)?.fireDidChangeActiveItem(itemId);
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

		// Wire the service delegate to call through to the ext host
		if (this._service instanceof CustomEditorOutlineProviderService) {
			this._service.setDelegate({
				provideOutline: (viewType, token) => this._proxy.$provideOutline(viewType, token),
				revealItem: (viewType, itemId) => this._proxy.$revealItem(viewType, itemId),
			});
		}
	}

	$registerCustomEditorOutlineProvider(viewType: string): void {
		const registration = this._service.registerProvider(viewType);
		this._registrations.set(viewType, registration);
	}

	$unregisterCustomEditorOutlineProvider(viewType: string): void {
		// deleteAndDispose disposes the registration returned by registerProvider(),
		// whose dispose handler already removes the entry and fires onDidChange.
		this._registrations.deleteAndDispose(viewType);
	}

	$onDidChangeOutline(viewType: string): void {
		this._service.fireDidChangeOutline(viewType);
	}

	$onDidChangeActiveItem(viewType: string, itemId: string | undefined): void {
		this._service.fireDidChangeActiveItem(viewType, itemId);
	}
}
