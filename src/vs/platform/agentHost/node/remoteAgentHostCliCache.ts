/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix } from '../../../base/common/path.js';
import { getRemoteCLIArchiveName, getRemoteCLIBin, getRemoteCLIInstallRoot, shellEscape } from './sshRemoteAgentHostHelpers.js';

/** Downloads immutable CLI entries under a process lock, then installs an independent private copy. */
export function buildInstallRemoteCliFromCacheCommand(cacheDir: string, serverDataFolderName: string, quality: string, commit: string, url: string): string {
	const cliBin = getRemoteCLIBin(serverDataFolderName, quality, commit);
	if (!posix.isAbsolute(cacheDir) || posix.normalize(cacheDir) !== cacheDir || !/^[a-z]+$/.test(quality)) {
		throw new Error('Invalid CLI cache directory or quality');
	}
	const archive = getRemoteCLIArchiveName(quality);
	const key = `${quality}-${commit}`;
	const commitGlob = '[0-9a-f]'.repeat(40);
	return [
		'set -eu',
		'umask 022',
		`cache_dir=${shellEscape(cacheDir)}`,
		`cache_key=${shellEscape(key)}`,
		`archive=${shellEscape(archive)}`,
		`install_root=${getRemoteCLIInstallRoot(serverDataFolderName)}`,
		'test ! -L "$cache_dir" && test -d "$cache_dir" && test -w "$cache_dir"',
		'command -v flock >/dev/null || { echo "CLI cache requires flock" >&2; exit 1; }',
		'test ! -L "$cache_dir/.locks"',
		'mkdir -p "$cache_dir/.locks"',
		'test ! -L "$cache_dir/.locks/$cache_key"',
		'exec 9>"$cache_dir/.locks/$cache_key"',
		'flock 9',
		'entry="$cache_dir/$cache_key"',
		'staging="$cache_dir/.$cache_key.staging"',
		'private_tmp=',
		'trap \'rm -rf -- "$staging"; if [ -n "$private_tmp" ]; then rm -rf -- "$private_tmp"; fi\' 0',
		'trap \'exit 1\' 1 2 15',
		'test ! -L "$entry"',
		'rm -rf -- "$staging"',
		'if [ ! -e "$entry" ]; then',
		'  mkdir -p "$staging/content"',
		`  curl -fsSL ${shellEscape(url)} -o "$staging/archive.tar.gz"`,
		'  tar xzf "$staging/archive.tar.gz" -C "$staging/content"',
		'  test ! -L "$staging/content/$archive" && test -f "$staging/content/$archive"',
		'  chmod +x "$staging/content/$archive"',
		'  version=$("$staging/content/$archive" --version)',
		`  case "$version" in *${shellEscape(commit)}*) ;; *) echo "Downloaded CLI does not match the requested commit" >&2; exit 1 ;; esac`,
		'  mv -T "$staging/content" "$entry"',
		'fi',
		'test ! -L "$entry/$archive" && test -f "$entry/$archive" && test -x "$entry/$archive"',
		'version=$("$entry/$archive" --version)',
		`case "$version" in *${shellEscape(commit)}*) ;; *) echo "Cached CLI does not match the requested commit" >&2; exit 1 ;; esac`,
		'mkdir -p "$install_root"',
		'private_tmp=$(mktemp -d "$install_root/.cli-install-XXXXXX")',
		'cp "$entry/$archive" "$private_tmp/$archive"',
		`mv -fT "$private_tmp/$archive" ${cliBin}`,
		'touch "$entry"',
		'rm -rf -- "$staging" "$private_tmp"',
		'trap - 0',
		'flock -u 9',
		// Pruning takes the same entry locks as copying; a private install never depends on cache lifetime.
		'(',
		'  cd "$cache_dir"',
		`  ls -1dt -- ${quality}-${commitGlob} 2>/dev/null | tail -n +6 | while IFS= read -r old; do`,
		'    if [ "$old" != "$cache_key" ]; then',
		'      (',
		'        test ! -L ".locks/$old"',
		'        exec 8>".locks/$old"',
		'        if flock -n 8; then rm -rf -- "$old"; fi',
		'      )',
		'    fi',
		'  done',
		')',
	].join('\n');
}
