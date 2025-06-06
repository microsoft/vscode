includeIssuesWithoutMilestone: boolean = false,
): Promise<ItemsResponseResult<MilestoneModel>> {
	try {
		const milestones: ItemsResponseResult<MilestoneModel> = await this.fetchPagedData<MilestoneModel>(
			options,
			'milestoneIssuesKey',
			PagedDataType.Milestones,
			PRType.All
		);
		if (includeIssuesWithoutMilestone) {
			const additionalIssues: ItemsResponseResult<Issue> = await this.fetchPagedData<Issue>(
				options,
				'noMilestoneIssuesKey',
				PagedDataType.IssuesWithoutMilestone,
				PRType.All
			);
			milestones.items.push({
				milestone: {
					createdAt: new Date(0).toDateString(),
					id: '',
					title: NO_MILESTONE,
				},
				issues: await Promise.all(additionalIssues.items.map(async (issue) => {
					const githubRepository = await this.getRepoForIssue(issue);
					return new IssueModel(githubRepository, githubRepository.remote, issue);
				})),
			});
		}
		return milestones;
	} catch (e) {
		Logger.error(`Error fetching milestone issues: ${e instanceof Error ? e.message : e}`, FolderRepositoryManager.ID);
		return { hasMorePages: false, hasUnsearchedRepositories: false, items: [] };
	}
}
