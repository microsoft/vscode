module.exports = {
	// Sensible defaults
	extends: ['config:base', ':rebaseStalePrs', ':disableRateLimiting'],
	// dryRun: true,
	// Don't require config in repo
	onboarding: false,
	requireConfig: false,
	// Run on forked repo
	includeForks: true,
	// Bump ranges, don't pin
	rangeStrategy: 'bump',
	// GitHub API token
	token: '5572369935813e52b436025f7c70ebca8229af27',
	// Repository to run against: USER/REPO
	repositories: ['JamieMagee/vscode']
};
