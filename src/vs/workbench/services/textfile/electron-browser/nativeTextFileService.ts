/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { AbstractTextFileService } from 'vs/workbench/services/textfile/browser/textFileService';
import { ITextFileService, ITextFileStreamContent, ITextFileContent, IReadTextFileOptions, IWriteTextFileOptions, stringToSnapshot, TextFileOperationResult, TextFileOperationError } from 'vs/workbench/services/textfile/common/textfiles';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { URI } from 'vs/base/common/uri';
import { IFileStatWithMetadata, FileOperationError, FileOperationResult, IFileStreamContent, IFileService } from 'vs/platform/files/common/files';
import { Schemas } from 'vs/base/common/network';
import { stat, chmod, MAX_FILE_SIZE, MAX_HEAP_SIZE } from 'vs/base/node/pfs';
import { join, dirname } from 'vs/base/common/path';
import { isMacintosh } from 'vs/base/common/platform';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfigurationService';
import { UTF8, UTF8_with_bom, toDecodeStream, toEncodeReadable, IDecodeStreamResult } from 'vs/workbench/services/textfile/common/encoding';
import { bufferToStream, VSBufferReadable, VSBuffer } from 'vs/base/common/buffer';
import { createTextBufferFactoryFromStream } from 'vs/editor/common/model/textModel';
import { ITextSnapshot } from 'vs/editor/common/model';
import { consumeStream } from 'vs/base/common/stream';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IDialogService, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-browser/environmentService';
import { ILogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';

export class NativeTextFileService extends AbstractTextFileService {

	constructor(
		@IFileService fileService: IFileService,
		@IUntitledTextEditorService untitledTextEditorService: IUntitledTextEditorService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@IWorkbenchEnvironmentService protected environmentService: INativeWorkbenchEnvironmentService,
		@IDialogService dialogService: IDialogService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IProductService private readonly productService: IProductService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@ITextModelService textModelService: ITextModelService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IPathService pathService: IPathService,
		@IWorkingCopyFileService workingCopyFileService: IWorkingCopyFileService,
		@ILogService private readonly logService: ILogService,
		@IUriIdentityService uriIdentityService: IUriIdentityService
	) {
		super(fileService, untitledTextEditorService, lifecycleService, instantiationService, modelService, environmentService, dialogService, fileDialogService, textResourceConfigurationService, filesConfigurationService, textModelService, codeEditorService, pathService, workingCopyFileService, uriIdentityService);
	}

	async read(resource: URI, options?: IReadTextFileOptions): Promise<ITextFileContent> {
		const [bufferStream, decoder] = await this.doRead(resource, {
			...options,
			// optimization: since we know that the caller does not
			// care about buffering, we indicate this to the reader.
			// this reduces all the overhead the buffered reading
			// has (open, read, close) if the provider supports
			// unbuffered reading.
			preferUnbuffered: true
		});

		return {
			...bufferStream,
			encoding: decoder.detected.encoding || UTF8,
			value: await consumeStream(decoder.stream, strings => strings.join(''))
		};
	}

	async readStream(resource: URI, options?: IReadTextFileOptions): Promise<ITextFileStreamContent> {
		const [bufferStream, decoder] = await this.doRead(resource, options);

		return {
			...bufferStream,
			encoding: decoder.detected.encoding || UTF8,
			value: await createTextBufferFactoryFromStream(decoder.stream)
		};
	}

	private async doRead(resource: URI, options?: IReadTextFileOptions & { preferUnbuffered?: boolean }): Promise<[IFileStreamContent, IDecodeStreamResult]> {

		// ensure limits
		options = this.ensureLimits(options);

		// read stream raw (either buffered or unbuffered)
		let bufferStream: IFileStreamContent;
		if (options.preferUnbuffered) {
			const content = await this.fileService.readFile(resource, options);
			bufferStream = {
				...content,
				value: bufferToStream(content.value)
			};
		} else {
			bufferStream = await this.fileService.readFileStream(resource, options);
		}

		// read through encoding library
		const decoder = await toDecodeStream(bufferStream.value, {
			guessEncoding: options?.autoGuessEncoding || this.textResourceConfigurationService.getValue(resource, 'files.autoGuessEncoding'),
			overwriteEncoding: detectedEncoding => this.encoding.getReadEncoding(resource, options, detectedEncoding)
		});

		// validate binary
		if (options?.acceptTextOnly && decoder.detected.seemsBinary) {
			throw new TextFileOperationError(localize('fileBinaryError', "File seems to be binary and cannot be opened as text"), TextFileOperationResult.FILE_IS_BINARY, options);
		}

		return [bufferStream, decoder];
	}

	private ensureLimits(options?: IReadTextFileOptions): IReadTextFileOptions {
		let ensuredOptions: IReadTextFileOptions;
		if (!options) {
			ensuredOptions = Object.create(null);
		} else {
			ensuredOptions = options;
		}

		let ensuredLimits: { size?: number; memory?: number; };
		if (!ensuredOptions.limits) {
			ensuredLimits = Object.create(null);
			ensuredOptions.limits = ensuredLimits;
		} else {
			ensuredLimits = ensuredOptions.limits;
		}

		if (typeof ensuredLimits.size !== 'number') {
			ensuredLimits.size = MAX_FILE_SIZE;
		}

		if (typeof ensuredLimits.memory !== 'number') {
			ensuredLimits.memory = Math.max(typeof this.environmentService.args['max-memory'] === 'string' ? parseInt(this.environmentService.args['max-memory']) * 1024 * 1024 || 0 : 0, MAX_HEAP_SIZE);
		}

		return ensuredOptions;
	}

	protected async doEncodeText(resource: URI, value?: string | ITextSnapshot): Promise<VSBuffer | VSBufferReadable | undefined> {

		// check for encoding
		const { encoding, addBOM } = await this.encoding.getWriteEncoding(resource);

		// return to parent when encoding is standard
		if (encoding === UTF8 && !addBOM) {
			return super.doEncodeText(resource, value);
		}

		// otherwise create with encoding
		const encodedReadable = await this.getEncodedReadable(value || '', encoding, addBOM);

		return encodedReadable;
	}

	async write(resource: URI, value: string | ITextSnapshot, options?: IWriteTextFileOptions): Promise<IFileStatWithMetadata> {

		// check for overwriteReadonly property (only supported for local file://)
		try {
			if (options?.overwriteReadonly && resource.scheme === Schemas.file && await this.fileService.exists(resource)) {
				const fileStat = await stat(resource.fsPath);

				// try to change mode to writeable
				await chmod(resource.fsPath, fileStat.mode | 128);
			}
		} catch (error) {
			// ignore and simply retry the operation
		}

		// check for writeElevated property (only supported for local file://)
		if (options?.writeElevated && resource.scheme === Schemas.file) {
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
				const encodedReadable = await this.getEncodedReadable(value, encoding, addBOM);
				return await this.fileService.writeFile(resource, encodedReadable, options);
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

	private getEncodedReadable(value: string | ITextSnapshot, encoding: string, addBOM: boolean): Promise<VSBufferReadable> {
		const snapshot = typeof value === 'string' ? stringToSnapshot(value) : value;
		return toEncodeReadable(snapshot, encoding, { addBOM });
	}

	private async writeElevated(resource: URI, value: string | ITextSnapshot, options?: IWriteTextFileOptions): Promise<IFileStatWithMetadata> {

		// write into a tmp file first
		const source = URI.file(join(this.environmentService.userDataPath, `code-elevated-${Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 6)}`));
		const { encoding, addBOM } = await this.encoding.getWriteEncoding(resource, options);
		try {
			await this.write(source, value, { encoding: encoding === UTF8 && addBOM ? UTF8_with_bom : encoding });

			// sudo prompt copy
			await this.sudoPromptCopy(source, resource, options);
		} finally {

			// clean up
			await this.fileService.del(source);
		}

		return this.fileService.resolve(resource, { resolveMetadata: true });
	}

	private async sudoPromptCopy(source: URI, target: URI, options?: IWriteTextFileOptions): Promise<void> {

		// load sudo-prompt module lazy
		const sudoPrompt = await import('sudo-prompt');

		return new Promise<void>((resolve, reject) => {
			const promptOptions = {
				name: this.productService.nameLong.replace('-', ''),
				icns: (isMacintosh && this.environmentService.isBuilt) ? join(dirname(this.environmentService.appRoot), `${this.productService.nameShort}.icns`) : undefined
			};

			const sudoCommand: string[] = [`"${this.environmentService.cliPath}"`];
			if (options?.overwriteReadonly) {
				sudoCommand.push('--file-chmod');
			}

			sudoCommand.push('--file-write', `"${source.fsPath}"`, `"${target.fsPath}"`);

			sudoPrompt.exec(sudoCommand.join(' '), promptOptions, (error: string, stdout: string, stderr: string) => {
				if (stdout) {
					this.logService.trace(`[sudo-prompt] received stdout: ${stdout}`);
				}

				if (stderr) {
					this.logService.trace(`[sudo-prompt] received stderr: ${stderr}`);
				}

				if (error) {
					reject(error);
				} else {
					resolve(undefined);
				}
			});
		});
	}
}

registerSingleton(ITextFileService, NativeTextFileService);
