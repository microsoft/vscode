/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Workbench } from './workbench';
import { Code, launch, LaunchOptions } from './code';
import { Logger } from './logger';

export const enum Quality {
	Dev,
	Insiders,
	Stable
}

export interface ApplicationOptions extends LaunchOptions {
	quality: Quality;
	workspacePath: string;
	waitTime: number;
}

export class Application {

	constructor(private options: ApplicationOptions) {
		this._userDataPath = options.userDataDir;
		this._workspacePathOrFolder = options.workspacePath;
	}

	private _code: Code | undefined;
	get code(): Code { return this._code!; }

	private _workbench: Workbench | undefined;
	get workbench(): Workbench { return this._workbench!; }

	get quality(): Quality {
		return this.options.quality;
	}

	get logger(): Logger {
		return this.options.logger;
	}

	get remote(): boolean {
		return !!this.options.remote;
	}

	get web(): boolean {
		return !!this.options.web;
	}

	private _workspacePathOrFolder: string;
	get workspacePathOrFolder(): string {
		return this._workspacePathOrFolder;
	}

	get extensionsPath(): string {
		return this.options.extensionsPath;
	}

	private _userDataPath: string;
	get userDataPath(): string {
		return this._userDataPath;
	}

	async start(): Promise<any> {
		await this._start();
		await this.code.waitForElement('.explorer-folders-view');
	}

	async restart(options?: { workspaceOrFolder?: string, extraArgs?: string[] }): Promise<any> {
		await this.stop();
		await this._start(options?.workspaceOrFolder, options?.extraArgs);
	}

	private async _start(workspaceOrFolder = this.workspacePathOrFolder, extraArgs: string[] = []): Promise<any> {
		this._workspacePathOrFolder = workspaceOrFolder;

		const code = await this.startApplication(extraArgs);
		await this.checkWindowReady(code);
	}

	async stop(): Promise<any> {
		if (this._code) {
			try {
				await this._code.exit();
			} finally {
				this._code = undefined;
			}
		}
	}

	async startTracing(name: string): Promise<void> {
		await this._code?.startTracing(name);
	}

	async stopTracing(name: string, persist: boolean): Promise<void> {
		await this._code?.stopTracing(name, persist);
	}

	private async startApplication(extraArgs: string[] = []): Promise<Code> {
		const code = this._code = await launch({
			...this.options,
			extraArgs: [...(this.options.extraArgs || []), ...extraArgs],
		});

		this._workbench = new Workbench(this._code, this.userDataPath);

		return code;
	}

	private async checkWindowReady(code: Code): Promise<any> {
		await code.waitForWindowIds(ids => ids.length > 0);
		await code.waitForElement('.monaco-workbench');

		if (this.remote) {
			await code.waitForTextContent('.monaco-workbench .statusbar-item[id="status.host"]', ' TestResolver', undefined, 2000);
		}

		// wait a bit, since focus might be stolen off widgets
		// as soon as they open (e.g. quick access)
		await new Promise(c => setTimeout(c, 1000));
	}
}
