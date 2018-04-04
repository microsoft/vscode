import { IGitRemoteURL } from './remote';

export class GitHubRepository {
	constructor(
		public name: string,
		public owner: string,
		public url: string
	) { }
}
export class Repository {
	public path: string;

	public remotes: IGitRemoteURL[];

	constructor(path: string, remotes: IGitRemoteURL[]) {
		this.path = path;
		this.remotes = remotes;
	}
}