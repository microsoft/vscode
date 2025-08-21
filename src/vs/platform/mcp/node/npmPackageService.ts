/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

export const INpmPackageManagementService = createDecorator<INpmPackageManagementService>('INpmPackageManagementService');

export interface INpmPackageManagementService {
	readonly _serviceBrand: undefined;

	getLatestPackageVersion(packageName: string): Promise<string>;
	installPackage(packageName: string, version: string, location: string): Promise<void>;
}

export class NpmPackageService implements INpmPackageManagementService {
	readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
	) { }

	async getLatestPackageVersion(packageName: string): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			const npmProcess = spawn('npm', ['view', packageName, 'version'], {
				stdio: 'pipe'
			});

			let stdout = '';
			let stderr = '';

			npmProcess.stdout?.on('data', (data: Buffer) => {
				stdout += data.toString();
			});

			npmProcess.stderr?.on('data', (data: Buffer) => {
				stderr += data.toString();
			});

			npmProcess.on('close', (code: number) => {
				if (code === 0) {
					const version = stdout.trim();
					this.logService.debug('Retrieved package version:', packageName, version);
					resolve(version);
				} else {
					const error = new Error(`Failed to get package version for ${packageName}: ${stderr}`);
					this.logService.error('npm view failed', packageName, error);
					reject(error);
				}
			});

			npmProcess.on('error', (error: Error) => {
				this.logService.error('npm view process error', packageName, error);
				reject(error);
			});
		});
	}

	async installPackage(packageName: string, version: string, packageLocationPath: string): Promise<void> {
		const packageSpec = `${packageName}@${version}`;

		return new Promise<void>((resolve, reject) => {
			const args = ['install', '--no-save', '--no-package-lock', '--prefix', packageLocationPath, packageSpec];
			const npmProcess = spawn('npm', args, {
				stdio: 'pipe'
			});

			let stderr = '';

			npmProcess.stdout?.on('data', (data: Buffer) => {
				const output = data.toString();
				this.logService.info(`NPM install: ${packageSpec}`, output.trim());
			});

			npmProcess.stderr?.on('data', (data: Buffer) => {
				const output = data.toString();
				stderr += output;
				this.logService.error(`NPM install: ${packageSpec}`, output.trim());
			});

			npmProcess.on('close', (code: number) => {
				if (code === 0) {
					this.logService.info('NPM install completed successfully', packageSpec);
					resolve();
				} else {
					const error = new Error(`NPM install failed with code ${code}: ${stderr}`);
					this.logService.error('NPM install failed', packageSpec, packageLocationPath, error);
					reject(error);
				}
			});

			npmProcess.on('error', (error: Error) => {
				this.logService.error('npm install process error', packageSpec, packageLocationPath, error);
				reject(error);
			});
		});
	}

}
