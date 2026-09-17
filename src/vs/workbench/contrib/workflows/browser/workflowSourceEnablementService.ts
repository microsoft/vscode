/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILocalExtension } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IWorkflowSourceEnablementService } from '../common/workflowSources.js';

export class WorkflowSourceEnablementService extends Disposable implements IWorkflowSourceEnablementService {
	declare readonly _serviceBrand: undefined;
	private readonly change = this._register(new Emitter<void>());
	readonly onDidChange = this.change.event;
	private installed: Promise<ILocalExtension[]> | undefined;

	constructor(
		@IWorkbenchExtensionManagementService private readonly extensionManagementService: IWorkbenchExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly enablementService: IWorkbenchExtensionEnablementService,
	) {
		super();
		const invalidate = () => {
			this.installed = undefined;
			this.change.fire();
		};
		this._register(extensionManagementService.onDidInstallExtensions(invalidate));
		this._register(extensionManagementService.onDidUninstallExtension(invalidate));
		this._register(extensionManagementService.onDidChangeProfile(invalidate));
		this._register(extensionManagementService.onProfileAwareDidUpdateExtensionMetadata(invalidate));
		this._register(enablementService.onEnablementChanged(() => this.change.fire()));
	}

	async getSourceStates(): Promise<ReadonlyMap<string, boolean>> {
		while (!this._store.isDisposed) {
			const pending = this.installed ??= this.extensionManagementService.getInstalled();
			let installed: ILocalExtension[];
			try {
				installed = await pending;
			} catch (error) {
				if (this.installed === pending) {
					this.installed = undefined;
				}
				throw error;
			}
			if (this._store.isDisposed || pending !== this.installed) {
				continue;
			}
			const current = new Map<string, boolean>();
			for (const extension of installed) {
				const id = ExtensionIdentifier.toKey(extension.identifier.id);
				current.set(id, current.get(id) === true || this.enablementService.isEnabled(extension));
			}
			return current;
		}
		throw new Error('The workflow source enablement service has been disposed.');
	}

	override dispose(): void {
		this.installed = undefined;
		super.dispose();
	}
}
