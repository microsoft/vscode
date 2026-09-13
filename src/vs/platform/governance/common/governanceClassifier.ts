/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Kente Workbench contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GovernanceRiskTier, GovernedActionKind, IGovernedAction, RISK_TIER_ORDER } from './governance.js';

/**
 * Kubernetes contexts that denote a cluster running on the developer's own
 * machine. Everything else is treated as shared infrastructure.
 *
 * This list is the entire basis for the "local Docker is low-friction, remote
 * clusters are not" rule, so it is deliberately an allowlist: an unrecognised
 * context escalates rather than being waved through.
 */
const LOCAL_KUBE_CONTEXTS = [
	/^minikube$/,
	/^kind-/,
	/^k3d-/,
	/^docker-desktop$/,
	/^docker-for-desktop$/,
	/^rancher-desktop$/,
	/^colima$/,
	/^orbstack$/,
];

/** Branch names whose history is shared, so pushing to them is production-impacting. */
const PROTECTED_BRANCHES = [/^main$/, /^master$/, /^release\//, /^prod/];

function isLocalKubeContext(context: string): boolean {
	return LOCAL_KUBE_CONTEXTS.some(pattern => pattern.test(context));
}

/** Reads the value of `--flag value` or `--flag=value` from an argument list. */
function readFlag(args: readonly string[], ...names: string[]): string | undefined {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		for (const name of names) {
			if (arg === name) {
				return args[i + 1];
			}
			if (arg.startsWith(`${name}=`)) {
				return arg.slice(name.length + 1);
			}
		}
	}
	return undefined;
}

/**
 * Splits a command line on shell separators so that `cd foo && kubectl apply`
 * is classified by its riskiest part rather than by `cd`.
 *
 * This is not a shell parser. It does not understand quoting, so a separator
 * inside a quoted string splits a segment that should have stayed whole. That
 * direction is safe: it produces more segments to classify, never fewer.
 */
function splitSegments(commandLine: string): string[] {
	return commandLine
		.split(/&&|\|\||[;|]/)
		.map(segment => segment.trim())
		.filter(segment => segment.length > 0);
}

function tokenize(segment: string): string[] {
	return segment.split(/\s+/).filter(token => token.length > 0);
}

/** Strips leading environment assignments and wrappers: `FOO=1 sudo kubectl ...` → `kubectl ...`. */
function stripPrefixes(tokens: string[]): { tokens: string[]; elevated: boolean } {
	let elevated = false;
	let index = 0;
	while (index < tokens.length) {
		const token = tokens[index];
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
			index++;
			continue;
		}
		if (token === 'sudo' || token === 'doas') {
			elevated = true;
			index++;
			continue;
		}
		break;
	}
	return { tokens: tokens.slice(index), elevated };
}

function classifyKubernetes(args: readonly string[]): GovernanceRiskTier {
	const context = readFlag(args, '--context');
	// No explicit context means the ambient kubeconfig decides, which we cannot
	// see from here. Assume shared infrastructure.
	if (context === undefined || !isLocalKubeContext(context)) {
		return GovernanceRiskTier.RemoteInfra;
	}
	return GovernanceRiskTier.LocalInfra;
}

function classifyDocker(args: readonly string[]): GovernanceRiskTier {
	// A docker client can be pointed at a remote daemon, at which point it is
	// no longer a local-only action.
	const host = readFlag(args, '-H', '--host');
	const context = readFlag(args, '--context');
	if (host !== undefined && !/^(unix:|npipe:|fd:|$)/.test(host)) {
		return GovernanceRiskTier.RemoteInfra;
	}
	if (context !== undefined && context !== 'default' && context !== 'desktop-linux' && context !== 'colima' && context !== 'orbstack') {
		return GovernanceRiskTier.RemoteInfra;
	}
	return GovernanceRiskTier.LocalInfra;
}

function classifyGit(args: readonly string[]): GovernanceRiskTier {
	const subcommand = args[0];
	if (subcommand !== 'push') {
		return GovernanceRiskTier.LocalWrite;
	}
	if (args.includes('--force') || args.includes('-f') || args.includes('--force-with-lease')) {
		return GovernanceRiskTier.Production;
	}
	const targetsProtectedBranch = args
		.slice(1)
		.some(arg => PROTECTED_BRANCHES.some(pattern => pattern.test(arg.replace(/^.*:/, ''))));
	return targetsProtectedBranch ? GovernanceRiskTier.Production : GovernanceRiskTier.RemoteInfra;
}

function classifyInfrastructureAsCode(args: readonly string[]): GovernanceRiskTier {
	const subcommand = args[0];
	if (subcommand === 'apply' || subcommand === 'destroy' || subcommand === 'up') {
		return GovernanceRiskTier.Production;
	}
	// `plan` and `preview` still read remote state and can hold state locks.
	return GovernanceRiskTier.RemoteInfra;
}

function classifySegment(segment: string): GovernanceRiskTier {
	const { tokens, elevated } = stripPrefixes(tokenize(segment));
	if (tokens.length === 0) {
		return GovernanceRiskTier.Read;
	}

	// Strip any directory prefix: /usr/local/bin/kubectl → kubectl
	const executable = tokens[0].split(/[\\/]/).pop() ?? tokens[0];
	const args = tokens.slice(1);

	let tier: GovernanceRiskTier;
	switch (executable) {
		case 'kubectl':
		case 'oc':
		case 'helm':
		case 'kustomize':
			tier = classifyKubernetes(args);
			break;
		case 'docker':
		case 'podman':
		case 'docker-compose':
		case 'nerdctl':
			tier = classifyDocker(args);
			break;
		case 'git':
			tier = classifyGit(args);
			break;
		case 'terraform':
		case 'tofu':
		case 'pulumi':
			tier = classifyInfrastructureAsCode(args);
			break;
		case 'aws':
		case 'gcloud':
		case 'az':
		case 'doctl':
		case 'flyctl':
		case 'kubectx':
			// Cloud CLIs address shared infrastructure by definition.
			tier = GovernanceRiskTier.RemoteInfra;
			break;
		case 'ssh':
		case 'scp':
		case 'rsync':
		case 'sftp':
			tier = GovernanceRiskTier.RemoteInfra;
			break;
		default:
			tier = GovernanceRiskTier.LocalWrite;
			break;
	}

	// Running as root is not itself remote, but it escapes the workspace, so it
	// should never be quieter than a local infrastructure change.
	if (elevated && !isRiskierThan(tier, GovernanceRiskTier.LocalInfra)) {
		tier = GovernanceRiskTier.LocalInfra;
	}
	return tier;
}

function isRiskierThan(tier: GovernanceRiskTier, other: GovernanceRiskTier): boolean {
	return RISK_TIER_ORDER.indexOf(tier) > RISK_TIER_ORDER.indexOf(other);
}

function maxTier(tiers: readonly GovernanceRiskTier[]): GovernanceRiskTier {
	return tiers.reduce(
		(highest, tier) => (isRiskierThan(tier, highest) ? tier : highest),
		GovernanceRiskTier.Read
	);
}

/**
 * Classifies a command line by its riskiest segment.
 *
 * An unrecognised executable is treated as {@link GovernanceRiskTier.LocalWrite}
 * rather than {@link GovernanceRiskTier.Read}: we cannot know that an unknown
 * binary has no side effects, and assuming it is inert is the one guess that
 * loses silently.
 */
export function classifyCommandLine(commandLine: string): GovernanceRiskTier {
	return maxTier(splitSegments(commandLine).map(classifySegment));
}

/** Built-in tools whose effect is known without inspecting a command line. */
const KNOWN_TOOL_TIERS = new Map<string, GovernanceRiskTier>([
	['read_file', GovernanceRiskTier.Read],
	['list_directory', GovernanceRiskTier.Read],
	['file_search', GovernanceRiskTier.Read],
	['grep_search', GovernanceRiskTier.Read],
	['semantic_search', GovernanceRiskTier.Read],
	['create_file', GovernanceRiskTier.LocalWrite],
	['edit_file', GovernanceRiskTier.LocalWrite],
	['apply_patch', GovernanceRiskTier.LocalWrite],
]);

/**
 * Determines the risk tier of `action`.
 *
 * Model requests are {@link GovernanceRiskTier.Read}: they have no effect on
 * the world. They pass through the gate anyway so that prompt content and cost
 * land in the audit log, which is the only place per-task spend can be
 * reconstructed.
 */
export function classifyAction(action: IGovernedAction): GovernanceRiskTier {
	if (action.kind === GovernedActionKind.Model) {
		return GovernanceRiskTier.Read;
	}

	if (action.commandLine !== undefined) {
		return classifyCommandLine(action.commandLine);
	}

	const known = KNOWN_TOOL_TIERS.get(action.name);
	if (known !== undefined) {
		return known;
	}

	// An unknown tool — an MCP server's, typically — could do anything. Treat it
	// as a local write so it is at least recorded and gateable, never as a read.
	return GovernanceRiskTier.LocalWrite;
}
