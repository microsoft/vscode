/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { basename } from 'node:path';

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { packageJson } from '../../../platform/env/common/packagejson';
import { ICodeReviewService, NullCodeReviewService, type TypeScriptChangeBucket, type TypeScriptChangeClassificationInput, type TypeScriptChangeClassificationResult, type TypeScriptMetricsResult } from '../../../platform/languageContextProvider/common/codeReviewService';
import { ILogService } from '../../../platform/log/common/logService';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { TS6CodeReviewProvider } from './ts6/codeReviewService';
import { TS7CodeReviewProvider } from './ts7/codeReviewService';
import { TypeScript } from './tsService';

export const CodeReviewDiffUriPath = '/openCodeReviewDiff';

const codeReviewDiffScheme = 'copilot-code-review';
const maxCachedReviews = 20;

type CodeReviewProvider = vscode.Disposable & Pick<ICodeReviewService, 'computeMetrics' | 'classifyChanges'>;

interface CodeReviewSource {
	readonly filePath: string;
	readonly original: string;
	readonly modified: string;
}

export class CodeReviewService implements ICodeReviewService {
	readonly _serviceBrand: undefined;

	private readonly disposables = new DisposableStore();
	private readonly reviewSources = new Map<string, CodeReviewSource>();
	private provider: CodeReviewProvider;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		this.disposables.add(vscode.workspace.registerTextDocumentContentProvider(codeReviewDiffScheme, {
			provideTextDocumentContent: uri => this.provideTextDocumentContent(uri),
		}));
		this.disposables.add(this.configurationService.onDidChangeConfiguration(event => {
			if (TypeScript.affectsVersion(event) || event.affectsConfiguration(ConfigKey.TypeScript7LanguageContext.fullyQualifiedId)) {
				this.updateProvider();
			}
		}));
		this.provider = this.createProvider();
	}

	computeMetrics(filePath: string, content?: string): Promise<TypeScriptMetricsResult | undefined> {
		return this.provider.computeMetrics(filePath, content);
	}

	async classifyChanges(input: TypeScriptChangeClassificationInput): Promise<TypeScriptChangeClassificationResult | undefined> {
		if (!input.modified.added.every(CodeReviewService.isValidLineRange)
			|| !input.modified.changed.every(CodeReviewService.isValidLineRange)
			|| !input.original.deleted.every(CodeReviewService.isValidLineRange)) {
			throw new Error('TypeScript change buckets contain invalid line information');
		}
		const result = await this.provider.classifyChanges(input);
		if (result === undefined) {
			return undefined;
		}

		const modified = input.modified.content
			?? (await vscode.workspace.openTextDocument(vscode.Uri.file(input.filePath))).getText();
		const reviewId = this.cacheReviewSource({
			filePath: input.filePath,
			original: input.original.content,
			modified,
		});
		const ranges = new Map<string, { original?: { start: number; end: number }; modified?: { start: number; end: number } }>();
		for (const bucket of result.original) {
			ranges.set(JSON.stringify(bucket.path), { original: bucket.range });
		}
		for (const bucket of result.modified) {
			const key = JSON.stringify(bucket.path);
			ranges.set(key, { ...ranges.get(key), modified: bucket.range });
		}

		const addLink = <T extends TypeScriptChangeBucket>(bucket: T): T => ({
			...bucket,
			entityLink: this.createEntityLink(reviewId, bucket, ranges.get(JSON.stringify(bucket.path))),
		});
		return {
			modified: result.modified.map(addLink),
			original: result.original.map(addLink),
		};
	}

	async openDiff(uri: vscode.Uri): Promise<void> {
		if (uri.path !== CodeReviewDiffUriPath) {
			throw new Error(`Unsupported code review URI path '${uri.path}'`);
		}
		const params = new URLSearchParams(uri.query);
		const reviewId = params.get('id');
		const source = reviewId === null ? undefined : this.reviewSources.get(reviewId);
		if (reviewId === null || source === undefined) {
			await vscode.window.showWarningMessage(l10n.t`This code review diff is no longer available. Run the change classifier again.`);
			return;
		}

		const originalUri = this.createSnapshotUri(source.filePath, reviewId, 'original');
		const modifiedUri = this.createSnapshotUri(source.filePath, reviewId, 'modified');
		const requestedLine = CodeReviewService.parseLine(params.get('modifiedStart'))
			?? CodeReviewService.parseLine(params.get('originalStart'))
			?? 0;
		const modifiedLineCount = source.modified.split(/\r\n|\r|\n/).length;
		const line = Math.min(requestedLine, Math.max(0, modifiedLineCount - 1));
		const entityLabel = params.get('label');
		const title = entityLabel
			? `${basename(source.filePath)} — ${entityLabel}`
			: basename(source.filePath);
		await vscode.commands.executeCommand(
			'vscode.diff',
			originalUri,
			modifiedUri,
			title,
			{
				preview: false,
				selection: new vscode.Range(line, 0, line, 0),
			},
		);
	}

	dispose(): void {
		this.provider.dispose();
		this.reviewSources.clear();
		this.disposables.dispose();
	}

	private createProvider(): CodeReviewProvider {
		if (!TypeScript.runsVersion7()) {
			return new TS6CodeReviewProvider();
		}
		return TypeScript.isVersion7SupportEnabled(this.configurationService)
			? new TS7CodeReviewProvider(this.logService)
			: new NullCodeReviewService();
	}

	private updateProvider(): void {
		const runsTS7 = TypeScript.runsVersion7();
		const enableTS7 = TypeScript.isVersion7SupportEnabled(this.configurationService);
		const oldProvider = this.provider;
		if (runsTS7) {
			if (oldProvider instanceof TS6CodeReviewProvider) {
				this.provider = enableTS7
					? new TS7CodeReviewProvider(this.logService)
					: new NullCodeReviewService();
			} else if (oldProvider instanceof TS7CodeReviewProvider && !enableTS7) {
				this.provider = new NullCodeReviewService();
			} else if (oldProvider instanceof NullCodeReviewService && enableTS7) {
				this.provider = new TS7CodeReviewProvider(this.logService);
			}
		} else if (!(oldProvider instanceof TS6CodeReviewProvider)) {
			this.provider = new TS6CodeReviewProvider();
		}
		if (oldProvider !== this.provider) {
			oldProvider.dispose();
		}
	}

	private static isValidLineRange(range: { start: number; end: number }): boolean {
		return Number.isInteger(range.start) && range.start >= 0 && Number.isInteger(range.end) && range.end > range.start;
	}

	private static parseLine(value: string | null): number | undefined {
		if (value === null) {
			return undefined;
		}
		const line = Number(value);
		return Number.isInteger(line) && line >= 0 ? line : undefined;
	}

	private cacheReviewSource(source: CodeReviewSource): string {
		while (this.reviewSources.size >= maxCachedReviews) {
			const oldest = this.reviewSources.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			this.reviewSources.delete(oldest);
		}
		const id = generateUuid();
		this.reviewSources.set(id, source);
		return id;
	}

	private createEntityLink(reviewId: string, bucket: TypeScriptChangeBucket, ranges: { original?: { start: number }; modified?: { start: number } } | undefined): vscode.Uri {
		const query = new URLSearchParams({
			id: reviewId,
			label: bucket.path.join('.'),
		});
		if (ranges?.original !== undefined) {
			query.set('originalStart', ranges.original.start.toString());
		}
		if (ranges?.modified !== undefined) {
			query.set('modifiedStart', ranges.modified.start.toString());
		}
		return vscode.Uri.from({
			scheme: vscode.env.uriScheme,
			authority: `${packageJson.publisher}.${packageJson.name}`,
			path: CodeReviewDiffUriPath,
			query: query.toString(),
		});
	}

	private createSnapshotUri(filePath: string, reviewId: string, side: 'original' | 'modified'): vscode.Uri {
		const fileUri = vscode.Uri.file(filePath);
		return vscode.Uri.from({
			scheme: codeReviewDiffScheme,
			authority: fileUri.authority,
			path: fileUri.path,
			query: new URLSearchParams({ id: reviewId, side }).toString(),
		});
	}

	private provideTextDocumentContent(uri: vscode.Uri): string | undefined {
		const params = new URLSearchParams(uri.query);
		const reviewId = params.get('id');
		const side = params.get('side');
		if (reviewId === null || (side !== 'original' && side !== 'modified')) {
			return undefined;
		}
		return this.reviewSources.get(reviewId)?.[side];
	}
}
