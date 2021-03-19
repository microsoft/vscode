/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionManagementService, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { Emitter, Event } from 'vs/base/common/event';
import { ExtensionType, IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { FileChangeType, FileSystemProviderCapabilities, IFileService } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtUri } from 'vs/base/common/resources';
import { ILogService } from 'vs/platform/log/common/log';

export class ExtensionsWatcher extends Disposable {

	private readonly _onDidChangeExtensionsByAnotherSource = this._register(new Emitter<{ added: ILocalExtension[], removed: IExtensionIdentifier[] }>());
	readonly onDidChangeExtensionsByAnotherSource = this._onDidChangeExtensionsByAnotherSource.event;

	private startTimestamp = 0;
	private extensions: IExtensionIdentifier[] | undefined;

	constructor(
		private readonly extensionsManagementService: IExtensionManagementService,
		@IFileService fileService: IFileService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.extensionsManagementService.getInstalled(ExtensionType.User).then(extensions => {
			this.extensions = extensions.map(e => e.identifier);
			this.startTimestamp = Date.now();
		});
		this._register(extensionsManagementService.onInstallExtension(e => this.add(e.identifier)));
		this._register(Event.filter(extensionsManagementService.onDidInstallExtension, e => !!e.error)(e => this.remove(e.identifier)));
		this._register(Event.filter(extensionsManagementService.onDidUninstallExtension, e => !e.error)(e => this.remove(e.identifier)));

		const extensionsResource = URI.file(environmentService.extensionsPath);
		const extUri = new ExtUri(resource => !fileService.hasCapability(resource, FileSystemProviderCapabilities.PathCaseSensitive));
		this._register(fileService.watch(extensionsResource));
		this._register(Event.filter(fileService.onDidFilesChange,
			e => e.changes.some(change =>
				extUri.isEqual(extUri.dirname(change.resource), extensionsResource) // extensions dir is parent
				&& (change.type === FileChangeType.ADDED || change.type === FileChangeType.DELETED) // file added or removed
				&& !extUri.basename(change.resource).startsWith('.') // ignore changes to files starting with `.`
			))
			(() => this.onDidChange()));
	}

	private add(extension: IExtensionIdentifier): void {
		if (this.extensions) {
			this.remove(extension);
			this.extensions.push(extension);
		}
	}

	private remove(identifier: IExtensionIdentifier): void {
		if (this.extensions) {
			this.extensions = this.extensions.filter(e => !areSameExtensions(e, identifier));
		}
	}

	private async onDidChange(): Promise<void> {
		if (this.extensions) {
			const extensions = await this.extensionsManagementService.getInstalled(ExtensionType.User);
			const added = extensions.filter(e => {
				if (this.extensions!.every(identifier => !areSameExtensions(e.identifier, identifier))) {
					if (e.installedTimestamp && e.installedTimestamp > this.startTimestamp) {
						this.logService.info('Detected extension installed from another source', e.identifier.id);
						return true;
					} else {
						this.logService.info('Ignored extension installed by another source because of invalid timestamp', e.identifier.id);
					}
				}
				return false;
			});
			const removed = this.extensions.filter(identifier => {
				if (extensions.every(e => !areSameExtensions(e.identifier, identifier))) {
					this.logService.info('Detected extension removed from another source', identifier.id);
					return true;
				}
				return false;
			});
			this.extensions = extensions.map(e => e.identifier);
			if (added.length || removed.length) {
				this._onDidChangeExtensionsByAnotherSource.fire({ added, removed });
			}
		}
	}

}
