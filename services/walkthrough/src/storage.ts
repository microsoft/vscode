import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Walkthrough } from './types.js';

export class WalkthroughStorage {
	private readonly basePath: string;

	constructor(basePath?: string) {
		this.basePath = basePath ?? path.join(process.cwd(), '.son-of-anton', 'walkthroughs');
	}

	async save(walkthrough: Walkthrough): Promise<void> {
		await fs.mkdir(this.basePath, { recursive: true });
		const filePath = this.getFilePath(walkthrough.taskId);
		await fs.writeFile(filePath, JSON.stringify(walkthrough, null, 2), 'utf-8');
	}

	async load(taskId: string): Promise<Walkthrough | null> {
		const filePath = this.getFilePath(taskId);
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			return JSON.parse(content) as Walkthrough;
		} catch {
			return null;
		}
	}

	async list(): Promise<string[]> {
		try {
			const files = await fs.readdir(this.basePath);
			return files
				.filter(file => file.endsWith('.json'))
				.map(file => file.replace(/\.json$/, ''));
		} catch {
			return [];
		}
	}

	async search(query: string): Promise<Walkthrough[]> {
		const taskIds = await this.list();
		const results: Walkthrough[] = [];
		const lowerQuery = query.toLowerCase();

		for (const taskId of taskIds) {
			const walkthrough = await this.load(taskId);
			if (walkthrough && this.matchesQuery(walkthrough, lowerQuery)) {
				results.push(walkthrough);
			}
		}

		return results;
	}

	async delete(taskId: string): Promise<void> {
		const filePath = this.getFilePath(taskId);
		try {
			await fs.unlink(filePath);
		} catch {
			// Ignore if file does not exist
		}
	}

	private getFilePath(taskId: string): string {
		// Restrict taskId to a safe character set to avoid path traversal
		if (!/^[A-Za-z0-9_-]+$/.test(taskId)) {
			throw new Error('Invalid taskId');
		}

		const baseDir = path.resolve(this.basePath);
		const fileName = `${taskId}.json`;
		const resolvedPath = path.resolve(baseDir, fileName);

		// Ensure the resolved path is still within the base directory
		if (!resolvedPath.startsWith(baseDir + path.sep)) {
			throw new Error('Invalid taskId path');
		}

		return resolvedPath;
	}

	private matchesQuery(walkthrough: Walkthrough, query: string): boolean {
		if (walkthrough.summary.toLowerCase().includes(query)) {
			return true;
		}

		for (const decision of walkthrough.decisions) {
			if (
				decision.what.toLowerCase().includes(query) ||
				decision.why.toLowerCase().includes(query)
			) {
				return true;
			}
		}

		for (const file of walkthrough.filesChanged) {
			if (
				file.path.toLowerCase().includes(query) ||
				file.description.toLowerCase().includes(query)
			) {
				return true;
			}
		}

		for (const spec of walkthrough.specsReferenced) {
			if (spec.toLowerCase().includes(query)) {
				return true;
			}
		}

		for (const risk of walkthrough.risksAndTradeoffs) {
			if (risk.toLowerCase().includes(query)) {
				return true;
			}
		}

		return false;
	}
}
