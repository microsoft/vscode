/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constants } from 'fs';
import { access, appendFile, mkdir, readdir, readFile, stat, writeFile } from 'fs/promises';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from '../../../base/common/path.js';
import { isWindows } from '../../../base/common/platform.js';
import type { ClientGitConfig } from '../common/clientForwardingProtocol.js';
import { IClientForwardingHost, parseGpgDirs } from './clientForwardingHost.js';

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
		gitGlobalConfig: {
			...(config ? { config: encodeBase64(VSBuffer.wrap(config)) } : {}),
			...(xdgConfig ? { xdgConfig: encodeBase64(VSBuffer.wrap(xdgConfig)) } : {}),
			...(files.length ? { files } : {}),
		},
	};
}

// ---- Agent host side --------------------------------------------------------

/** Where the agent host's Git looks for its configuration, and how to run commands there. */
export interface IClientGitConfigTarget {
	readonly home: string;
	readonly xdgConfigHome: string;
	/** The environment whose `PATH` commands run from. */
	readonly environment: NodeJS.ProcessEnv;
	/** Runs a command in the home folder, without a shell; `undefined` when it is not installed. */
	run(command: string, args: readonly string[]): Promise<{ readonly stdout: string; readonly code: number } | undefined>;
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
	return existing === undefined || !existing.includes(copiedGitConfigMarker) && existing.split(/\r?\n/).map(line => line.trimStart()).filter(line => line.startsWith('[')).every(line => /^\[(filter|safe|user)([ \t]+|\])/.test(line));
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

/** A Git setting's value; empty when it is not set. */
async function getGitConfig(target: IClientGitConfigTarget, args: readonly string[]): Promise<string> {
	const result = await target.run('git', ['config', ...args]);
	return result?.code === 0 ? result.stdout.replace(/\r?\n$/, '') : '';
}

/**
 * The program a configured command runs: its first word, which quotes or backslash-escaped whitespace can extend, as the
 * shell Git runs it with reads it.
 */
export function getCommandName(command: string): string {
	let name = '';
	let quote: string | undefined;
	const value = command.trim();
	for (let i = 0; i < value.length; i++) {
		const char = value[i];
		if (quote) {
			if (char === quote) {
				quote = undefined;
			} else {
				name += char;
			}
		} else if (char === '"' || char === '\'') {
			quote = char;
		} else if (char === '\\' && /\s/.test(value[i + 1] ?? '')) {
			name += value[++i];
		} else if (/\s/.test(char)) {
			break;
		} else {
			name += char;
		}
	}
	return name;
}

/** Whether `command`, a name on `PATH` or in `extraFolders`, or a path, names an executable. */
async function hasCommand(target: IClientGitConfigTarget, command: string, extraFolders: readonly string[] = []): Promise<boolean> {
	if (!command) {
		return false;
	}
	const variable = (name: string) => target.environment[Object.keys(target.environment).find(key => key.toUpperCase() === name) ?? name];
	const extensions = isWindows ? ['', ...(variable('PATHEXT') || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)] : [''];
	const candidates = /[\\/]/.test(command) ? [resolve(target.home, command)] : [...extraFolders, ...(variable('PATH') ?? '').split(delimiter).filter(Boolean)].map(folder => join(folder, command));
	for (const candidate of candidates) {
		for (const extension of extensions) {
			try {
				const path = `${candidate}${extension}`;
				if ((await stat(path)).isFile()) {
					if (!isWindows) {
						await access(path, constants.X_OK);
					}
					return true;
				}
			} catch {
				// Not this one.
			}
		}
	}
	return false;
}

/** What {@link applyClientGitConfig} did. */
export interface IClientGitConfigResult {
	/**
	 * `copied`: the client's `.gitconfig`, possibly with its XDG configuration; `xdgOnly`: only its XDG configuration;
	 * `ownConfig`: the agent host's own was kept; `none`: the client has none; `notOffered`: the client does not supply it.
	 */
	readonly config: 'copied' | 'xdgOnly' | 'ownConfig' | 'none' | 'notOffered' | 'noGit';
	/** `set`: the client's user name or email was set, also over a copy with the same; `existing`: Git's own was kept; `none`: the client has none; `failed`: Git could not set it. */
	readonly identity: 'set' | 'existing' | 'none' | 'noGit' | 'failed';
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
): Promise<IClientGitConfigResult> {
	if (!await target.run('git', ['--version'])) {
		log('Git: Not installed, not configuring it.');
		return { config: 'noGit', identity: 'noGit' };
	}
	const getValue = (key: string) => getGitConfig(target, ['--get', key]);
	const configPath = join(target.home, '.gitconfig');
	const xdgConfigPath = join(target.xdgConfigHome, 'git', 'config');
	const existing = await readFile(configPath, 'utf8').catch(() => undefined);
	const copyConfig = offersConfig && canCopyGitConfig(existing);
	const copyXdgConfig = offersConfig && !await exists(xdgConfigPath);
	if (!copyConfig && !copyXdgConfig && await getValue('user.name') && await getValue('user.email')) {
		return { config: offersConfig ? 'ownConfig' : 'notOffered', identity: 'existing' };
	}

	const gitConfig = await requestGitConfig();
	const global = gitConfig.gitGlobalConfig;
	const copiedFiles: string[] = [];
	if (copyConfig && global?.config) {
		const content = Buffer.concat([Buffer.from(`${copiedGitConfigMarker}\n`), decodeBase64(global.config).buffer]);
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
	if (copyXdgConfig && global?.xdgConfig && await writeNewFile(xdgConfigPath, decodeBase64(global.xdgConfig).buffer)) {
		copiedFiles.push(xdgConfigPath);
	}
	const copied = copiedFiles.length > 0;
	if (copied) {
		log('Git: Copied the client\'s Git configuration.');
		// Only the copied files, as `--global` writes only to one of them.
		await removeUnavailableGitConfig(target, copiedFiles, log);
		for (const file of global?.files ?? []) {
			const path = getHomeRelativePath(target.home, file.path);
			if (path) {
				const absolute = join(target.home, path);
				await writeNewFile(absolute, decodeBase64(file.content).buffer);
				await target.run('git', ['config', '--global', file.key, absolute]);
			}
		}
		await removeUnavailableSigning(target, copiedFiles, await getSigningSupport(target, agents), log);
	}

	let identity: 'set' | 'failed' | undefined;
	for (const [key, value] of [['user.name', gitConfig.user.name], ['user.email', gitConfig.user.email]] as const) {
		const current = value && await getValue(key);
		// A copied configuration lacks the client folder's conditional includes, e.g., for a work email, and may add a
		// second value to an earlier identity, which replacing all leaves as one.
		if (value && (!current || copied)) {
			if ((await target.run('git', ['config', '--global', '--replace-all', key, value]))?.code !== 0) {
				identity = 'failed';
			} else {
				identity ??= 'set';
				if (current !== value) {
					log(`Git: Set ${key} to the client's.`);
				}
			}
		}
	}
	return {
		config: !offersConfig ? 'notOffered'
			: copiedFiles.includes(configPath) ? 'copied'
				: copied ? 'xdgOnly'
					: (copyConfig || copyXdgConfig) && !global?.config && !global?.xdgConfig ? 'none'
						: 'ownConfig',
		identity: identity ?? (gitConfig.user.name || gitConfig.user.email ? 'existing' : 'none'),
	};
}

/** Signing the client's agents support, and GPG signing with keys of the agent host's own, which it then uses. */
async function getSigningSupport(target: IClientGitConfigTarget, agents: IClientGitSigningAgents): Promise<IGitSigningSupport> {
	const homedir = parseGpgDirs((await target.run('gpgconf', ['--list-dirs']))?.stdout ?? '', isWindows).homedir;
	const ownKeys = !!homedir && (await readdir(join(homedir, 'private-keys-v1.d')).catch(() => [])).length > 0;
	return { sshAgent: agents.sshAgent, gpgSigning: !!homedir && (ownKeys || agents.gpgAgent), gpgOwnKeys: ownKeys };
}

interface IGitSigningSupport {
	/** Whether the client's SSH agent is forwarded. */
	readonly sshAgent: boolean;
	/** Whether GPG signing can work, with the client's agent or the agent host's own keys. */
	readonly gpgSigning: boolean;
	/** Whether GnuPG has private keys of its own, in which case it uses them rather than the client's agent. */
	readonly gpgOwnKeys: boolean;
}

/** Settings that run a program, which cannot work without it. */
const programKeys = ['core.editor', 'core.sshCommand', 'gpg.program', 'gpg.openpgp.program', 'gpg.x509.program', 'gpg.ssh.program'];

/** Removes settings of the copied files that cannot work here, e.g., ones running programs only the client has. */
async function removeUnavailableGitConfig(target: IClientGitConfigTarget, files: readonly string[], log: (message: string) => void): Promise<void> {
	const execPath = (await target.run('git', ['--exec-path']))?.stdout.trim();
	const isHelperAvailable = (helper: string) => {
		const command = getCommandName(helper.startsWith('!') ? helper.substring(1) : isAbsolute(helper) || helper.startsWith('/') ? helper : `git-credential-${helper}`);
		// Shell functions cannot be checked.
		return /[({]/.test(command) || hasCommand(target, command, execPath ? [execPath] : []);
	};
	for (const file of files) {
		const config = (...args: string[]) => getGitConfig(target, ['--file', file, ...args]);
		const unset = (...args: string[]) => target.run('git', ['config', '--file', file, ...args]);
		for (const key of programKeys) {
			const value = await config('--get', key);
			if (value && !await hasCommand(target, getCommandName(value))) {
				await unset('--unset', key);
				log(`Git: Removing Git config key: ${key} = ${value}`);
			}
		}
		// Except Git for Windows, Git is built for a single TLS backend and fails when another one is configured.
		if (!isWindows && await config('--get', 'http.sslBackend')) {
			await unset('--unset', 'http.sslBackend');
			log('Git: Removing Git config key: http.sslBackend');
		}
		// Helpers of the client, e.g., a keychain, fail here. An empty value resets the helpers, so a URL's helpers are
		// removed together with its reset, which lets the remaining helpers serve that URL again.
		const helperKeys = new Set((await config('--name-only', '--get-regexp', '^credential\\..*helper$')).split(/\r?\n/).filter(Boolean));
		for (const key of helperKeys) {
			const helpers = (await config('--get-all', key)).split(/\r?\n/).filter(Boolean);
			if (helpers.length && !(await Promise.all(helpers.map(isHelperAvailable))).some(available => available)) {
				await unset('--unset-all', key);
				log(`Git: Removing Git config key: ${key}`);
			}
		}
	}
}

/** Removes commit and tag signing of the copied files that cannot work here, where Git cannot ask for a passphrase. */
async function removeUnavailableSigning(target: IClientGitConfigTarget, files: readonly string[], signing: IGitSigningSupport, log: (message: string) => void): Promise<void> {
	const enabled: { readonly key: string; readonly file: string }[] = [];
	for (const file of files) {
		for (const key of ['commit.gpgsign', 'tag.gpgsign']) {
			if (/^(true|yes|on|1)$/i.test(await getGitConfig(target, ['--file', file, '--get', key]))) {
				enabled.push({ key, file });
			}
		}
	}
	if (!enabled.length) {
		return;
	}
	// The signing settings Git uses, which may also come from configuration of the agent host's own. Not `--global`,
	// which reads only one of the global files.
	const value = (key: string) => getGitConfig(target, ['--get', key]);
	const format = (await value('gpg.format') || 'openpgp').toLowerCase();
	const program = format === 'ssh' ? await value('gpg.ssh.program') || 'ssh-keygen'
		: format === 'x509' ? await value('gpg.x509.program') || 'gpgsm'
			: await value('gpg.openpgp.program') || await value('gpg.program') || 'gpg';
	let available = await hasCommand(target, getCommandName(program));
	if (available && format === 'ssh') {
		const key = await value('user.signingkey');
		if (!key) {
			available = signing.sshAgent && !!await value('gpg.ssh.defaultKeyCommand');
		} else if (isLiteralSshKey(key)) {
			available = signing.sshAgent;
		} else {
			const path = /^~[/\\]/.test(key) ? join(target.home, key.substring(2)) : resolve(target.home, key);
			// A private key file signs without an agent.
			available = await stat(path).then(stats => stats.isFile(), () => false) && (signing.sshAgent || !key.endsWith('.pub'));
		}
	} else if (available && format === 'openpgp' && signing.gpgOwnKeys) {
		// Git signs with the configured key, else one for the committer's email, which must then be one of its own.
		const key = await value('user.signingkey') || await value('user.email');
		available = !key || (await target.run(getCommandName(program), ['--list-secret-keys', '--with-colons', '--', key]))?.code === 0;
	} else if (available) {
		available = signing.gpgSigning;
	}
	if (!available) {
		for (const { key, file } of enabled) {
			await target.run('git', ['config', '--file', file, '--unset', key]);
			log(`Git: Removing Git config key: ${key} (${format} signing does not work here)`);
		}
	}
}
