includeIssuesWithoutMilestone: boolean = false,
): Promise<ItemsResponseResult<MilestoneModel>> {
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
}