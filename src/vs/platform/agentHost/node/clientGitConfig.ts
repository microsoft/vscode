/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendFile, mkdir, readFile, stat, writeFile } from 'fs/promises';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { dirname, isAbsolute, join, posix, relative, resolve } from '../../../base/common/path.js';
import type { ClientGitConfig } from '../common/clientForwardingProtocol.js';
import { IClientForwardingHost, parseGpgDirs } from './clientForwardingHost.js';
import { ISshExec, shellEscape } from './sshRemoteAgentHostHelpers.js';

function isLiteralSshKey(key: string): boolean {
	return key.startsWith('key::') || /^(ssh|ecdsa|sk)-/.test(key);
}

/** A path relative to `home` for `path`, or `undefined` when it is outside of `home`. */
function getHomeRelativePath(home: string, path: string): string | undefined {
	const relativePath = relative(home, resolve(home, /^~[/\\]/.test(path) ? join(home, path.substring(2)) : path));
	return relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath) ? relativePath : undefined;
}

// ---- Client side ------------------------------------------------------------

/**
 * Reads the Git identity the client uses for a folder, which follows its conditional includes, and, when `full`, its
 * global Git configuration and the files in its home folder that settings name, like Dev Containers copies them.
 */
export async function readClientGitConfig(host: IClientForwardingHost, full: boolean, folder: string | undefined): Promise<ClientGitConfig> {
	const git = async (args: readonly string[]) => {
		const result = await host.run('git', args).catch(() => undefined);
		const value = result?.code === 0 ? result.stdout.toString().replace(/\r?\n$/, '') : '';
		return value || undefined;
	};
	// Git prefers HOME, also on Windows.
	const home = host.environment.HOME || host.homedir;
	const configPath = join(home, '.gitconfig');
	const xdgConfigPath = join(host.environment.XDG_CONFIG_HOME || join(home, '.config'), 'git', 'config');
	// Like Git, from both global files, the later winning. Not `--global`, which reads only one of them.
	const readGlobal = async (key: string) => await git(['config', '--includes', '--file', configPath, '--get', key]) ?? await git(['config', '--includes', '--file', xdgConfigPath, '--get', key]);
	const readIdentity = async (key: string) => (folder ? await git(['-C', folder, 'config', '--get', key]) : undefined) ?? await readGlobal(key);
	const [name, email] = await Promise.all([readIdentity('user.name'), readIdentity('user.email')]);
	const user = { ...(name ? { name } : {}), ...(email ? { email } : {}) };
	if (!full) {
		return { user };
	}
	const [config, xdgConfig] = await Promise.all([host.readFile(configPath), host.readFile(xdgConfigPath)]);
	if (!config && !xdgConfig) {
		return { user };
	}
	const files: { key: string; path: string; content: string }[] = [];
	const addHomeFile = async (key: string, configured: string | undefined) => {
		const path = configured && getHomeRelativePath(home, configured);
		const content = path && await host.readFile(join(home, path));
		if (path && content) {
			files.push({ key, path: path.replace(/\\/g, '/'), content: encodeBase64(VSBuffer.wrap(content)) });
		}
	};
	const [allowedSigners, format, signingKey] = await Promise.all(['gpg.ssh.allowedSignersFile', 'gpg.format', 'user.signingkey'].map(key => readGlobal(key)));
	await addHomeFile('gpg.ssh.allowedSignersFile', allowedSigners);
	if (format?.toLowerCase() === 'ssh' && signingKey && !isLiteralSshKey(signingKey) && signingKey.endsWith('.pub')) {
		// With the forwarded agent, the public key is all SSH signing needs.
		await addHomeFile('user.signingkey', signingKey);
	}
	return {
		user,
		...(config ? { config: encodeBase64(VSBuffer.wrap(config)) } : {}),
		...(xdgConfig ? { xdgConfig: encodeBase64(VSBuffer.wrap(xdgConfig)) } : {}),
		...(files.length ? { files } : {}),
	};
}

// ---- Agent host side --------------------------------------------------------

/** Where the agent host's Git looks for its configuration, and how to run commands there. */
export interface IClientGitConfigTarget {
	readonly home: string;
	readonly xdgConfigHome: string;
	/** Runs Git in the home folder; `undefined` when Git is not installed. */
	git(args: readonly string[]): Promise<{ readonly stdout: string; readonly code: number } | undefined>;
	/** Runs a POSIX shell command in the home folder; `undefined` without one, e.g., on Windows. */
	readonly exec: ISshExec | undefined;
}

/** The client's agents this agent host forwards. */
export interface IClientGitSigningAgents {
	readonly sshAgent: boolean;
	readonly gpgAgent: boolean;
}

/** Starts a configuration copied from a client, which is copied only once. */
const copiedGitConfigMarker = '# Copied from the client by VS Code.';

/**
 * Like Dev Containers, copies only into a configuration with only sections tools add, e.g., Git LFS or `safe.directory`,
 * and also into one with only an identity, e.g., one set for an earlier client that did not supply its configuration.
 */
export function canCopyGitConfig(existing: string | undefined): boolean {
	return existing === undefined || !existing.includes(copiedGitConfigMarker) && existing.split(/\r?\n/).filter(line => line.startsWith('[')).every(line => /^\[(filter|safe|user)([ \t]+|\])/.test(line));
}

async function exists(path: string): Promise<boolean> {
	return stat(path).then(() => true, () => false);
}

/** @returns Whether the file was written; an existing one is kept. */
async function writeNewFile(path: string, content: Uint8Array): Promise<boolean> {
	await mkdir(dirname(path), { recursive: true });
	try {
		await writeFile(path, content, { flag: 'wx' });
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
			return false;
		}
		throw error;
	}
}

/**
 * Copies the client's Git configuration where the agent host has none of its own, like Dev Containers, removes settings
 * that cannot work there, and sets the client's identity where the agent host has none or the copy lacks the client
 * folder's. Asks the client only when there is something to do.
 * @param offersConfig Whether the client supplies its configuration, e.g., not to a sandboxed container.
 */
export async function applyClientGitConfig(
	target: IClientGitConfigTarget,
	offersConfig: boolean,
	agents: IClientGitSigningAgents,
	requestGitConfig: () => Promise<ClientGitConfig>,
	log: (message: string) => void,
): Promise<void> {
	const getValue = async (key: string) => {
		const result = await target.git(['config', '--get', key]);
		return result && (result.code === 0 ? result.stdout.trim() : '');
	};
	const currentName = await getValue('user.name');
	if (currentName === undefined) {
		log('Git: Not installed, not configuring it.');
		return;
	}
	const configPath = join(target.home, '.gitconfig');
	const xdgConfigPath = join(target.xdgConfigHome, 'git', 'config');
	const existing = await readFile(configPath, 'utf8').catch(() => undefined);
	const copy = offersConfig && !!target.exec;
	const copyConfig = copy && canCopyGitConfig(existing);
	const copyXdgConfig = copy && !await exists(xdgConfigPath);
	if (!copyConfig && !copyXdgConfig && currentName && await getValue('user.email')) {
		return;
	}

	const gitConfig = await requestGitConfig();
	const copiedFiles: string[] = [];
	if (copyConfig && gitConfig.config) {
		const content = Buffer.concat([Buffer.from(`${copiedGitConfigMarker}\n`), decodeBase64(gitConfig.config).buffer]);
		if (existing === undefined) {
			if (await writeNewFile(configPath, content)) {
				copiedFiles.push(configPath);
			}
		} else {
			// A file that does not end with a newline would join its last line with the first one written.
			await appendFile(configPath, existing && !existing.endsWith('\n') ? Buffer.concat([Buffer.from('\n'), content]) : content);
			copiedFiles.push(configPath);
		}
	}
	if (copyXdgConfig && gitConfig.xdgConfig && await writeNewFile(xdgConfigPath, decodeBase64(gitConfig.xdgConfig).buffer)) {
		copiedFiles.push(xdgConfigPath);
	}
	const copied = copiedFiles.length > 0;
	if (copied && target.exec) {
		log('Git: Copied the client\'s Git configuration.');
		// Only the copied files, as `--global` writes only to one of them.
		await removeUnavailableGitConfig(target.exec, copiedFiles, log);
		for (const file of gitConfig.files ?? []) {
			const path = getHomeRelativePath(target.home, file.path);
			if (path) {
				const absolute = join(target.home, path);
				await writeNewFile(absolute, decodeBase64(file.content).buffer);
				await target.git(['config', '--global', file.key, absolute]);
			}
		}
		await removeUnavailableSigning(target.exec, copiedFiles, await getSigningSupport(target.exec, agents), log);
	}

	for (const [key, value] of [['user.name', gitConfig.user.name], ['user.email', gitConfig.user.email]] as const) {
		const current = value && await getValue(key);
		// A copied configuration lacks the client folder's conditional includes, e.g., for a work email, and may add a
		// second value to an earlier identity, which replacing all leaves as one.
		if (value && (!current || copied)) {
			await target.git(['config', '--global', '--replace-all', key, value]);
			if (current !== value) {
				log(`Git: Set ${key} to the client's.`);
			}
		}
	}
}

/** Signing the client's agents support, and GPG signing with keys of the agent host's own, which it then uses. */
async function getSigningSupport(exec: ISshExec, agents: IClientGitSigningAgents): Promise<IDevContainerGitSigningSupport> {
	const { stdout } = await exec('gpgconf --list-dirs 2>/dev/null', { ignoreExitCode: true });
	const homedir = parseGpgDirs(stdout, false).homedir;
	const ownKeys = !!homedir && !!(await exec(`ls ${shellEscape(posix.join(homedir, 'private-keys-v1.d'))} 2>/dev/null`, { ignoreExitCode: true })).stdout.trim();
	return { sshAgent: agents.sshAgent, gpgSigning: !!homedir && (ownKeys || agents.gpgAgent) };
}

interface IDevContainerGitSigningSupport {
	/** Whether the client's SSH agent is forwarded. */
	readonly sshAgent: boolean;
	/** Whether GPG signing can work, with the client's agent or the agent host's own keys. */
	readonly gpgSigning: boolean;
}

async function removeUnavailableGitConfig(exec: ISshExec, files: readonly string[], log: (message: string) => void): Promise<void> {
	const { stdout } = await exec(`helper_available() {
	h="$1"
	case "$h" in
		'!'*) h="\${h#!}" ;;
		/*) ;;
		*) h="git-credential-$h" ;;
	esac
	set -- $h
	case "$1" in
		'') return 1 ;;
		# Shell functions cannot be checked.
		*'('*|*'{'*) return 0 ;;
	esac
	command -v "$1" >/dev/null 2>&1 || [ -x "$(git --exec-path)/$1" ]
}
for f in ${files.map(file => shellEscape(file)).join(' ')}
do
	for key in core.editor core.sshCommand gpg.program gpg.openpgp.program gpg.x509.program gpg.ssh.program
	do
		value="$(git config --file "$f" --get "$key")"
		executable="\${value%% *}"
		[ -z "$executable" ] && continue
		command -v "$executable" >/dev/null 2>&1 || { echo "Git: Removing Git config key: $key = $value"; git config --file "$f" --unset "$key"; }
	done
	git config --file "$f" --unset http.sslBackend
	# Helpers of the client, e.g., a keychain, fail here. An empty value resets the helpers, so a URL's helpers are removed
	# together with its reset, which lets the remaining helpers serve that URL again.
	git config --file "$f" --name-only --get-regexp '^credential\\..*helper$' 2>/dev/null | sort -u | while IFS= read -r key
	do
		status="$(git config --file "$f" --get-all "$key" | while IFS= read -r value
		do
			[ -z "$value" ] && continue
			helper_available "$value" && echo available || echo missing
		done)"
		case "$status" in
			*available*) ;;
			*missing*) echo "Git: Removing Git config key: $key"; git config --file "$f" --unset-all "$key" ;;
		esac
	done
done
true`, { ignoreExitCode: true });
	for (const line of stdout.split('\n')) {
		if (line.trim()) {
			log(line.trim());
		}
	}
}

/** Removes commit and tag signing of the copied files that cannot work here, where Git cannot ask for a passphrase. */
async function removeUnavailableSigning(exec: ISshExec, files: readonly string[], signing: IDevContainerGitSigningSupport, log: (message: string) => void): Promise<void> {
	const enabled: { readonly key: string; readonly file: string }[] = [];
	for (const file of files) {
		for (const key of ['commit.gpgsign', 'tag.gpgsign']) {
			const { stdout } = await exec(`git config --file ${shellEscape(file)} --get ${key}`, { ignoreExitCode: true });
			if (/^(true|yes|on|1)$/i.test(stdout.trim())) {
				enabled.push({ key, file });
			}
		}
	}
	if (!enabled.length) {
		return;
	}
	// The signing settings Git uses, which may also come from configuration of the agent host's own. Not `--global`,
	// which reads only one of the global files.
	const keys = ['gpg.format', 'user.signingkey', 'gpg.program', 'gpg.openpgp.program', 'gpg.x509.program', 'gpg.ssh.program', 'gpg.ssh.defaultKeyCommand'];
	const result = await exec(`for k in ${keys.join(' ')}; do printf '%s=%s\\n' "$k" "$(git config --get "$k")"; done`, { ignoreExitCode: true });
	const values = new Map<string, string>();
	for (const line of result.stdout.split('\n')) {
		const separator = line.indexOf('=');
		if (separator !== -1) {
			values.set(line.substring(0, separator), line.substring(separator + 1));
		}
	}
	const format = (values.get('gpg.format') || 'openpgp').toLowerCase();
	const program = format === 'ssh' ? values.get('gpg.ssh.program') || 'ssh-keygen'
		: format === 'x509' ? values.get('gpg.x509.program') || 'gpgsm'
			: values.get('gpg.openpgp.program') || values.get('gpg.program') || 'gpg';
	const commandExists = async (command: string) => (await exec(`command -v ${shellEscape(command)} >/dev/null 2>&1`, { ignoreExitCode: true })).code === 0;
	let available = await commandExists(program.split(' ')[0]);
	if (available && format === 'ssh') {
		const key = values.get('user.signingkey') ?? '';
		if (!key) {
			available = signing.sshAgent && !!values.get('gpg.ssh.defaultKeyCommand');
		} else if (isLiteralSshKey(key)) {
			available = signing.sshAgent;
		} else {
			const path = key.startsWith('~/') ? `"$HOME"/${shellEscape(key.substring(2))}` : shellEscape(key);
			// A private key file signs without an agent.
			available = (await exec(`test -f ${path}`, { ignoreExitCode: true })).code === 0 && (signing.sshAgent || !key.endsWith('.pub'));
		}
	} else if (available) {
		available = signing.gpgSigning;
	}
	if (!available) {
		for (const { key, file } of enabled) {
			await exec(`git config --file ${shellEscape(file)} --unset ${key}`, { ignoreExitCode: true });
			log(`Git: Removing Git config key: ${key} (${format} signing does not work here)`);
		}
	}
}