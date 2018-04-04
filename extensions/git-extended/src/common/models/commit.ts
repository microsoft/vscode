export class Commit {
	constructor(public sha: string, public summary: string, public parentSHAs: string[]) { }
}