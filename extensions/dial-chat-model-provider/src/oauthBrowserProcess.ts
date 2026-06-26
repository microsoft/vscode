import { type ChildProcess, execFile, execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { dialLog } from './logger';
import { type Nullable, type OAuthBrowserProfileMode } from './types';

const execFileAsync = promisify(execFile);

const SAFARI_APP_PATH = '/Applications/Safari.app';
const PERSISTENT_PROFILE_DIR_NAME = 'oauth-browser-profile';

export type OAuthBrowserKind = 'chromium-app' | 'safari';

export function parseOAuthBrowserProfile(value: Nullable<string>): OAuthBrowserProfileMode {
	if (value === 'system' || value === 'persistent') {
		return value;
	}
	return 'auto';
}

export interface OAuthBrowserHandle {
	kind: OAuthBrowserKind;
	process?: ChildProcess;
	callbackPort: number;
}

interface ChromiumLaunchPlan {
	browserPath: string;
	userDataDir: string;
	profileDirectory: string;
	profileKind: 'system' | 'persistent';
}

/** macOS Safari, otherwise Chromium/Edge in minimal app window (`--app`). */
export function openOAuthBrowser(
	url: string,
	callbackPort: number,
	profileMode: OAuthBrowserProfileMode = 'auto',
): OAuthBrowserHandle {
	if (process.platform === 'darwin' && isSafariAvailable()) {
		spawn('open', ['-a', 'Safari', url], { detached: true, stdio: 'ignore' }).unref();
		dialLog.info('OAuth sign-in opened in Safari (uses your saved passwords and cookies)');
		return { kind: 'safari', callbackPort };
	}

	const plan = resolveChromiumLaunchPlan(profileMode);
	const proc = spawn(
		plan.browserPath,
		[
			`--user-data-dir=${plan.userDataDir}`,
			`--profile-directory=${plan.profileDirectory}`,
			`--app=${url}`,
			'--no-first-run',
			'--no-default-browser-check',
			'--disable-session-crashed-bubble',
		],
		{ stdio: 'ignore', detached: false },
	);

	if (plan.profileKind === 'system') {
		dialLog.info(
			'OAuth sign-in opened with your browser profile (saved passwords and autofill available)',
			plan.browserPath,
		);
	} else {
		dialLog.info(
			'OAuth sign-in opened with a separate DIAL browser profile',
			plan.browserPath,
			`profile=${plan.userDataDir}`,
			profileMode === 'auto'
				? '(close Chrome/Edge before login to use your main saved passwords)'
				: undefined,
		);
	}

	return { kind: 'chromium-app', process: proc, callbackPort };
}

export async function closeOAuthBrowser(handle?: OAuthBrowserHandle): Promise<void> {
	if (!handle) {
		return;
	}

	if (handle.kind === 'safari') {
		await closeSafariLoopbackTabs(handle.callbackPort);
		return;
	}

	if (handle.process) {
		closeChromiumProcess(handle.process);
	}
}

function resolveChromiumLaunchPlan(profileMode: OAuthBrowserProfileMode): ChromiumLaunchPlan {
	const browsers = findChromiumExecutables();
	if (browsers.length === 0) {
		throw new Error(
			'No supported browser found — install Google Chrome, Microsoft Edge, or use macOS Safari',
		);
	}

	const preferred = browsers[0];
	if (!preferred) {
		throw new Error('No supported browser found');
	}

	if (profileMode === 'persistent') {
		return buildPersistentLaunchPlan(preferred);
	}

	if (profileMode === 'system') {
		const browserPath = pickBrowserForSystemProfile(browsers);
		if (browserPath) {
			return buildSystemLaunchPlan(browserPath);
		}
		dialLog.warn(
			'Chrome and Edge are already running — cannot attach your main profile; using separate DIAL profile instead',
		);
		return buildPersistentLaunchPlan(preferred);
	}

	// auto: prefer a browser that is not running so we can use the system profile.
	const idleBrowser = pickBrowserForSystemProfile(browsers);
	if (idleBrowser) {
		return buildSystemLaunchPlan(idleBrowser);
	}

	dialLog.warn(
		'Chrome and Edge are already running — OAuth window uses a separate profile without your saved passwords',
		'Close the browser before DIAL: Login to enable password autofill',
	);
	return buildPersistentLaunchPlan(preferred);
}

function buildSystemLaunchPlan(browserPath: string): ChromiumLaunchPlan {
	return {
		browserPath,
		userDataDir: getSystemChromiumUserDataDir(browserPath),
		profileDirectory: 'Default',
		profileKind: 'system',
	};
}

function buildPersistentLaunchPlan(browserPath: string): ChromiumLaunchPlan {
	const userDataDir = getPersistentOAuthProfileDir();
	fs.mkdirSync(userDataDir, { recursive: true });
	return {
		browserPath,
		userDataDir,
		profileDirectory: 'Default',
		profileKind: 'persistent',
	};
}

function pickBrowserForSystemProfile(browsers: string[]): Nullable<string> {
	for (const browserPath of browsers) {
		if (!isBrowserRunning(browserPath)) {
			return browserPath;
		}
	}
	return undefined;
}

function getSystemChromiumUserDataDir(browserPath: string): string {
	if (process.platform === 'darwin') {
		const base = path.join(os.homedir(), 'Library', 'Application Support');
		return isEdgeBrowser(browserPath)
			? path.join(base, 'Microsoft Edge')
			: path.join(base, 'Google', 'Chrome');
	}

	if (process.platform === 'win32') {
		const localAppData =
			process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
		return isEdgeBrowser(browserPath)
			? path.join(localAppData, 'Microsoft', 'Edge', 'User Data')
			: path.join(localAppData, 'Google', 'Chrome', 'User Data');
	}

	const configHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
	return isEdgeBrowser(browserPath)
		? path.join(configHome, 'microsoft-edge')
		: path.join(configHome, 'google-chrome');
}

function getPersistentOAuthProfileDir(): string {
	if (process.platform === 'win32') {
		const localAppData =
			process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
		return path.join(localAppData, 'DialChatModelProvider', PERSISTENT_PROFILE_DIR_NAME);
	}
	if (process.platform === 'darwin') {
		return path.join(
			os.homedir(),
			'Library',
			'Application Support',
			'DialChatModelProvider',
			PERSISTENT_PROFILE_DIR_NAME,
		);
	}
	const dataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
	return path.join(dataHome, 'DialChatModelProvider', PERSISTENT_PROFILE_DIR_NAME);
}

function isBrowserRunning(browserPath: string): boolean {
	const processNames = getBrowserProcessNames(browserPath);
	for (const processName of processNames) {
		if (isProcessRunning(processName)) {
			return true;
		}
	}
	return false;
}

function isProcessRunning(processName: string): boolean {
	try {
		if (process.platform === 'win32') {
			const output = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${processName}`, '/NH'], {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			});
			return output.toLowerCase().includes(processName.toLowerCase());
		}

		const pgrepFlag = process.platform === 'darwin' ? '-if' : '-x';
		execFileSync('pgrep', [pgrepFlag, processName], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function getBrowserProcessNames(browserPath: string): string[] {
	if (isEdgeBrowser(browserPath)) {
		if (process.platform === 'win32') {
			return ['msedge.exe'];
		}
		if (process.platform === 'darwin') {
			return ['Microsoft Edge'];
		}
		return ['msedge', 'microsoft-edge'];
	}

	if (process.platform === 'win32') {
		return ['chrome.exe'];
	}
	if (process.platform === 'darwin') {
		return ['Google Chrome'];
	}
	return ['chrome', 'google-chrome', 'google-chrome-stable'];
}

function isEdgeBrowser(browserPath: string): boolean {
	return path.basename(browserPath).toLowerCase().includes('edge');
}

function isSafariAvailable(): boolean {
	return fs.existsSync(SAFARI_APP_PATH);
}

function findChromiumExecutables(): string[] {
	const candidates: string[] = [];

	if (process.platform === 'win32') {
		const programFiles = process.env.ProgramFiles;
		const programFilesX86 = process.env['ProgramFiles(x86)'];
		const localAppData = process.env.LOCALAPPDATA;
		if (programFiles) {
			candidates.push(
				path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
				path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
			);
		}
		if (programFilesX86) {
			candidates.push(
				path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
				path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
			);
		}
		if (localAppData) {
			candidates.push(
				path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
				path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
			);
		}
	} else if (process.platform === 'darwin') {
		candidates.push(
			'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
			'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
		);
	} else {
		candidates.push(
			'/usr/bin/google-chrome',
			'/usr/bin/google-chrome-stable',
			'/usr/bin/microsoft-edge',
			'/usr/bin/chromium',
			'/usr/bin/chromium-browser',
		);
	}

	return [...new Set(candidates.filter((candidate) => fs.existsSync(candidate)))];
}

function closeChromiumProcess(proc: ChildProcess): void {
	if (!proc.pid || proc.killed) {
		return;
	}

	const pid = proc.pid;
	if (process.platform === 'win32') {
		spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
	} else {
		try {
			process.kill(-pid, 'SIGTERM');
		} catch {
			try {
				proc.kill('SIGTERM');
			} catch {
				// Process already exited.
			}
		}
	}

	dialLog.info('OAuth native app window closed', `pid=${pid}`);
}

async function closeSafariLoopbackTabs(callbackPort: number): Promise<void> {
	const loopbackPrefix = `http://127.0.0.1:${callbackPort}`;
	const script = `
tell application "Safari"
  repeat with w in windows
    repeat with t in tabs of w
      try
        if (URL of t as string) starts with "${loopbackPrefix}" then
          close t
        end if
      end try
    end repeat
  end repeat
end tell`;

	try {
		await execFileAsync('osascript', ['-e', script]);
		dialLog.info('Closed Safari loopback OAuth tab(s)');
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		dialLog.warn('Could not close Safari OAuth tab automatically', detail);
	}
}
