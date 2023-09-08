/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { relative } from 'path';
import { isESM } from 'vs/base/common/amd';
import { encodeBase64, VSBuffer } from 'vs/base/common/buffer';
import { FileAccess } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';

export const IWindowDevelopmentService = createDecorator<IWindowDevelopmentService>('IWindowDevelopmentService');

export interface IWindowDevelopmentService {

	_serviceBrand: undefined;

	appendDevSearchParams(uri: URI): Promise<URI>;
}

export const enum SearchParamsKeys {
	CSS_DATA = '_devCssData'
}


export class WindowDevelopmentService implements IWindowDevelopmentService {

	declare _serviceBrand: undefined;

	private _cssModules?: Promise<string[]>;

	constructor(
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@ILogService private readonly logService: ILogService
	) { }

	async appendDevSearchParams(uri: URI): Promise<URI> {

		if (this.environmentMainService.isBuilt || !isESM) {
			return uri;
		}

		if (!this._cssModules) {
			this._cssModules = this.computeCssModules();
		}

		const cssModules = await this._cssModules;

		const cssData = await new Response((await new Response(cssModules.join(',')).blob()).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();

		const params = new URLSearchParams(uri.query);
		params.append(SearchParamsKeys.CSS_DATA, encodeBase64(VSBuffer.wrap(new Uint8Array(cssData))));

		this.logService.info(`[VSCODE_DEV], sending ${cssModules.length} CSS modules (${cssData.byteLength} bytes)`);

		return uri.with({ query: params.toString() });
	}

	private async computeCssModules(): Promise<string[]> {
		const rg = await import('@vscode/ripgrep');
		return await new Promise<string[]>((resolve, reject) => {
			const chunks: string[][] = [];
			const decoder = new TextDecoder();
			const basePath = FileAccess.asFileUri('').fsPath;
			const process = spawn(rg.rgPath, ['-g', '**/*.css', '--files', basePath], {});

			process.stdout.on('data', data => {
				const chunk = decoder.decode(data, { stream: true });
				chunks.push(chunk.split('\n').filter(Boolean));
			});
			process.on('error', err => reject(err));
			process.on('close', () => {
				resolve(chunks.flat().map(path => relative(basePath, path)));
			});
		});
	}
}
