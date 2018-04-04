import { Repository } from './models/repository';
import { Commit } from './models/commit';
import { GitProcess } from 'dugite';

export async function getParentCommit(repository: Repository, sha: string): Promise<string> {
	const result = await GitProcess.exec(
		[
			'rev-list',
			'--parents',
			'-n',
			'1',
			sha
		],
		repository.path
	);
	let commits = result.stdout.split(' ');
	if (commits.length > 2) {
		return commits[1];
	} else {
		return null;
	}
}



export async function getCommits(repository: Repository, revisionRange: string, limit: number, additionalArgs: ReadonlyArray<string> = []): Promise<Commit[]> {
	const delimiter = '1F';
	const delimiterString = String.fromCharCode(parseInt(delimiter, 16));
	const prettyFormat = [
		'%H', // SHA
		'%s', // summary
		'%P', // parent SHAs
	].join(`%x${delimiter}`);

	const result = await GitProcess.exec([
		'log',
		revisionRange,
		`--max-count=${limit}`,
		`--pretty=${prettyFormat}`,
		'-z',
		...additionalArgs,
	], repository.path);

	const out = result.stdout;
	const lines = out.split('\0');
	lines.splice(-1, 1);

	const commits = lines.map(line => {
		const pieces = line.split(delimiterString);
		const sha = pieces[0];
		const summary = pieces[1];
		const shaList = pieces[2];
		const parentSHAs = shaList.length ? shaList.split(' ') : [];

		return new Commit(sha, summary, parentSHAs);
	});

	return commits;
}

export async function isWorkingTreeClean(repository: Repository): Promise<boolean> {
	const result = await GitProcess.exec(
		[
			'diff-index',
			'--quiet',
			'HEAD',
			'--'
		],
		repository.path
	);
	let exitCode = result.exitCode;
	if (exitCode !== 0) {
		return false;
	} else {
		return true;
	}
}