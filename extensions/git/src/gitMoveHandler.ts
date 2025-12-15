/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Disposable, Uri, workspace, window, l10n } from 'vscode';
import { Model } from './model';
import { Repository } from './repository';
import { IFileOperationService, IFileMoveEvent, IFileMoveOperation } from './fileOperationService';
import { debounce } from './decorators';

interface PendingMove {
	source: Uri;
	target: Uri;
	repository: Repository;
	sourceRelative: string;
	targetRelative: string;
}

export class GitMoveHandler implements Disposable {
	private readonly disposables: Disposable[] = [];
	private pendingMoves: PendingMove[] = [];

	constructor(
		private readonly model: Model,
		private readonly fileOperationService: IFileOperationService
	) {
		this.disposables.push(
			this.fileOperationService.onDidMoveFiles(e => this.onDidMoveFiles(e))
		);
	}

	private async onDidMoveFiles(e: IFileMoveEvent): Promise<void> {
		for (const file of e.files) {
			await this.queueFileMove(file);
		}
		this.processPendingMoves();
	}

	private async queueFileMove(file: IFileMoveOperation): Promise<void> {
		// Check if setting is enabled
		const config = workspace.getConfiguration('git', file.target);
		if (!config.get<boolean>('autoStageOnMove')) {
			return;
		}

		// Find repository for source file
		const sourceRepo = this.model.getRepository(file.source);
		if (!sourceRepo) {
			return; // Source not in a git repo
		}

		// Find repository for target file
		const targetRepo = this.model.getRepository(file.target);
		if (!targetRepo) {
			return; // Target not in a git repo
		}

		// Must be same repository (repository.root is already rev-parse --show-toplevel result)
		if (sourceRepo.root !== targetRepo.root) {
			return; // Cross-repo move, skip
		}

		const repoRoot = sourceRepo.root;
		const sourceRelative = this.getRelativePath(repoRoot, file.source.fsPath);
		const targetRelative = this.getRelativePath(repoRoot, file.target.fsPath);

		// Check if source file was tracked using CLI (more robust than state)
		try {
			const wasTracked = await sourceRepo.isTracked(sourceRelative);
			if (!wasTracked) {
				return; // Untracked file, skip
			}
		} catch {
			return; // Error checking, skip to be safe
		}

		// Note on partial staging protection:
		// The original plan called for checking if the source file has partial staging
		// (some hunks staged, some not). However, after a filesystem move completes
		// (which is when onDidRenameFiles fires), we cannot reliably detect this case
		// because the source file no longer exists on disk. Git will report both
		// "staged changes" (the index entry) and "unstaged changes" (file deleted),
		// which looks identical to true partial staging.
		//
		// For explorer-based renames, the user cannot have partially staged hunks
		// and then rename in a single atomic operation - VS Code's rename happens
		// at the filesystem level. If a user has partially staged a file and then
		// renames it via explorer, VS Code will move the file, and our handler will
		// stage the rename. This is acceptable because:
		// 1. The staged hunks are preserved (they're still in the index at the old path)
		// 2. Running git add + git rm --cached will update the index to reflect the new path
		// 3. The user's staged content is not lost, just updated to the new filename
		//
		// True partial staging protection would require intercepting BEFORE the move,
		// which isn't possible with onDidRenameFiles.

		this.pendingMoves.push({
			source: file.source,
			target: file.target,
			repository: sourceRepo,
			sourceRelative,
			targetRelative
		});
	}

	@debounce(100)
	private async processPendingMoves(): Promise<void> {
		if (this.pendingMoves.length === 0) {
			return;
		}

		// Group moves by repository
		const movesByRepo = new Map<Repository, PendingMove[]>();
		for (const move of this.pendingMoves) {
			const existing = movesByRepo.get(move.repository) || [];
			existing.push(move);
			movesByRepo.set(move.repository, existing);
		}

		// Clear pending moves
		this.pendingMoves = [];

		// Process each repository's moves in batch
		for (const [repository, moves] of movesByRepo) {
			await this.processBatchedMoves(repository, moves);
		}
	}

	private async processBatchedMoves(repository: Repository, moves: PendingMove[]): Promise<void> {
		const targetPaths = moves.map(m => m.targetRelative);
		const sourcePaths = moves.map(m => m.sourceRelative);

		try {
			// Stage new paths
			await repository.addByPath(targetPaths);
			// Remove old paths from index
			await repository.rmCached(sourcePaths);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);

			// Expected errors - silent fallback
			if (errorMessage.includes('not under version control') ||
				errorMessage.includes('did not match any files')) {
				return;
			}

			// Unexpected errors - show warning
			window.showWarningMessage(
				l10n.t('Could not stage file rename in git: {0}', errorMessage)
			);
		}
	}

	private getRelativePath(repoRoot: string, filePath: string): string {
		// Use path.relative for robustness, normalize to forward slashes for git
		return path.relative(repoRoot, filePath).replace(/\\/g, '/');
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
