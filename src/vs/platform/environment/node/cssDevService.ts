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
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';

export const ICSSDevelopmentService = createDecorator<ICSSDevelopmentService>('ICSSDevelopmentService');

export interface ICSSDevelopmentService {

	_serviceBrand: undefined;

	isEnabled: boolean;
	getCssModules(): Promise<string[]>;
	appendDevSearchParams(uri: URI): Promise<URI>;
}

export const enum SearchParamsKeys {
	CSS_DATA = '_devCssData'
}


export class CSSDevelopmentService implements ICSSDevelopmentService {

	declare _serviceBrand: undefined;

	private _cssModules?: Promise<string[]>;

	constructor(
		@IEnvironmentService private readonly envService: IEnvironmentService,
		@ILogService private readonly logService: ILogService
	) { }

	get isEnabled(): boolean {
		return !this.envService.isBuilt && isESM;
	}

	getCssModules(): Promise<string[]> {
		this._cssModules ??= this.computeCssModules();
		return this._cssModules;
	}

	async appendDevSearchParams(uri: URI): Promise<URI> {

		if (!this.isEnabled) {
			return uri;
		}

		const cssModules = await this.getCssModules();

		const cssData = await new Response((await new Response(cssModules.join(',')).blob()).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();

		const params = new URLSearchParams(uri.query);
		params.append(SearchParamsKeys.CSS_DATA, encodeBase64(VSBuffer.wrap(new Uint8Array(cssData))));

		this.logService.info(`[VSCODE_DEV], sending ${cssModules.length} CSS modules (${cssData.byteLength} bytes)`);

		return uri.with({ query: params.toString() });
	}

	private async computeCssModules(): Promise<string[]> {
		if (!this.isEnabled) {
			return [];
		}

		const rg = await import('@vscode/ripgrep');
		return await new Promise<string[]>((resolve) => {
			const chunks: string[][] = [];
			const decoder = new TextDecoder();
			const basePath = FileAccess.asFileUri('').fsPath;
			const process = spawn(rg.rgPath, ['-g', '**/*.css', '--files', '--no-ignore', basePath], {});

			process.stdout.on('data', data => {
				const chunk = decoder.decode(data, { stream: true });
				chunks.push(chunk.split('\n').filter(Boolean));
			});
			process.on('error', err => {
				this.logService.error('FAILED to compute CSS data', err);
				resolve([]);
			});
			process.on('close', () => {
				resolve(chunks.flat().map(path => relative(basePath, path)).filter(Boolean).sort());
			});
		});
	}
}
