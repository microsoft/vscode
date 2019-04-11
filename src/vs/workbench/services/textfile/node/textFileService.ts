/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tmpdir } from 'os';
import { TextFileService } from 'vs/workbench/services/textfile/common/textFileService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { URI } from 'vs/base/common/uri';
import { ITextSnapshot, IWriteTextFileOptions, IFileStatWithMetadata } from 'vs/platform/files/common/files';
import { Schemas } from 'vs/base/common/network';
import { exists, stat, chmod, rimraf } from 'vs/base/node/pfs';
import { join, dirname } from 'vs/base/common/path';
import { isMacintosh } from 'vs/base/common/platform';
import product from 'vs/platform/product/node/product';

export class NodeTextFileService extends TextFileService {

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

		return super.write(resource, value, options);
	}

	private async writeElevated(resource: URI, value: string | ITextSnapshot, options?: IWriteTextFileOptions): Promise<IFileStatWithMetadata> {

		// write into a tmp file first
		const tmpPath = join(tmpdir(), `code-elevated-${Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 6)}`);
		await this.write(URI.file(tmpPath), value, { encoding: this.fileService.encoding.getWriteEncoding(resource, options ? options.encoding : undefined).encoding });

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

registerSingleton(ITextFileService, NodeTextFileService);