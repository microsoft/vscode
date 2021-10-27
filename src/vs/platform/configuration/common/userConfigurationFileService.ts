/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { JSONPath, parse, ParseError } from 'vs/base/common/json';
import { setProperty } from 'vs/base/common/jsonEdit';
import { Edit, FormattingOptions } from 'vs/base/common/jsonFormatter';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { FileOperationError, FileOperationResult, IFileService, IWriteFileOptions } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';

export const enum UserConfigurationErrorCode {
	ERROR_INVALID_FILE = 'ERROR_INVALID_FILE',
	ERROR_FILE_MODIFIED_SINCE = 'ERROR_FILE_MODIFIED_SINCE'
}

export interface IJSONValue {
	path: JSONPath;
	value: any;
}

export const UserConfigurationFileServiceId = 'IUserConfigurationFileService';
export const IUserConfigurationFileService = createDecorator<IUserConfigurationFileService>(UserConfigurationFileServiceId);

export interface IUserConfigurationFileService {
	readonly _serviceBrand: undefined;

	updateSettings(value: IJSONValue, formattingOptions: FormattingOptions): Promise<void>;
	write(value: VSBuffer, options?: IWriteFileOptions): Promise<void>;
}

export class UserConfigurationFileService implements IUserConfigurationFileService {

	readonly _serviceBrand: undefined;

	private readonly queue: Queue<void>;

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		this.queue = new Queue<void>();
	}

	async updateSettings(value: IJSONValue, formattingOptions: FormattingOptions): Promise<void> {
		return this.queue.queue(() => this.doWrite(value, formattingOptions)); // queue up writes to prevent race conditions
	}

	private async doWrite(jsonValue: IJSONValue, formattingOptions: FormattingOptions): Promise<void> {
		this.logService.trace(`${UserConfigurationFileServiceId}#write`, this.environmentService.settingsResource.toString(), jsonValue);
		const { value, mtime, etag } = await this.fileService.readFile(this.environmentService.settingsResource, { atomic: true });
		let content = value.toString();

		const parseErrors: ParseError[] = [];
		parse(content, parseErrors, { allowTrailingComma: true, allowEmptyContent: true });
		if (parseErrors.length) {
			throw new Error(UserConfigurationErrorCode.ERROR_INVALID_FILE);
		}

		const edit = this.getEdits(jsonValue, content, formattingOptions)[0];
		if (edit) {
			content = content.substring(0, edit.offset) + edit.content + content.substring(edit.offset + edit.length);
			try {
				await this.fileService.writeFile(this.environmentService.settingsResource, VSBuffer.fromString(content), { etag, mtime });
			} catch (error) {
				if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
					throw new Error(UserConfigurationErrorCode.ERROR_FILE_MODIFIED_SINCE);
				}
			}
		}
	}

	async write(content: VSBuffer, options?: IWriteFileOptions): Promise<void> {
		// queue up writes to prevent race conditions
		return this.queue.queue(async () => {
			await this.fileService.writeFile(this.environmentService.settingsResource, content, options);
		});
	}

	private getEdits({ value, path }: IJSONValue, modelContent: string, formattingOptions: FormattingOptions): Edit[] {
		if (path.length) {
			return setProperty(modelContent, path, value, formattingOptions);
		}

		// Without jsonPath, the entire configuration file is being replaced, so we just use JSON.stringify
		const content = JSON.stringify(value, null, formattingOptions.insertSpaces && formattingOptions.tabSize ? ' '.repeat(formattingOptions.tabSize) : '\t');
		return [{
			content,
			length: modelContent.length,
			offset: 0
		}];
	}
}

