import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export class GitManager {
	private repositoryPath: string;

	constructor(repositoryPath: string) {
		this.repositoryPath = path.resolve(repositoryPath);
	}

	/**
	 * Executes a git command in the repository directory
	 * @param command Git command to execute
	 * @returns Promise with stdout and stderr
	 */
	private async executeGitCommand(
		command: string,
	): Promise<{ stdout: string; stderr: string }> {
		return execAsync(command, { cwd: this.repositoryPath });
	}

	/**
	 * Initializes a git repository if it doesn't already exist
	 * @returns Promise resolving when complete
	 */
	public async initRepository(): Promise<void> {
		const gitPath = path.join(this.repositoryPath, '.git');

		if (!fs.existsSync(gitPath)) {
			await this.executeGitCommand('git init');
			console.log(`Initialized git repository at ${this.repositoryPath}`);
		} else {
			console.log(
				`Git repository already exists at ${this.repositoryPath}`,
			);
		}
	}

	/**
	 * Creates a git commit with the specified message
	 * @param message Commit message
	 * @param addAll Whether to add all files before committing
	 * @returns Promise resolving to the commit hash
	 */
	public async commit(message: string, addAll = true): Promise<string> {
		if (addAll) {
			await this.executeGitCommand('git add .');
		}

		const { stdout } = await this.executeGitCommand(
			`git commit -m '${message}'`,
		);
		// Extract commit hash from the output
		const match = stdout.match(/\[[\w\s]+\s([a-f0-9]+)\]/);
		return match ? match[1] : '';
	}

	/**
	 * Gets the git diff between the first commit and current state
	 * @param baseCommit Base commit to compare against (defaults to first commit in repository)
	 * @returns Promise resolving to the diff text
	 */
	public async getDiff(baseCommit?: string): Promise<string> {
		try {
			// If no baseCommit is provided, get the first commit in repository history
			if (!baseCommit) {
				const { stdout } = await this.executeGitCommand(
					'git rev-list --max-parents=0 HEAD',
				);
				baseCommit = stdout.trim();
			}

			const { stdout } = await this.executeGitCommand(
				`git diff ${baseCommit}`,
			);
			return stdout;
		} catch (error) {
			console.error('Error getting git diff:', error);
			throw error;
		}
	}

	/**
	 * Gets the git diff between two commits
	 * @param fromCommit Starting commit
	 * @param toCommit Ending commit (defaults to current state)
	 * @returns Promise resolving to the diff text
	 */
	public async getDiffBetweenCommits(
		fromCommit: string,
		toCommit: string = 'HEAD',
	): Promise<string> {
		try {
			const { stdout } = await this.executeGitCommand(
				`git diff ${fromCommit} ${toCommit}`,
			);
			return stdout;
		} catch (error) {
			console.error('Error getting git diff between commits:', error);
			throw error;
		}
	}

	/**
	 * Checks if there are any uncommitted changes
	 * @returns Promise resolving to boolean
	 */
	public async hasUncommittedChanges(): Promise<boolean> {
		const { stdout } = await this.executeGitCommand(
			'git status --porcelain',
		);
		return stdout.trim().length > 0;
	}
}

export const gitManager = new GitManager('.');
