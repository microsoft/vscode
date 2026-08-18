/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The implementation-under-test seam.
 *
 * Everything above this file talks to the Agent Host Protocol over a WebSocket
 * and asserts on protocol traffic and real side effects. This file is the only
 * place that knows *how* to start a concrete Agent Host implementation.
 *
 * Swapping the target is therefore the whole porting story for running this
 * suite against a different implementation that speaks AHP: provide an
 * {@link IAgentHostTarget} and the conformance tier applies unchanged.
 *
 * Note the two boundaries a target must honor for deterministic replay:
 * - it must accept an upstream model URL override (so `CapiReplayProxy` can sit
 *   in front of the model boundary), and
 * - it must isolate persistent state under the supplied home / user-data dirs.
 */

import { startRealServer, type IServerHandle } from '../../serverIntegrationTestHelpers.js';
import type { CapiReplayMode, CapiReplayProxy } from './capiReplayProxy.js';

export interface IAgentHostTargetLaunchOptions {
	/** Absolute path to a home directory the implementation must confine provider config to. */
	readonly homeDir: string;
	/** Absolute path to a user-data directory the implementation must confine its own state to. */
	readonly userDataDir: string;
	/** Absolute path to the Codex home directory. */
	readonly codexHomeDir: string;
	/** Record/replay proxy configuration fronting the model boundary. */
	readonly capiReplay: { readonly fixturePath: string; readonly mode?: CapiReplayMode; readonly real?: boolean };
	/** Existing replay proxy whose consumed exchange sequence must survive a target restart. */
	readonly existingCapiReplay?: CapiReplayProxy;
	/** Optional dev override for a locally installed Claude SDK root. */
	readonly claudeSdkRoot?: string;
	/** Optional dev override for a locally installed Codex SDK root. */
	readonly codexSdkRoot?: string;
	/** Optional agent-host log level (`--log <level>`); `trace` also raises the bundled SDK/CLI to its most verbose. */
	readonly logLevel?: string;
	/** Optional environment overrides for implementation lifecycle test hooks. */
	readonly env?: Readonly<Record<string, string>>;
}

/**
 * Describes an Agent Host implementation the suite can run against.
 */
export interface IAgentHostTarget {
	/** Stable id used in reporting and coverage artifacts. */
	readonly id: string;
	/**
	 * Launch the implementation and resolve once it is accepting AHP
	 * connections. The handle exposes the port to connect to, the child process
	 * for lifecycle management, and the replay proxy fronting the model
	 * boundary.
	 */
	launch(options: IAgentHostTargetLaunchOptions): Promise<IServerHandle>;
}

/**
 * The in-tree VS Code agent host server (`agentHostServerMain.ts`).
 */
export const vscodeAgentHostTarget: IAgentHostTarget = {
	id: 'vscode-agent-host',
	launch(options) {
		return startRealServer({
			homeDir: options.homeDir,
			userDataDir: options.userDataDir,
			codexHomeDir: options.codexHomeDir,
			capiReplay: options.capiReplay,
			existingCapiReplay: options.existingCapiReplay,
			claudeSdkRoot: options.claudeSdkRoot,
			codexSdkRoot: options.codexSdkRoot,
			logLevel: options.logLevel,
			env: options.env,
		});
	},
};

/** The target the suite runs against by default. */
export const defaultAgentHostTarget: IAgentHostTarget = vscodeAgentHostTarget;
