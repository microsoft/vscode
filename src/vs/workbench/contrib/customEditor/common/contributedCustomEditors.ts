/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';
import { CustomEditorDescriptor, CustomEditorInfo, CustomEditorPriority, CustomEditorPriorityInfo } from './customEditor.js';
import { customEditorsExtensionPoint, ICustomEditorsExtensionPoint } from './extensionPoint.js';
import { RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IExtensionPointUser } from '../../../services/extensions/common/extensionsRegistry.js';

type StoredCustomEditorPriorityInfo = Omit<CustomEditorPriorityInfo, 'diff' | 'merge'> & {
	readonly diff?: RegisteredEditorPriority;
	readonly merge?: RegisteredEditorPriority;
};

type StoredCustomEditorDescriptor = Omit<CustomEditorDescriptor, 'priority'> & {
	readonly priority: StoredCustomEditorPriorityInfo | RegisteredEditorPriority;
};

interface CustomEditorsMemento {
	editors?: StoredCustomEditorDescriptor[];
}

export class ContributedCustomEditors extends Disposable {

	private static readonly CUSTOM_EDITORS_STORAGE_ID = 'customEditors';
	private static readonly CUSTOM_EDITORS_ENTRY_ID = 'editors';

	private readonly _editors = new Map<string, CustomEditorInfo>();
	private readonly _memento: Memento<CustomEditorsMemento>;

	constructor(storageService: IStorageService) {
		super();

		this._memento = new Memento(ContributedCustomEditors.CUSTOM_EDITORS_STORAGE_ID, storageService);

		const mementoObject = this._memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
		for (const info of mementoObject[ContributedCustomEditors.CUSTOM_EDITORS_ENTRY_ID] || []) {
			this.add(new CustomEditorInfo(normalizeStoredCustomEditorDescriptor(info)));
		}

		this._register(customEditorsExtensionPoint.setHandler(extensions => {
			this.update(extensions);
		}));
	}

	private readonly _onChange = this._register(new Emitter<void>());
	public readonly onChange = this._onChange.event;

	private update(extensions: readonly IExtensionPointUser<ICustomEditorsExtensionPoint[]>[]) {
		this._editors.clear();

		for (const extension of extensions) {
			const hasCustomEditorPriorityProposal = extension.description.enabledApiProposals?.includes('customEditorPriority') ?? false;
			for (const webviewEditorContribution of extension.value) {
				const priority = getPriorityFromContribution(webviewEditorContribution.priority, extension.description, hasCustomEditorPriorityProposal);
				this.add(new CustomEditorInfo({
					id: webviewEditorContribution.viewType,
					displayName: webviewEditorContribution.displayName,
					providerDisplayName: extension.description.isBuiltin ? nls.localize('builtinProviderDisplayName', "Built-in") : extension.description.displayName || extension.description.identifier.value,
					selector: webviewEditorContribution.selector || [],
					priority,
				}));
			}
		}

		const mementoObject = this._memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
		mementoObject[ContributedCustomEditors.CUSTOM_EDITORS_ENTRY_ID] = Array.from(this._editors.values());
		this._memento.saveMemento();

		this._onChange.fire();
	}

	public [Symbol.iterator](): Iterator<CustomEditorInfo> {
		return this._editors.values();
	}

	public get(viewType: string): CustomEditorInfo | undefined {
		return this._editors.get(viewType);
	}

	public getContributedEditors(resource: URI): readonly CustomEditorInfo[] {
		return Array.from(this._editors.values())
			.filter(customEditor => customEditor.matches(resource));
	}

	private add(info: CustomEditorInfo): void {
		if (this._editors.has(info.id)) {
			console.error(`Custom editor with id '${info.id}' already registered`);
			return;
		}
		this._editors.set(info.id, info);
	}
}

function normalizeStoredCustomEditorDescriptor(descriptor: StoredCustomEditorDescriptor): CustomEditorDescriptor {
	return {
		id: descriptor.id,
		displayName: descriptor.displayName,
		providerDisplayName: descriptor.providerDisplayName,
		selector: descriptor.selector,
		priority: typeof descriptor.priority === 'string' ? {
			editor: descriptor.priority,
			diff: descriptor.priority,
			merge: descriptor.priority,
		} : {
			editor: descriptor.priority.editor,
			diff: descriptor.priority.diff ?? descriptor.priority.editor,
			merge: descriptor.priority.merge ?? descriptor.priority.editor,
		},
	};
}

function getPriorityFromContribution(
	contribution: ICustomEditorsExtensionPoint['priority'],
	extension: IExtensionDescription,
	includeDiffAndMergePriority: boolean,
): CustomEditorDescriptor['priority'] {
	const editorPriority = getSinglePriorityFromContribution(typeof contribution === 'string' ? contribution : contribution?.editor, extension) ?? RegisteredEditorPriority.default;
	return {
		editor: editorPriority,
		diff: includeDiffAndMergePriority && typeof contribution !== 'string' ? getSinglePriorityFromContribution(contribution?.diff, extension) ?? editorPriority : editorPriority,
		merge: includeDiffAndMergePriority && typeof contribution !== 'string' ? getSinglePriorityFromContribution(contribution?.merge, extension) ?? editorPriority : editorPriority,
	};
}

function getSinglePriorityFromContribution(value: CustomEditorPriority | undefined, extension: IExtensionDescription): RegisteredEditorPriority | undefined {
	switch (value) {
		case CustomEditorPriority.default:
			return RegisteredEditorPriority.default;

		case CustomEditorPriority.option:
			return RegisteredEditorPriority.option;

		case CustomEditorPriority.builtin:
			// Builtin is only valid for builtin extensions
			return extension.isBuiltin ? RegisteredEditorPriority.builtin : RegisteredEditorPriority.default;

		default:
			return undefined;
	}
}
