/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tmpdir } from 'os';
import { localize } from 'vs/nls';
import { TextFileService } from 'vs/workbench/services/textfile/common/textFileService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { URI } from 'vs/base/common/uri';
import { ITextSnapshot, IWriteTextFileOptions, IFileStatWithMetadata, IResourceEncoding, IResolveContentOptions, stringToSnapshot, ICreateFileOptions, FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import { Schemas } from 'vs/base/common/network';
import { exists, stat, chmod, rimraf } from 'vs/base/node/pfs';
import { join, dirname } from 'vs/base/common/path';
import { isMacintosh, isLinux } from 'vs/base/common/platform';
import product from 'vs/platform/product/node/product';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { UTF8, UTF8_with_bom, UTF16be, UTF16le, encodingExists, IDetectedEncodingResult, detectEncodingByBOM, encodeStream, UTF8_BOM, UTF16be_BOM, UTF16le_BOM } from 'vs/base/node/encoding';
import { WORKSPACE_EXTENSION } from 'vs/platform/workspaces/common/workspaces';
import { joinPath, extname, isEqualOrParent } from 'vs/base/common/resources';
import { Disposable } from 'vs/base/common/lifecycle';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { VSBufferReadable, VSBuffer } from 'vs/base/common/buffer';
import { Readable } from 'stream';
import { isUndefinedOrNull } from 'vs/base/common/types';

export class NodeTextFileService extends TextFileService {

	private _encoding: EncodingOracle;
	protected get encoding(): EncodingOracle {
		if (!this._encoding) {
			this._encoding = this._register(this.instantiationService.createInstance(EncodingOracle));
		}

		return this._encoding;
	}

	protected async doCreate(resource: URI, value?: string, options?: ICreateFileOptions): Promise<IFileStatWithMetadata> {

		// check for encoding
		const { encoding, addBOM } = await this.encoding.getWriteEncoding(resource);

		// return to parent when encoding is standard
		if (encoding === UTF8 && !addBOM) {
			return super.doCreate(resource, value, options);
		}

		// otherwise create with encoding
		return this.fileService.createFile(resource, this.getEncodedReadable(value || '', encoding, addBOM), options);
	}

	async write(resource: URI, value: string | ITextSnapshot, options?: IWriteTextFileOptions): Promise<IFileStatWithMetadata> {

		// check for overwriteReadonly property (only supported for local file://)
		try {
			if (options && options.overwriteReadonly && resource.scheme === Schemas.file && await exists(resource.fsPath)) {
				const fileStat = await stat(resource.fsPath);

				// try to change mode to writeable
				await chmod(resource.fsPath, fileStat.mode | 128);
			}
		} catch (error) {
			// ignore and simply retry the operation
		}

		// check for writeElevated property (only supported for local file://)
		if (options && options.writeElevated && resource.scheme === Schemas.file) {
			return this.writeElevated(resource, value, options);
		}

		try {

			// check for encoding
			const { encoding, addBOM } = await this.encoding.getWriteEncoding(resource, options);

			// return to parent when encoding is standard
			if (encoding === UTF8 && !addBOM) {
				return await super.write(resource, value, options);
			}

			// otherwise save with encoding
			else {
				return await this.fileService.writeFile(resource, this.getEncodedReadable(value, encoding, addBOM), options);
			}
		} catch (error) {

			// In case of permission denied, we need to check for readonly
			if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_PERMISSION_DENIED) {
				let isReadonly = false;
				try {
					const fileStat = await stat(resource.fsPath);
					if (!(fileStat.mode & 128)) {
						isReadonly = true;
					}
				} catch (error) {
					// ignore - rethrow original error
				}

				if (isReadonly) {
					throw new FileOperationError(localize('fileReadOnlyError', "File is Read Only"), FileOperationResult.FILE_READ_ONLY, options);
				}
			}

			throw error;
		}
	}

	private getEncodedReadable(value: string | ITextSnapshot, encoding: string, addBOM: boolean): VSBufferReadable {
		const readable = this.toNodeReadable(value);
		const encoder = encodeStream(encoding, { addBOM });

		const encodedReadable = readable.pipe(encoder);

		return this.toBufferReadable(encodedReadable, encoding, addBOM);
	}

	private toNodeReadable(value: string | ITextSnapshot): Readable {
		let snapshot: ITextSnapshot;
		if (typeof value === 'string') {
			snapshot = stringToSnapshot(value);
		} else {
			snapshot = value;
		}

		return new Readable({
			read: function () {
				try {
					let chunk: string | null = null;
					let canPush = true;

					// Push all chunks as long as we can push and as long as
					// the underlying snapshot returns strings to us
					while (canPush && typeof (chunk = snapshot.read()) === 'string') {
						canPush = this.push(chunk);
					}

					// Signal EOS by pushing NULL
					if (typeof chunk !== 'string') {
						this.push(null);
					}
				} catch (error) {
					this.emit('error', error);
				}
			},
			encoding: UTF8 // very important, so that strings are passed around and not buffers!
		});
	}

	private toBufferReadable(stream: NodeJS.ReadWriteStream, encoding: string, addBOM: boolean): VSBufferReadable {
		let bytesRead = 0;
		let done = false;

		return {
			read(): VSBuffer | null {
				if (done) {
					return null;
				}

				const res = stream.read();
				if (isUndefinedOrNull(res)) {
					done = true;

					// If we are instructed to add a BOM but we detect that no
					// bytes have been read, we must ensure to return the BOM
					// ourselves so that we comply with the contract.
					if (bytesRead === 0 && addBOM) {
						switch (encoding) {
							case UTF8:
							case UTF8_with_bom:
								return VSBuffer.wrap(Buffer.from(UTF8_BOM));
							case UTF16be:
								return VSBuffer.wrap(Buffer.from(UTF16be_BOM));
							case UTF16le:
								return VSBuffer.wrap(Buffer.from(UTF16le_BOM));
						}
					}

					return null;
				}

				// Handle String
				if (typeof res === 'string') {
					bytesRead += res.length;
					return VSBuffer.fromString(res);
				}

				// Handle Buffer
				else {
					bytesRead += res.byteLength;
					return VSBuffer.wrap(res);
				}
			}
		};
	}

	private async writeElevated(resource: URI, value: string | ITextSnapshot, options?: IWriteTextFileOptions): Promise<IFileStatWithMetadata> {

		// write into a tmp file first
		const tmpPath = join(tmpdir(), `code-elevated-${Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 6)}`);
		const { encoding, addBOM } = await this.encoding.getWriteEncoding(resource, options);
		await this.write(URI.file(tmpPath), value, { encoding: encoding === UTF8 && addBOM ? UTF8_with_bom : encoding });

		// sudo prompt copy
		await this.sudoPromptCopy(tmpPath, resource.fsPath, options);

		// clean up
		await rimraf(tmpPath);

		return this.fileService.resolve(resource, { resolveMetadata: true });
	}

	private async sudoPromptCopy(source: string, target: string, options?: IWriteTextFileOptions): Promise<void> {

		// load sudo-prompt module lazy
		const sudoPrompt = await import('sudo-prompt');

		return new Promise<void>((resolve, reject) => {
			const promptOptions = {
				name: this.environmentService.appNameLong.replace('-', ''),
				icns: (isMacintosh && this.environmentService.isBuilt) ? join(dirname(this.environmentService.appRoot), `${product.nameShort}.icns`) : undefined
			};

			const sudoCommand: string[] = [`"${this.environmentService.cliPath}"`];
			if (options && options.overwriteReadonly) {
				sudoCommand.push('--file-chmod');
			}

			sudoCommand.push('--file-write', `"${source}"`, `"${target}"`);

			sudoPrompt.exec(sudoCommand.join(' '), promptOptions, (error: string, stdout: string, stderr: string) => {
				if (error || stderr) {
					reject(error || stderr);
				} else {
					resolve(undefined);
				}
			});
		});
	}
}

export interface IEncodingOverride {
	parent?: URI;
	extension?: string;
	encoding: string;
}

export class EncodingOracle extends Disposable {
	protected encodingOverrides: IEncodingOverride[];

	constructor(
		@ITextResourceConfigurationService private textResourceConfigurationService: ITextResourceConfigurationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super();

		this.encodingOverrides = this.getDefaultEncodingOverrides();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Workspace Folder Change
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.encodingOverrides = this.getDefaultEncodingOverrides()));
	}

	private getDefaultEncodingOverrides(): IEncodingOverride[] {
		const defaultEncodingOverrides: IEncodingOverride[] = [];

		// Global settings
		defaultEncodingOverrides.push({ parent: URI.file(this.environmentService.appSettingsHome), encoding: UTF8 });

		// Workspace files
		defaultEncodingOverrides.push({ extension: WORKSPACE_EXTENSION, encoding: UTF8 });

		// Folder Settings
		this.contextService.getWorkspace().folders.forEach(folder => {
			defaultEncodingOverrides.push({ parent: joinPath(folder.uri, '.vscode'), encoding: UTF8 });
		});

		return defaultEncodingOverrides;
	}

	async getWriteEncoding(resource: URI, options?: IWriteTextFileOptions): Promise<{ encoding: string, addBOM: boolean }> {
		const { encoding, hasBOM } = this.doGetWriteEncoding(resource, options ? options.encoding : undefined);

		// Some encodings come with a BOM automatically
		if (hasBOM) {
			return { encoding, addBOM: true };
		}

		// Ensure that we preserve an existing BOM if found for UTF8
		// unless we are instructed to overwrite the encoding
		const overwriteEncoding = options && options.overwriteEncoding;
		if (!overwriteEncoding && encoding === UTF8 && resource.scheme === Schemas.file && await detectEncodingByBOM(resource.fsPath) === UTF8) {
			return { encoding, addBOM: true };
		}

		return { encoding, addBOM: false };
	}

	private doGetWriteEncoding(resource: URI, preferredEncoding?: string): IResourceEncoding {
		const resourceEncoding = this.getEncodingForResource(resource, preferredEncoding);

		return {
			encoding: resourceEncoding,
			hasBOM: resourceEncoding === UTF16be || resourceEncoding === UTF16le || resourceEncoding === UTF8_with_bom // enforce BOM for certain encodings
		};
	}

	getReadEncoding(resource: URI, options: IResolveContentOptions | undefined, detected: IDetectedEncodingResult): string {
		let preferredEncoding: string | undefined;

		// Encoding passed in as option
		if (options && options.encoding) {
			if (detected.encoding === UTF8 && options.encoding === UTF8) {
				preferredEncoding = UTF8_with_bom; // indicate the file has BOM if we are to resolve with UTF 8
			} else {
				preferredEncoding = options.encoding; // give passed in encoding highest priority
			}
		}

		// Encoding detected
		else if (detected.encoding) {
			if (detected.encoding === UTF8) {
				preferredEncoding = UTF8_with_bom; // if we detected UTF-8, it can only be because of a BOM
			} else {
				preferredEncoding = detected.encoding;
			}
		}

		// Encoding configured
		else if (this.textResourceConfigurationService.getValue(resource, 'files.encoding') === UTF8_with_bom) {
			preferredEncoding = UTF8; // if we did not detect UTF 8 BOM before, this can only be UTF 8 then
		}

		return this.getEncodingForResource(resource, preferredEncoding);
	}

	private getEncodingForResource(resource: URI, preferredEncoding?: string): string {
		let fileEncoding: string;

		const override = this.getEncodingOverride(resource);
		if (override) {
			fileEncoding = override; // encoding override always wins
		} else if (preferredEncoding) {
			fileEncoding = preferredEncoding; // preferred encoding comes second
		} else {
			fileEncoding = this.textResourceConfigurationService.getValue(resource, 'files.encoding'); // and last we check for settings
		}

		if (!fileEncoding || !encodingExists(fileEncoding)) {
			fileEncoding = UTF8; // the default is UTF 8
		}

		return fileEncoding;
	}

	private getEncodingOverride(resource: URI): string | undefined {
		if (this.encodingOverrides && this.encodingOverrides.length) {
			for (const override of this.encodingOverrides) {

				// check if the resource is child of encoding override path
				if (override.parent && isEqualOrParent(resource, override.parent, !isLinux /* ignorecase */)) {
					return override.encoding;
				}

				// check if the resource extension is equal to encoding override
				if (override.extension && extname(resource) === `.${override.extension}`) {
					return override.encoding;
				}
			}
		}

		return undefined;
	}
}

registerSingleton(ITextFileService, NodeTextFileService);