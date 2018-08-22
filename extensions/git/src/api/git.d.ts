/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, SourceControlInputBox, Event, CancellationToken } from 'vscode';
import * as cp from 'child_process';

export interface ExecResult<T extends string | Buffer> {
	readonly exitCode: number;
	readonly stdout: T;
	readonly stderr: string;
}

export interface SpawnOptions extends cp.SpawnOptions {
	readonly input?: string;
	readonly encoding?: string;
	readonly log?: boolean;
	readonly cancellationToken?: CancellationToken;
}

export interface Git {
	readonly path: string;
	exec(cwd: string, args: string[], options?: SpawnOptions): Promise<ExecResult<string>>;
	spawn(cwd: string, args: string[], options?: SpawnOptions): cp.ChildProcess;
}

export interface API {
	readonly git: Git;
	readonly repositories: Repository[];
	readonly onDidOpenRepository: Event<Repository>;
	readonly onDidCloseRepository: Event<Repository>;
}

export interface InputBox {
	value: string;
}

export interface Repository {
	readonly rootUri: Uri;
	readonly inputBox: InputBox;
}

declare module GitExtension { }

export interface GitExtension {

	/**
	 * Returns the latest available API compatible with the
	 * provided version range.
	 *
	 * @param range Semver version range for API compatibility.
	 * @returns API instance
	 */
	getAPI(range: string): API;

	/**
	 * Returns the collection of active repositories.
	 *
	 * @deprecated Use `API.repositories` instead.
	 */
	getRepositories(): Promise<Repository[]>;

	/**
	 * Returns the path to the current git executable.
	 *
	 * @deprecated Use `API.gitPath` instead.
	 */
	getGitPath(): Promise<string>;
}