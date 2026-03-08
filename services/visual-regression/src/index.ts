// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { ComparisonResult, ComparisonReport, BaselineInfo } from './types';

const PORT = parseInt(process.env.VISUAL_REGRESSION_PORT ?? '8094', 10);
const BASELINES_DIR = process.env.BASELINES_DIR ?? '/workspace/.son-of-anton/visual-baselines';

/**
 * Visual regression testing service.
 * Compares screenshots against stored baselines using pixel-level diffing.
 */
class VisualRegressionService {
	private readonly baselinesDir: string;
	private readonly diffThreshold: number;

	constructor(baselinesDir: string) {
		this.baselinesDir = baselinesDir;
		this.diffThreshold = parseFloat(process.env.DIFF_THRESHOLD ?? '0.01');
	}

	async initialize(): Promise<void> {
		await fs.mkdir(this.baselinesDir, { recursive: true });
	}

	/**
	 * Store a new baseline screenshot.
	 */
	async saveBaseline(name: string, imageData: Buffer): Promise<BaselineInfo> {
		const dir = path.join(this.baselinesDir, this.sanitizeName(name));
		await fs.mkdir(dir, { recursive: true });

		const filePath = path.join(dir, 'baseline.png');
		await fs.writeFile(filePath, imageData);

		const info: BaselineInfo = {
			name,
			path: filePath,
			savedAt: Date.now(),
			width: 0,
			height: 0,
		};

		// Read dimensions
		const png = PNG.sync.read(imageData);
		info.width = png.width;
		info.height = png.height;

		// Save metadata
		await fs.writeFile(
			path.join(dir, 'metadata.json'),
			JSON.stringify(info, null, '\t')
		);

		return info;
	}

	/**
	 * Compare a screenshot against its baseline.
	 */
	async compare(name: string, currentImage: Buffer): Promise<ComparisonResult> {
		const dir = path.join(this.baselinesDir, this.sanitizeName(name));
		const baselinePath = path.join(dir, 'baseline.png');

		// Check if baseline exists
		try {
			await fs.access(baselinePath);
		} catch {
			return {
				name,
				status: 'no_baseline',
				mismatchPercentage: 0,
				mismatchPixels: 0,
				totalPixels: 0,
				diffImagePath: null,
				message: 'No baseline found. Save a baseline first.',
			};
		}

		const baselineData = await fs.readFile(baselinePath);
		const baseline = PNG.sync.read(baselineData);
		const current = PNG.sync.read(currentImage);

		// Check dimension mismatch
		if (baseline.width !== current.width || baseline.height !== current.height) {
			return {
				name,
				status: 'dimension_mismatch',
				mismatchPercentage: 100,
				mismatchPixels: 0,
				totalPixels: baseline.width * baseline.height,
				diffImagePath: null,
				message: `Dimensions differ: baseline ${baseline.width}x${baseline.height} vs current ${current.width}x${current.height}`,
			};
		}

		// Pixel comparison
		const diff = new PNG({ width: baseline.width, height: baseline.height });
		const totalPixels = baseline.width * baseline.height;

		const mismatchPixels = pixelmatch(
			baseline.data,
			current.data,
			diff.data,
			baseline.width,
			baseline.height,
			{
				threshold: 0.1, // Anti-aliasing tolerance
				includeAA: false, // Ignore anti-aliasing differences
			}
		);

		const mismatchPercentage = (mismatchPixels / totalPixels) * 100;

		// Save diff image
		const diffPath = path.join(dir, 'diff.png');
		const currentPath = path.join(dir, 'current.png');
		await fs.writeFile(diffPath, PNG.sync.write(diff));
		await fs.writeFile(currentPath, currentImage);

		const passed = mismatchPercentage <= this.diffThreshold * 100;

		return {
			name,
			status: passed ? 'passed' : 'failed',
			mismatchPercentage: Math.round(mismatchPercentage * 100) / 100,
			mismatchPixels,
			totalPixels,
			diffImagePath: diffPath,
			message: passed
				? `Visual comparison passed (${mismatchPercentage.toFixed(2)}% difference)`
				: `Visual regression detected: ${mismatchPercentage.toFixed(2)}% of pixels differ`,
		};
	}

	/**
	 * Update the baseline with the current screenshot.
	 */
	async approveBaseline(name: string): Promise<boolean> {
		const dir = path.join(this.baselinesDir, this.sanitizeName(name));
		const currentPath = path.join(dir, 'current.png');
		const baselinePath = path.join(dir, 'baseline.png');

		try {
			await fs.copyFile(currentPath, baselinePath);

			// Update metadata
			const imageData = await fs.readFile(baselinePath);
			const png = PNG.sync.read(imageData);
			const metadata: BaselineInfo = {
				name,
				path: baselinePath,
				savedAt: Date.now(),
				width: png.width,
				height: png.height,
			};
			await fs.writeFile(
				path.join(dir, 'metadata.json'),
				JSON.stringify(metadata, null, '\t')
			);

			// Clean up diff
			try {
				await fs.unlink(path.join(dir, 'diff.png'));
				await fs.unlink(currentPath);
			} catch {
				// Best effort cleanup
			}

			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Run comparison for multiple screenshots and generate a report.
	 */
	async generateReport(comparisons: ComparisonResult[]): Promise<ComparisonReport> {
		const passed = comparisons.filter(c => c.status === 'passed').length;
		const failed = comparisons.filter(c => c.status === 'failed').length;
		const noBaseline = comparisons.filter(c => c.status === 'no_baseline').length;

		return {
			timestamp: Date.now(),
			total: comparisons.length,
			passed,
			failed,
			noBaseline,
			dimensionMismatch: comparisons.filter(c => c.status === 'dimension_mismatch').length,
			results: comparisons,
			summary: failed > 0
				? `Visual regression detected: ${failed} of ${comparisons.length} comparisons failed`
				: `All ${passed} comparisons passed`,
		};
	}

	/**
	 * List all stored baselines.
	 */
	async listBaselines(): Promise<BaselineInfo[]> {
		const baselines: BaselineInfo[] = [];

		try {
			const entries = await fs.readdir(this.baselinesDir, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory()) {
					try {
						const metadataPath = path.join(this.baselinesDir, entry.name, 'metadata.json');
						const data = await fs.readFile(metadataPath, 'utf-8');
						baselines.push(JSON.parse(data));
					} catch {
						// Skip entries without metadata
					}
				}
			}
		} catch {
			// No baselines directory
		}

		return baselines;
	}

	private sanitizeName(name: string): string {
		return name.replace(/[^a-zA-Z0-9_-]/g, '_');
	}
}

// --- HTTP API ---
const service = new VisualRegressionService(BASELINES_DIR);

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

	if (url.pathname === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok', service: 'visual-regression' }));
		return;
	}

	if (url.pathname === '/baselines' && req.method === 'GET') {
		const baselines = await service.listBaselines();
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(baselines, null, 2));
		return;
	}

	if (url.pathname === '/baselines' && req.method === 'POST') {
		const body = await readBody(req);
		const { name, imageData } = JSON.parse(body);
		const buffer = Buffer.from(imageData, 'base64');
		const info = await service.saveBaseline(name, buffer);
		res.writeHead(201, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(info, null, 2));
		return;
	}

	if (url.pathname === '/compare' && req.method === 'POST') {
		const body = await readBody(req);
		const { name, imageData } = JSON.parse(body);
		const buffer = Buffer.from(imageData, 'base64');
		const result = await service.compare(name, buffer);
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(result, null, 2));
		return;
	}

	if (url.pathname === '/approve' && req.method === 'POST') {
		const body = await readBody(req);
		const { name } = JSON.parse(body);
		const approved = await service.approveBaseline(name);
		res.writeHead(approved ? 200 : 400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ approved }));
		return;
	}

	if (url.pathname === '/report' && req.method === 'POST') {
		const body = await readBody(req);
		const { comparisons } = JSON.parse(body);
		const report = await service.generateReport(comparisons);
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(report, null, 2));
		return;
	}

	res.writeHead(404);
	res.end('Not found');
}

function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (chunk: Buffer) => chunks.push(chunk));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
		req.on('error', reject);
	});
}

const httpServer = http.createServer(async (req, res) => {
	try {
		await handleRequest(req, res);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: message }));
	}
});

service.initialize().then(() => {
	httpServer.listen(PORT, () => {
		console.log(`[visual-regression] Listening on port ${PORT}`);
	});
});
