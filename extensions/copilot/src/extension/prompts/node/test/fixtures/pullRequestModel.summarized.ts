
export class PullRequestModel extends IssueModel<PullRequest> implements IPullRequestModel {
	async createCommentReply(
		body: string,
		inReplyTo: string,
		isSingleComment: boolean,
		commitId?: string,
	): Promise<IComment | undefined> {…}

	/**
	 * Check whether there is an existing pending review and update the context key to control what comment actions are shown.
	 */
	async validateDraftMode(): Promise<boolean> {…}

	private async updateDraftModeContext() {…}

	/**
	 * Edit an existing review comment.
	 * @param comment The comment to edit
	 * @param text The new comment text
	 */
	async editReviewComment(comment: IComment, text: string): Promise<IComment> {…}

	/**
	 * Deletes a review comment.
	 * @param commentId The comment id to delete
	 */
	async deleteReviewComment(commentId: string): Promise<void> {…}

	/**
	 * Get existing requests to review.
	 */
	async getReviewRequests(): Promise<IAccount[]> {…}

	/**
	 * Add reviewers to a pull request
	 * @param reviewers A list of GitHub logins
	 */
	async requestReview(reviewers: string[]): Promise<void> {…}

	/**
	 * Remove a review request that has not yet been completed
	 * @param reviewer A GitHub Login
	 */
	async deleteReviewRequest(reviewers: string[]): Promise<void> {…}

	async deleteAssignees(assignees: string[]): Promise<void> {…}

	private diffThreads(oldReviewThreads: IReviewThread[], newReviewThreads: IReviewThread[]): void {

		newReviewThreads.forEach(thread => {…});

		oldReviewThreads.forEach(thread => {…});

		this._onDidChangeReviewThreads.fire({
			added,
			changed,
			removed,
		});
	}

	async getReviewThreads(): Promise<IReviewThread[]> {
		const { remote, query, schema } = await this.githubRepository.ensure();
		try {…} catch (e) {…}
	}

	/**
	 * Get all review comments.
	 */
	async initializeReviewComments(): Promise<void> {
		const { remote, query, schema } = await this.githubRepository.ensure();
		try {…} catch (e) {…}
	}

	/**
	 * Get a list of the commits within a pull request.
	 */
	async getCommits(): Promise<OctokitCommon.PullsListCommitsResponseData> {
		try {…} catch (e) {…}
	}

	/**
	 * Get all changed files within a commit
	 * @param commit The commit
	 */
	async getCommitChangedFiles(
		commit: OctokitCommon.PullsListCommitsResponseData[0],
	): Promise<OctokitCommon.ReposGetCommitResponseFiles> {
		try {…} catch (e) {…}
	}

	/**
	 * Gets file content for a file at the specified commit
	 * @param filePath The file path
	 * @param commit The commit
	 */
	async getFile(filePath: string, commit: string) {
		const { octokit, remote } = await this.githubRepository.ensure();
		const fileContent = await octokit.call(octokit.api.repos.getContent, {
			owner: remote.owner,
			repo: remote.repositoryName,
			path: filePath,
			ref: commit,
		});

		if (Array.isArray(fileContent.data)) {…}

		const contents = (fileContent.data as any).content ?? '';
		const buff = buffer.Buffer.from(contents, (fileContent.data as any).encoding);
		return buff.toString();
	}

	/**
	 * Get the timeline events of a pull request, including comments, reviews, commits, merges, deletes, and assigns.
	 */
	async getTimelineEvents(): Promise<TimelineEvent[]> {
		Logger.debug(`Fetch timeline events of PR #${this.number} - enter`, PullRequestModel.ID);
		const { query, remote, schema } = await this.githubRepository.ensure();

		try {

			const ret = data.repository.pullRequest.timelineItems.nodes;
			const events = parseGraphQLTimelineEvents(ret, this.githubRepository);

			this.addReviewTimelineEventComments(events, reviewThreads);
			insertNewCommitsSinceReview(events, latestReviewCommitInfo?.sha, currentUser, this.head);

			return events;
		} catch (e) {
			console.log(e);
			return [];
		}
	}

	private addReviewTimelineEventComments(events: TimelineEvent[], reviewThreads: IReviewThread[]): void {
		interface CommentNode extends IComment {
			childComments?: CommentNode[];
		}

		const reviewEvents = events.filter((e): e is CommonReviewEvent => e.event === EventType.Reviewed);
		const reviewComments = reviewThreads.reduce((previous, current) => (previous as IComment[]).concat(current.comments), []);

		const reviewEventsById = reviewEvents.reduce((index, evt) => {
			index[evt.id] = evt;
			evt.comments = [];
			return index;
		}, {} as { [key: number]: CommonReviewEvent });

		const commentsById = reviewComments.reduce((index, evt) => {
			index[evt.id] = evt;
			return index;
		}, {} as { [key: number]: CommentNode });

		const roots: CommentNode[] = [];
		let i = reviewComments.length;
		while (i-- > 0) {
			const c: CommentNode = reviewComments[i];
			if (!c.inReplyToId) {
				roots.unshift(c);
				continue;
			}
			const parent = commentsById[c.inReplyToId];
			parent.childComments = parent.childComments || [];
			parent.childComments = [c, ...(c.childComments || []), ...parent.childComments];
		}

		roots.forEach(c => {
			const review = reviewEventsById[c.pullRequestReviewId!];
			if (review) {…}
		});

		reviewThreads.forEach(thread => {
			if (!thread.prReviewDatabaseId || !reviewEventsById[thread.prReviewDatabaseId]) {…}
			const prReviewThreadEvent = reviewEventsById[thread.prReviewDatabaseId];
			prReviewThreadEvent.reviewThread = {
				threadId: thread.id,
				canResolve: thread.viewerCanResolve,
				canUnresolve: thread.viewerCanUnresolve,
				isResolved: thread.isResolved
			};

		});

		const pendingReview = reviewEvents.filter(r => r.state.toLowerCase() === 'pending')[0];
		if (pendingReview) {
			// Ensures that pending comments made in reply to other reviews are included for the pending review
			pendingReview.comments = reviewComments.filter(c => c.isDraft);
		}
	}

	private async _getReviewRequiredCheck() {
		const { query, remote, octokit, schema } = await this.githubRepository.ensure();

		const [branch, reviewStates] = await Promise.all([
			octokit.call(octokit.api.repos.getBranch, { branch: this.base.ref, owner: remote.owner, repo: remote.repositoryName }),
			query<LatestReviewsResponse>({
				query: schema.LatestReviews,
				variables: {
					owner: remote.owner,
					name: remote.repositoryName,
					number: this.number,
				}
			})
		]);
		if (branch.data.protected && branch.data.protection.required_status_checks && branch.data.protection.required_status_checks.enforcement_level !== 'off') {
			// We need to add the "review required" check manually.
			return {
				id: REVIEW_REQUIRED_CHECK_ID,
				context: 'Branch Protection',
				description: vscode.l10n.t('Other requirements have not been met.'),
				state: (reviewStates.data as LatestReviewsResponse).repository.pullRequest.latestReviews.nodes.every(node => node.state !== 'CHANGES_REQUESTED') ? CheckState.Neutral : CheckState.Failure,
				target_url: this.html_url
			};
		}
		return undefined;
	}

	/**
	 * Get the status checks of the pull request, those for the last commit.
	 */
	async getStatusChecks(): Promise<PullRequestChecks | undefined> {
		let checks = await this.githubRepository.getStatusChecks(this.number);

		// Fun info: The checks don't include whether a review is required.
		// Also, unless you're an admin on the repo, you can't just do octokit.repos.getBranchProtection
		if ((this.item.mergeable === PullRequestMergeability.NotMergeable) && (!checks || checks.statuses.every(status => status.state === CheckState.Success))) {
__SELECTION_HERE__
			if (reviewRequiredCheck) {
				if (!checks) {
					checks = {
						state: CheckState.Failure,
						statuses: []
					};
				}
				checks.statuses.push(reviewRequiredCheck);
				checks.state = CheckState.Failure;
			}
		}

		return checks;
	}

	static async openDiffFromComment(
		folderManager: FolderRepositoryManager,
		pullRequestModel: PullRequestModel,
		comment: IComment,
	): Promise<void> {
		const contentChanges = await pullRequestModel.getFileChangesInfo();
		const change = contentChanges.find(
			fileChange => fileChange.fileName === comment.path || fileChange.previousFileName === comment.path,
		);
		if (!change) {
			throw new Error(`Can't find matching file`);
		}

		const pathSegments = comment.path!.split('/');
		this.openDiff(folderManager, pullRequestModel, change, pathSegments[pathSegments.length - 1]);
	}

	static async openFirstDiff(
		folderManager: FolderRepositoryManager,
		pullRequestModel: PullRequestModel,
	) {
		const contentChanges = await pullRequestModel.getFileChangesInfo();
		if (!contentChanges.length) {
			return;
		}

		const firstChange = contentChanges[0];
		this.openDiff(folderManager, pullRequestModel, firstChange, firstChange.fileName);
	}

	static async openDiff(
		folderManager: FolderRepositoryManager,
		pullRequestModel: PullRequestModel,
		change: SlimFileChange | InMemFileChange,
		diffTitle: string
	): Promise<void> {


		let headUri, baseUri: vscode.Uri;
		if (!pullRequestModel.equals(folderManager.activePullRequest)) {…} else {…}

		vscode.commands.executeCommand(
			'vscode.diff',
			baseUri,
			headUri,
			`${diffTitle} (Pull Request)`,
			{},
		);
	}

	private _fileChanges: Map<string, SlimFileChange | InMemFileChange> = new Map();
	get fileChanges(): Map<string, SlimFileChange | InMemFileChange> {…}

	async getFileChangesInfo() {…}

	/**
	 * List the changed files in a pull request.
	 */
	private async getRawFileChangesInfo(): Promise<IRawFileChange[]> {…}
}
