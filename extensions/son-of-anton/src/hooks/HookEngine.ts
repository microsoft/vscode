/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Trigger events that hooks can respond to.
 */
export type HookTrigger =
	| 'onFileSave'
	| 'preCommit'
	| 'onTestFailure'
	| 'onPRCreate'
	| 'onAgentStart'
	| 'onAgentComplete';

/**
 * A hook definition as specified in .son-of-anton/hooks.json.
 */
export interface HookConfig {
	name: string;
	trigger: HookTrigger;
	filter?: string;
	agent: string;
	instruction: string;
	blocking: boolean;
}

/**
 * The full hooks configuration file structure.
 */
export interface HooksFileConfig {
	hooks: HookConfig[];
}

/**
 * Result of a hook execution.
 */
export interface HookExecutionResult {
	hookName: string;
	trigger: HookTrigger;
	agent: string;
	blocking: boolean;
	success: boolean;
	durationMs: number;
	message?: string;
}

/**
 * Callback invoked when a hook fires.
 * The engine delegates actual agent invocation to this callback.
 */
export type HookInvokeCallback = (
	hook: HookConfig,
	context: Record<string, unknown>,
) => Promise<{ success: boolean; message?: string }>;

/**
 * Event-driven hook engine that fires at specific lifecycle points.
 * Loads hooks from .son-of-anton/hooks.json and registers file watchers,
 * git hooks, and test watchers accordingly.
 */
export class HookEngine {
	private hooks: HookConfig[] = [];
	private readonly disposables: vscode.Disposable[] = [];
	private invokeCallback: HookInvokeCallback | undefined;
	private readonly disabledHooks: Set<string> = new Set();

	private readonly _onDidExecuteHook = new vscode.EventEmitter<HookExecutionResult>();
	readonly onDidExecuteHook: vscode.Event<HookExecutionResult> = this._onDidExecuteHook.event;

	/**
	 * Load hooks from a configuration object.
	 */
	loadConfig(config: HooksFileConfig): void {
		this.hooks = config.hooks ?? [];
	}

	/**
	 * Load hooks from the .son-of-anton/hooks.json file in the workspace.
	 */
	async loadFromWorkspace(): Promise<void> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return;
		}

		const configUri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.son-of-anton', 'hooks.json');

		try {
			const content = await vscode.workspace.fs.readFile(configUri);
			const config: HooksFileConfig = JSON.parse(Buffer.from(content).toString('utf-8'));
			this.loadConfig(config);
		} catch {
			// No hooks file or invalid JSON — that's fine
		}
	}

	/**
	 * Set the callback that is invoked when a hook fires.
	 */
	setInvokeCallback(callback: HookInvokeCallback): void {
		this.invokeCallback = callback;
	}

	/**
	 * Register file watchers for all onFileSave hooks.
	 */
	registerFileWatchers(): void {
		const fileSaveHooks = this.hooks.filter(h => h.trigger === 'onFileSave');

		for (const hook of fileSaveHooks) {
			const pattern = hook.filter ?? '**/*';
			const watcher = vscode.workspace.createFileSystemWatcher(pattern);

			const handleChange = (uri: vscode.Uri) => {
				if (this.isDisabled(hook.name)) {
					return;
				}
				this.executeHook(hook, { filePath: uri.fsPath, trigger: 'onFileSave' });
			};

			watcher.onDidChange(handleChange);
			watcher.onDidCreate(handleChange);

			this.disposables.push(watcher);
		}
	}

	/**
	 * Register a git pre-commit hook by watching for .git/COMMIT_EDITMSG changes.
	 * In a real setup, a git hook script would call back to the extension.
	 * Here we provide a trigger method that git hooks can invoke.
	 */
	registerGitHooks(): void {
		// Pre-commit hooks are triggered programmatically via triggerPreCommit()
		// The actual git hook script should call `sota.triggerPreCommitHook` command
	}

	/**
	 * Trigger pre-commit hooks programmatically.
	 * Returns false if any blocking hook failed (commit should be aborted).
	 */
	async triggerPreCommit(stagedFiles: string[]): Promise<boolean> {
		const preCommitHooks = this.hooks.filter(
			h => h.trigger === 'preCommit' && !this.isDisabled(h.name)
		);

		for (const hook of preCommitHooks) {
			const result = await this.executeHook(hook, {
				stagedFiles,
				trigger: 'preCommit',
			});

			if (hook.blocking && !result.success) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Trigger test failure hooks.
	 */
	async triggerTestFailure(testOutput: string, testFile?: string): Promise<void> {
		const hooks = this.hooks.filter(
			h => h.trigger === 'onTestFailure' && !this.isDisabled(h.name)
		);

		for (const hook of hooks) {
			await this.executeHook(hook, {
				testOutput,
				testFile,
				trigger: 'onTestFailure',
			});
		}
	}

	/**
	 * Trigger PR creation hooks.
	 */
	async triggerPRCreate(prDiff: string, prTitle: string): Promise<void> {
		const hooks = this.hooks.filter(
			h => h.trigger === 'onPRCreate' && !this.isDisabled(h.name)
		);

		for (const hook of hooks) {
			await this.executeHook(hook, {
				prDiff,
				prTitle,
				trigger: 'onPRCreate',
			});
		}
	}

	/**
	 * Execute a single hook with context.
	 */
	private async executeHook(
		hook: HookConfig,
		context: Record<string, unknown>,
	): Promise<HookExecutionResult> {
		const startTime = Date.now();

		if (!this.invokeCallback) {
			const result: HookExecutionResult = {
				hookName: hook.name,
				trigger: hook.trigger,
				agent: hook.agent,
				blocking: hook.blocking,
				success: false,
				durationMs: 0,
				message: 'No invoke callback registered.',
			};
			this._onDidExecuteHook.fire(result);
			return result;
		}

		try {
			const invokeResult = hook.blocking
				? await this.invokeCallback(hook, context)
				: await this.invokeInBackground(hook, context);

			const result: HookExecutionResult = {
				hookName: hook.name,
				trigger: hook.trigger,
				agent: hook.agent,
				blocking: hook.blocking,
				success: invokeResult.success,
				durationMs: Date.now() - startTime,
				message: invokeResult.message,
			};

			this._onDidExecuteHook.fire(result);
			return result;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const result: HookExecutionResult = {
				hookName: hook.name,
				trigger: hook.trigger,
				agent: hook.agent,
				blocking: hook.blocking,
				success: false,
				durationMs: Date.now() - startTime,
				message,
			};
			this._onDidExecuteHook.fire(result);
			return result;
		}
	}

	/**
	 * Run a non-blocking hook in the background.
	 */
	private async invokeInBackground(
		hook: HookConfig,
		context: Record<string, unknown>,
	): Promise<{ success: boolean; message?: string }> {
		// Fire and forget for non-blocking hooks, but still track results
		return this.invokeCallback!(hook, context);
	}

	/**
	 * Disable a hook by name.
	 */
	disableHook(hookName: string): void {
		this.disabledHooks.add(hookName);
	}

	/**
	 * Enable a previously disabled hook.
	 */
	enableHook(hookName: string): void {
		this.disabledHooks.delete(hookName);
	}

	/**
	 * Check if a hook is disabled.
	 */
	isDisabled(hookName: string): boolean {
		return this.disabledHooks.has(hookName);
	}

	/**
	 * Get all registered hooks.
	 */
	getHooks(): ReadonlyArray<HookConfig> {
		return this.hooks;
	}

	/**
	 * Get hooks for a specific trigger.
	 */
	getHooksForTrigger(trigger: HookTrigger): HookConfig[] {
		return this.hooks.filter(h => h.trigger === trigger);
	}

	/**
	 * Dispose all watchers and listeners.
	 */
	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		this._onDidExecuteHook.dispose();
	}
}
