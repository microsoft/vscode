/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Repository, Ref, RefType, Branch } from './models/repository';
import { GitProcess } from 'dugite';
import { uniqBy } from './util';
import { parseRemote } from './remote';
import { Remote } from './models/remote';

export async function fetch(repository: Repository, remoteName: string, branch: string) {
	const result = await GitProcess.exec(
		[
			'fetch',
			remoteName,
			branch
		],
		repository.path
	);

	if (result.exitCode !== 0) {
		throw (result.stderr);
	}
}

export async function checkout(repository: Repository, branch: string) {
	const result = await GitProcess.exec(
		[
			'checkout',
			branch
		],
		repository.path
	);

	if (result.exitCode !== 0) {
		throw (result.stderr);
	}
}

export async function getHEAD(repository: Repository): Promise<Ref> {
	try {
		const result = await GitProcess.exec(['symbolic-ref', '--short', 'HEAD'], repository.path);

		if (!result.stdout) {
			throw new Error('Not in a branch');
		}

		return { name: result.stdout.trim(), commit: void 0, type: RefType.Head };
	} catch (err) {
		const result = await GitProcess.exec(['rev-parse', 'HEAD'], repository.path);

		if (!result.stdout) {
			throw new Error('Error parsing HEAD');
		}

		return { name: void 0, commit: result.stdout.trim(), type: RefType.Head };
	}
}

export async function getBranch(repository: Repository, name: string): Promise<Branch> {
	if (name === 'HEAD') {
		return getHEAD(repository);
	}

	const result = await GitProcess.exec(['rev-parse', name], repository.path);

	if (!result.stdout) {
		return Promise.reject<Branch>(new Error('No such branch'));
	}

	const commit = result.stdout.trim();

	try {
		const res2 = await GitProcess.exec(['rev-parse', '--symbolic-full-name', name + '@{u}'], repository.path);
		const fullUpstream = res2.stdout.trim();
		const match = /^refs\/remotes\/([^/]+)\/(.+)$/.exec(fullUpstream);

		if (!match) {
			throw new Error(`Could not parse upstream branch: ${fullUpstream}`);
		}

		const upstream = { remote: match[1], name: match[2] };
		const res3 = await GitProcess.exec(['rev-list', '--left-right', name + '...' + fullUpstream], repository.path);

		let ahead = 0, behind = 0;
		let i = 0;

		while (i < res3.stdout.length) {
			switch (res3.stdout.charAt(i)) {
				case '<': ahead++; break;
				case '>': behind++; break;
				default: i++; break;
			}

			while (res3.stdout.charAt(i++) !== '\n') { /* no-op */ }
		}

		return { name, type: RefType.Head, commit, upstream, ahead, behind };
	} catch (err) {
		return { name, type: RefType.Head, commit };
	}
}

export async function getRefs(repository: Repository): Promise<Ref[]> {
	const result = await GitProcess.exec(['for-each-ref', '--format', '%(refname) %(objectname)', '--sort', '-committerdate'], repository.path);

	const fn = (line: string): Ref | null => {
		let match: RegExpExecArray | null;

		if (match = /^refs\/heads\/([^ ]+) ([0-9a-f]{40})$/.exec(line)) {
			return { name: match[1], commit: match[2], type: RefType.Head };
		} else if (match = /^refs\/remotes\/([^/]+)\/([^ ]+) ([0-9a-f]{40})$/.exec(line)) {
			return { name: `${match[1]}/${match[2]}`, commit: match[3], type: RefType.RemoteHead, remote: match[1] };
		} else if (match = /^refs\/tags\/([^ ]+) ([0-9a-f]{40})$/.exec(line)) {
			return { name: match[1], commit: match[2], type: RefType.Tag };
		}

		return null;
	};

	return result.stdout.trim().split('\n')
		.filter(line => !!line)
		.map(fn)
		.filter(ref => !!ref) as Ref[];
}

export async function getRemotes(repository: Repository): Promise<Remote[]> {
	const result = await GitProcess.exec(['remote', '--verbose'], repository.path);
	const regex = /^([^\s]+)\s+([^\s]+)\s/;
	const rawRemotes = result.stdout.trim().split('\n')
		.filter(b => !!b)
		.map(line => regex.exec(line) as RegExpExecArray)
		.filter(g => !!g)
		.map((groups: RegExpExecArray) => ({ name: groups[1], url: groups[2] }));

	return uniqBy(rawRemotes, remote => remote.name).map(remote => parseRemote(remote.name, remote.url));
}

export async function show(repository: Repository, filePath: string): Promise<string> {
	try {
		const result = await GitProcess.exec(['show', filePath], repository.path);
		return result.stdout.trim();
	} catch (e) {
		return '';
	}
}

export async function diff(repository: Repository, filePath: string, compareWithCommit: string): Promise<string> {
	try {
		let args = ['diff', filePath];
		if (compareWithCommit) {
			args = ['diff', compareWithCommit, '--', filePath];
		}

		const result = await GitProcess.exec(args, repository.path);
		return result.stdout.trim();
	} catch (e) {
		return '';
	}
}