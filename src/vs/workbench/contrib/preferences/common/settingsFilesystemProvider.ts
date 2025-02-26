/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotSupportedError } from '../../../../base/common/errors.js';
import { IDisposable, Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { FileChangeType, FilePermission, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileChange, IFileDeleteOptions, IFileOverwriteOptions, IFileSystemProviderWithFileReadWriteCapability, IStat, IWatchOptions } from '../../../../platform/files/common/files.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import * as JSONContributionRegistry from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ILogService, LogLevel } from '../../../../platform/log/common/log.js';

const schemaRegistry = Registry.as<JSONContributionRegistry.IJSONContributionRegistry>(JSONContributionRegistry.Extensions.JSONContribution);


export class SettingsFileSystemProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	static readonly SCHEMA = Schemas.vscode;

	protected readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	constructor(
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this._register(schemaRegistry.onDidChangeSchema(schemaUri => {
			this._onDidChangeFile.fire([{ resource: URI.parse(schemaUri), type: FileChangeType.UPDATED }]);
		}));
		this._register(preferencesService.onDidDefaultSettingsContentChanged(uri => {
			this._onDidChangeFile.fire([{ resource: uri, type: FileChangeType.UPDATED }]);
		}));
	}

	readonly capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.Readonly + FileSystemProviderCapabilities.FileReadWrite;

	async readFile(uri: URI): Promise<Uint8Array> {
		if (uri.scheme !== SettingsFileSystemProvider.SCHEMA) {
			throw new NotSupportedError();
		}
		let content: string | undefined;
		if (uri.authority === 'schemas') {
			content = this.getSchemaContent(uri);
		} else if (uri.authority === 'defaultsettings') {
			content = this.preferencesService.getDefaultSettingsContent(uri);
		}
		if (content) {
			return VSBuffer.fromString(content).buffer;
		}
		throw FileSystemProviderErrorCode.FileNotFound;
	}

	async stat(uri: URI): Promise<IStat> {
		if (schemaRegistry.hasSchemaContent(uri.toString()) || this.preferencesService.hasDefaultSettingsContent(uri)) {
			const currentTime = Date.now();
			return {
				type: FileType.File,
				permissions: FilePermission.Readonly,
				mtime: currentTime,
				ctime: currentTime,
				size: 0
			};
		}
		throw FileSystemProviderErrorCode.FileNotFound;
	}

	readonly onDidChangeCapabilities = Event.None;

	watch(resource: URI, opts: IWatchOptions): IDisposable { return Disposable.None; }

	async mkdir(resource: URI): Promise<void> { }
	async readdir(resource: URI): Promise<[string, FileType][]> { return []; }

	async rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> { }
	async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> { }

	async writeFile() {
		throw new NotSupportedError();
	}

	private getSchemaContent(uri: URI): string {
		const startTime = Date.now();
		const content = schemaRegistry.getSchemaContent(uri.toString()) ?? '{}' /* Use empty schema if not yet registered */;
		const logLevel = this.logService.getLevel();
		if (logLevel === LogLevel.Debug || logLevel === LogLevel.Trace) {
			const endTime = Date.now();
			const uncompressed = JSON.stringify(schemaRegistry.getSchemaContributions().schemas[uri.toString()]);
			this.logService.debug(`${uri.toString()}: ${uncompressed.length} -> ${content.length} (${Math.round((uncompressed.length - content.length) / uncompressed.length * 100)}%) Took ${endTime - startTime}ms`);
		}
		return content;
	}
}
