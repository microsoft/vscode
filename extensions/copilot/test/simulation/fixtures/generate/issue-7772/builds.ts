/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import chalk from 'chalk';
import { rmSync } from 'fs';
import { dirname, join } from 'path';
import { LOGGER, Platform, platform, Runtime } from './constants';
import { fileGet, jsonGet } from './fetch';
import { exists, getBuildPath, unzip } from './files';

export interface IBuild {
	readonly runtime: Runtime;
	readonly commit: string;
}

interface IBuildMetadata {
	readonly url: string;
	readonly productVersion: string;
	readonly sha256hash: string;
}

class Builds {

	async fetchBuilds(runtime = Runtime.WebLocal, goodCommit?: string, badCommit?: string, releasedOnly?: boolean): Promise<IBuild[]> {

		// Fetch all released insider builds
		const allBuilds = await this.fetchAllBuilds(runtime, releasedOnly);

		let goodCommitIndex = allBuilds.length - 1;  // last build (oldest) by default
		let badCommitIndex = 0;                      // first build (newest) by default

		if (typeof goodCommit === 'string') {
			const candidateGoodCommitIndex = this.indexOf(goodCommit, allBuilds);
			if (typeof candidateGoodCommitIndex !== 'number') {
				throw new Error(`Provided good commit ${chalk.green(goodCommit)} was not found in the list of insiders builds. Try running with ${chalk.green('--releasedOnly')} to support older builds.`);
			}

			goodCommitIndex = candidateGoodCommitIndex;
		}

		if (typeof badCommit === 'string') {
			const candidateBadCommitIndex = this.indexOf(badCommit, allBuilds);
			if (typeof candidateBadCommitIndex !== 'number') {
				throw new Error(`Provided bad commit ${chalk.green(badCommit)} was not found in the list of insiders builds. Try running with ${chalk.green('--releasedOnly')} to support older builds.`);
			}

			badCommitIndex = candidateBadCommitIndex;
		}

		if (badCommitIndex >= goodCommitIndex) {
			throw new Error(`Provided bad commit ${chalk.green(badCommit)} cannot be older or same as good commit ${chalk.green(goodCommit)}.`);
		}

		// Build a range based on the bad and good commits if any
		const buildsInRange = allBuilds.slice(badCommitIndex, goodCommitIndex + 1);

		// Drop those builds that are not on main branch
		return buildsInRange;
	}

	private indexOf(commit: string, builds: IBuild[]): number | undefined {
		for (let i = 0; i < builds.length; i++) {
			const build = builds[i];
			if (build.commit === commit) {
				return i;
			}
		}

		return undefined;
	}

	private async fetchAllBuilds(runtime: Runtime, releasedOnly = false): Promise<IBuild[]> {
		const url = `https://update.code.visualstudio.com/api/commits/insider/${this.getBuildApiName(runtime)}?released=${releasedOnly}`;
		console.log(`${chalk.gray('[build]')} fetching all builds from ${chalk.green(url)}...`);
		const commits = await jsonGet<Array<string>>(url);

		return commits.map(commit => ({ commit, runtime }));
	}

	private getBuildApiName(runtime: Runtime): string {
		switch (runtime) {
			case Runtime.WebLocal:
			case Runtime.WebRemote:
				switch (platform) {
					case Platform.MacOSX64:
					case Platform.MacOSArm:
						return 'server-darwin-web';
					case Platform.LinuxX64:
					case Platform.LinuxArm:
						return 'server-linux-x64-web';
					case Platform.WindowsX64:
					case Platform.WindowsArm:
						return 'server-win32-x64-web';
				}

			case Runtime.DesktopLocal:
				switch (platform) {
					case Platform.MacOSX64:
						return 'darwin';
					case Platform.MacOSArm:
						return 'darwin-arm64';
					case Platform.LinuxX64:
						return 'linux-x64';
					case Platform.LinuxArm:
						return 'linux-arm64';
					case Platform.WindowsX64:
						return 'win32-x64';
					case Platform.WindowsArm:
						return 'win32-arm64';
				}
		}
	}

	async installBuild({ runtime, commit }: IBuild, options?: { forceReDownload: boolean }): Promise<void> {
		const buildName = await this.getBuildArchiveName({ runtime, commit });

		const path = join(getBuildPath(commit), buildName);

		const pathExists = await exists(path);
		if (pathExists && !options?.forceReDownload) {
			if (LOGGER.verbose) {
				console.log(`${chalk.gray('[build]')} using ${chalk.green(path)} for the next build to try`);
			}

			return; // assume the build is cached
		}

		if (pathExists && options?.forceReDownload) {
			console.log(`${chalk.gray('[build]')} deleting ${chalk.green(getBuildPath(commit))} and retrying download`);
			rmSync(getBuildPath(commit), { recursive: true });
		}

		// Download
		const url = `https://update.code.visualstudio.com/commit:${commit}/${this.getPlatformName(runtime)}/insider`;
		console.log(`${chalk.gray('[build]')} downloading build from ${chalk.green(url)}...`);
		await fileGet(url, path);

		const sha256 = (await this.fetchBuildMeta({ runtime, commit })).sha256hash;
		console.log(`${chalk.gray('[build]')} validating build sha256 hash...`);


		// Unzip
		let destination: string;
		if (runtime === Runtime.DesktopLocal && platform === Platform.WindowsX64 || platform === Platform.WindowsArm) {
			// zip does not contain a single top level folder to use...
			destination = path.substring(0, path.lastIndexOf('.zip'));
		} else {
			// zip contains a single top level folder to use
			destination = dirname(path);
		}
		console.log(`${chalk.gray('[build]')} unzipping build to ${chalk.green(destination)}...`);
		await unzip(path, destination);
	}

	private async getBuildArchiveName({ runtime, commit }: IBuild): Promise<string> {
		switch (runtime) {

			// We currently do not have ARM enabled servers
			// so we fallback to x64 until we ship ARM.
			case Runtime.WebLocal:
			case Runtime.WebRemote:
				switch (platform) {
					case Platform.MacOSX64:
						return 'vscode-server-darwin-x64-web.zip';
					case Platform.MacOSArm:
						return 'vscode-server-darwin-arm64-web.zip';
					case Platform.LinuxX64:
						return 'vscode-server-linux-arm64-web.tar.gz';
					case Platform.LinuxArm:
						return 'vscode-server-linux-x64-web.tar.gz';
					case Platform.WindowsX64:
					case Platform.WindowsArm:
						return 'vscode-server-win32-x64-web.zip';
				}

			// Every platform has its own name scheme, hilarious right?
			// - macOS: just the name, nice! (e.g. VSCode-darwin.zip)
			// - Linux: includes some unix timestamp (e.g. code-insider-x64-1639979337.tar.gz)
			// - Windows: includes the version (e.g. VSCode-win32-x64-1.64.0-insider.zip)
			case Runtime.DesktopLocal:
				switch (platform) {
					case Platform.MacOSX64:
						return 'VSCode-darwin.zip';
					case Platform.MacOSArm:
						return 'VSCode-darwin-arm64.zip';
					case Platform.LinuxX64:
					case Platform.LinuxArm:
						return (await this.fetchBuildMeta({ runtime, commit })).url.split('/').pop()!; // e.g. https://az764295.vo.msecnd.net/insider/807bf598bea406dcb272a9fced54697986e87768/code-insider-x64-1639979337.tar.gz
					case Platform.WindowsX64:
					case Platform.WindowsArm: {
						const buildMeta = await this.fetchBuildMeta({ runtime, commit });

						return platform === Platform.WindowsX64 ? `VSCode-win32-x64-${buildMeta.productVersion}.zip` : `VSCode-win32-arm64-${buildMeta.productVersion}.zip`;
					}
				}
		}
	}

	async getBuildName({ runtime, commit }: IBuild): Promise<string> {
		switch (runtime) {
			case Runtime.WebLocal:
			case Runtime.WebRemote:
				switch (platform) {
					case Platform.MacOSX64:
						return 'vscode-server-darwin-x64-web';
					case Platform.MacOSArm:
						return 'vscode-server-darwin-arm64-web';
					case Platform.LinuxX64:
						return 'vscode-server-linux-arm64-web';
					case Platform.LinuxArm:
						return 'vscode-server-linux-x64-web';
					case Platform.WindowsX64:
					case Platform.WindowsArm:
						return 'vscode-server-win32-x64-web';
				}

			// Here, only Windows does not play by our rules and adds the version number
			// - Windows: includes the version (e.g. VSCode-win32-x64-1.64.0-insider)
			case Runtime.DesktopLocal:
				switch (platform) {
					case Platform.MacOSX64:
					case Platform.MacOSArm:
						return 'Visual Studio Code - Insiders.app';
					case Platform.LinuxX64:
						return 'VSCode-linux-x64';
					case Platform.LinuxArm:
						return 'VSCode-linux-arm64';
					case Platform.WindowsX64:
					case Platform.WindowsArm: {
						const buildMeta = await this.fetchBuildMeta({ runtime, commit });

						return platform === Platform.WindowsX64 ? `VSCode-win32-x64-${buildMeta.productVersion}` : `VSCode-win32-arm64-${buildMeta.productVersion}`;
					}
				}
		}
	}

	private getPlatformName(runtime: Runtime): string {
		switch (runtime) {
			case Runtime.WebLocal:
			case Runtime.WebRemote:
				switch (platform) {
					case Platform.MacOSX64:
						return 'server-darwin-web';
					case Platform.MacOSArm:
						return 'server-darwin-arm64-web';
					case Platform.LinuxX64:
						return 'server-linux-x64-web';
					case Platform.LinuxArm:
						return 'server-linux-arm64-web';
					case Platform.WindowsX64:
					case Platform.WindowsArm:
						return 'server-win32-x64-web';
				}

			case Runtime.DesktopLocal:
				switch (platform) {
					case Platform.MacOSX64:
						return 'darwin';
					case Platform.MacOSArm:
						return 'darwin-arm64';
					case Platform.LinuxX64:
						return 'linux-x64';
					case Platform.LinuxArm:
						return 'linux-arm64';
					case Platform.WindowsX64:
						return 'win32-x64-archive';
					case Platform.WindowsArm: {
						return 'win32-arm64-archive';
					}
				}
		}
	}

	private fetchBuildMeta({ runtime, commit }: IBuild): Promise<IBuildMetadata> {
		return jsonGet<IBuildMetadata>(`https://update.code.visualstudio.com/api/versions/commit:${commit}/${this.getBuildApiName(runtime)}/insider`);
	}

	async getBuildExecutable({ runtime, commit }: IBuild): Promise<string> {
		const buildPath = getBuildPath(commit);
		const buildName = await builds.getBuildName({ runtime, commit });

		switch (runtime) {
			case Runtime.WebLocal:
			case Runtime.WebRemote:
				switch (platform) {
					case Platform.MacOSX64:
					case Platform.MacOSArm:
					case Platform.LinuxX64:
					case Platform.LinuxArm: {
						const oldLocation = join(buildPath, buildName, 'server.sh');
						if (await exists(oldLocation)) {
							return oldLocation; // only valid until 1.64.x
						}

						return join(buildPath, buildName, 'bin', 'code-server-insiders');
					}
					case Platform.WindowsX64:
					case Platform.WindowsArm: {
						const oldLocation = join(buildPath, buildName, 'server.cmd');
						if (await exists(oldLocation)) {
							return oldLocation; // only valid until 1.64.x
						}

						return join(buildPath, buildName, 'bin', 'code-server-insiders.cmd');
					}
				}

			case Runtime.DesktopLocal:
				switch (platform) {
					case Platform.MacOSX64:
					case Platform.MacOSArm:
						return join(buildPath, buildName, 'Contents', 'MacOS', 'Electron')
					case Platform.LinuxX64:
					case Platform.LinuxArm:
						return join(buildPath, buildName, 'code-insiders')
					case Platform.WindowsX64:
					case Platform.WindowsArm:
						return join(buildPath, buildName, 'Code - Insiders.exe')
				}
		}
	}
}

export const builds = new Builds();
