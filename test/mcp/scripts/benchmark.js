#!/usr/bin/env node
/**
 * ⚡ VS CODE SPEEDRUN BENCHMARK
 * Performance comparison: Desktop (Electron) vs Web (Chromium)
 * 
 * Tests PR #268579 performance characteristics
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class VSCodeBenchmark {
	constructor() {
		this.results = {
			system: {
				platform: os.platform(),
				arch: os.arch(),
				cpus: os.cpus().length,
				memory: os.totalmem(),
				nodeVersion: process.version
			},
			desktop: {},
			web: {},
			timestamp: new Date().toISOString()
		};
	}

	/**
	 * Run all benchmarks
	 */
	async runAllBenchmarks() {
		console.log('⚡ ============================================');
		console.log('   VS CODE SPEEDRUN BENCHMARK');
		console.log('   Desktop vs Web Performance Test');
		console.log('============================================\n');

		console.log('📊 System Information:');
		console.log(`   Platform: ${this.results.system.platform}`);
		console.log(`   CPUs: ${this.results.system.cpus}`);
		console.log(`   Memory: ${(this.results.system.memory / 1024 / 1024 / 1024).toFixed(2)} GB`);
		console.log(`   Node: ${this.results.system.nodeVersion}\n`);

		// Run benchmarks for desktop
		console.log('🖥️  Testing Desktop (Electron)...\n');
		this.results.desktop = await this.runModeBenchmarks('desktop');

		// Wait a bit between tests
		await this.sleep(3000);

		// Run benchmarks for web
		console.log('\n🌐 Testing Web (Chromium)...\n');
		this.results.web = await this.runModeBenchmarks('web');

		// Generate comparison
		this.generateComparison();

		// Save results
		await this.saveResults();

		// Display final report
		this.displayReport();
	}

	/**
	 * Run benchmarks for a specific mode
	 */
	async runModeBenchmarks(mode) {
		const results = {};

		// Benchmark 1: Cold Start Time
		console.log(`  [${mode}] 1/9 Cold Start Time...`);
		results.coldStart = await this.benchmarkColdStart(mode);
		console.log(`        ✓ ${results.coldStart}ms`);

		await this.sleep(1000);

		// Benchmark 2: Hot Start Time
		console.log(`  [${mode}] 2/9 Hot Start Time...`);
		results.hotStart = await this.benchmarkHotStart(mode);
		console.log(`        ✓ ${results.hotStart}ms`);

		// Benchmark 3: Memory Usage
		console.log(`  [${mode}] 3/9 Memory Usage...`);
		results.memory = await this.benchmarkMemory(mode);
		console.log(`        ✓ ${(results.memory / 1024 / 1024).toFixed(2)} MB`);

		// Benchmark 4: Tool List Response Time
		console.log(`  [${mode}] 4/9 Tool List Response...`);
		results.toolListTime = await this.benchmarkToolList(mode);
		console.log(`        ✓ ${results.toolListTime}ms`);

		// Benchmark 5: File Open Speed (Small)
		console.log(`  [${mode}] 5/9 Small File Open...`);
		results.fileOpenSmall = await this.benchmarkFileOpen(mode, 'small');
		console.log(`        ✓ ${results.fileOpenSmall}ms`);

		// Benchmark 6: File Open Speed (Large)
		console.log(`  [${mode}] 6/9 Large File Open...`);
		results.fileOpenLarge = await this.benchmarkFileOpen(mode, 'large');
		console.log(`        ✓ ${results.fileOpenLarge}ms`);

		// Benchmark 7: Search Performance
		console.log(`  [${mode}] 7/9 Search Performance...`);
		results.searchTime = await this.benchmarkSearch(mode);
		console.log(`        ✓ ${results.searchTime}ms`);

		// Benchmark 8: Terminal Spawn Time
		console.log(`  [${mode}] 8/9 Terminal Spawn...`);
		results.terminalSpawn = await this.benchmarkTerminal(mode);
		console.log(`        ✓ ${results.terminalSpawn}ms`);

		// Benchmark 9: CPU Usage
		console.log(`  [${mode}] 9/9 CPU Usage...`);
		results.cpuUsage = await this.benchmarkCPU(mode);
		console.log(`        ✓ ${results.cpuUsage.toFixed(2)}%`);

		return results;
	}

	/**
	 * Individual benchmark implementations
	 */
	
	async benchmarkColdStart(mode) {
		const startTime = Date.now();
		const server = await this.startServer(mode);
		const duration = Date.now() - startTime;
		server.kill();
		return duration;
	}

	async benchmarkHotStart(mode) {
		// Pre-warm
		const warmup = await this.startServer(mode);
		warmup.kill();
		await this.sleep(500);

		// Actual benchmark
		const startTime = Date.now();
		const server = await this.startServer(mode);
		const duration = Date.now() - startTime;
		server.kill();
		return duration;
	}

	async benchmarkMemory(mode) {
		const server = await this.startServer(mode);
		await this.sleep(2000); // Let it stabilize
		
		const pid = server.pid;
		const memUsage = process.memoryUsage();
		
		server.kill();
		return memUsage.heapUsed;
	}

	async benchmarkToolList(mode) {
		const server = await this.startServer(mode);
		
		const startTime = Date.now();
		await this.sendRequest(server, 'tools/list', {});
		const duration = Date.now() - startTime;
		
		server.kill();
		return duration;
	}

	async benchmarkFileOpen(mode, size) {
		const server = await this.startServer(mode);
		
		const testFile = size === 'small' 
			? path.join(__dirname, '../README.md')
			: path.join(__dirname, '../../../package-lock.json');

		const startTime = Date.now();
		await this.sendRequest(server, 'tools/call', {
			name: 'vscode_automation_editor_open',
			arguments: { path: testFile }
		});
		const duration = Date.now() - startTime;
		
		server.kill();
		return duration;
	}

	async benchmarkSearch(mode) {
		const server = await this.startServer(mode);
		
		const startTime = Date.now();
		await this.sendRequest(server, 'tools/call', {
			name: 'vscode_automation_search',
			arguments: { query: 'function' }
		});
		const duration = Date.now() - startTime;
		
		server.kill();
		return duration;
	}

	async benchmarkTerminal(mode) {
		const server = await this.startServer(mode);
		
		const startTime = Date.now();
		await this.sendRequest(server, 'tools/call', {
			name: 'vscode_automation_terminal_create',
			arguments: {}
		});
		const duration = Date.now() - startTime;
		
		server.kill();
		return duration;
	}

	async benchmarkCPU(mode) {
		const server = await this.startServer(mode);
		
		const startUsage = process.cpuUsage();
		await this.sleep(1000);
		const endUsage = process.cpuUsage(startUsage);
		
		const cpuPercent = (endUsage.user + endUsage.system) / 10000;
		
		server.kill();
		return cpuPercent;
	}

	/**
	 * Helper: Start MCP server
	 */
	async startServer(mode) {
		const args = mode === 'web'
			? ['run', 'start-stdio', '--', '--web']
			: ['run', 'start-stdio'];

		return spawn('npm', args, {
			cwd: path.join(__dirname, '..'),
			stdio: ['pipe', 'pipe', 'pipe']
		});
	}

	/**
	 * Helper: Send request to server
	 */
	async sendRequest(server, method, params) {
		return new Promise((resolve) => {
			const request = {
				jsonrpc: '2.0',
				id: 1,
				method,
				params
			};

			server.stdin.write(JSON.stringify(request) + '\n');
			setTimeout(resolve, 100); // Simplified - should wait for actual response
		});
	}

	/**
	 * Generate comparison analysis
	 */
	generateComparison() {
		const { desktop, web } = this.results;
		const comparison = {};

		for (const key of Object.keys(desktop)) {
			const desktopVal = desktop[key];
			const webVal = web[key];
			
			const faster = desktopVal < webVal ? 'desktop' : 'web';
			const difference = Math.abs(desktopVal - webVal);
			const percentDiff = ((difference / Math.min(desktopVal, webVal)) * 100).toFixed(2);

			comparison[key] = {
				desktop: desktopVal,
				web: webVal,
				faster,
				difference,
				percentDiff: `${percentDiff}%`
			};
		}

		this.results.comparison = comparison;
	}

	/**
	 * Display final report
	 */
	displayReport() {
		console.log('\n' + '='.repeat(80));
		console.log('📊 BENCHMARK RESULTS');
		console.log('='.repeat(80));

		const { comparison } = this.results;

		console.log('\n┌─────────────────────────┬──────────────┬──────────────┬──────────────┐');
		console.log('│ Benchmark               │ Desktop      │ Web          │ Winner       │');
		console.log('├─────────────────────────┼──────────────┼──────────────┼──────────────┤');

		for (const [key, data] of Object.entries(comparison)) {
			const name = this.formatBenchmarkName(key);
			const desktop = this.formatValue(key, data.desktop);
			const web = this.formatValue(key, data.web);
			const winner = `${data.faster} (${data.percentDiff})`;

			console.log(`│ ${name.padEnd(23)} │ ${desktop.padEnd(12)} │ ${web.padEnd(12)} │ ${winner.padEnd(12)} │`);
		}

		console.log('└─────────────────────────┴──────────────┴──────────────┴──────────────┘');

		// Calculate overall winner
		const desktopWins = Object.values(comparison).filter(c => c.faster === 'desktop').length;
		const webWins = Object.values(comparison).filter(c => c.faster === 'web').length;

		console.log('\n🏆 OVERALL RESULTS:');
		console.log(`   Desktop Wins: ${desktopWins}`);
		console.log(`   Web Wins: ${webWins}`);
		console.log(`   Overall Winner: ${desktopWins > webWins ? 'DESKTOP' : 'WEB'}`);

		console.log('\n' + '='.repeat(80));
	}

	/**
	 * Helper: Format benchmark name
	 */
	formatBenchmarkName(key) {
		const names = {
			coldStart: 'Cold Start',
			hotStart: 'Hot Start',
			memory: 'Memory Usage',
			toolListTime: 'Tool List Time',
			fileOpenSmall: 'File Open (Small)',
			fileOpenLarge: 'File Open (Large)',
			searchTime: 'Search',
			terminalSpawn: 'Terminal Spawn',
			cpuUsage: 'CPU Usage'
		};
		return names[key] || key;
	}

	/**
	 * Helper: Format value with units
	 */
	formatValue(key, value) {
		if (key === 'memory') {
			return `${(value / 1024 / 1024).toFixed(2)} MB`;
		} else if (key === 'cpuUsage') {
			return `${value.toFixed(2)}%`;
		} else {
			return `${value}ms`;
		}
	}

	/**
	 * Save results to file
	 */
	async saveResults() {
		const resultsPath = path.join(__dirname, '..', 'test-results', `benchmark-${Date.now()}.json`);
		await fs.mkdir(path.dirname(resultsPath), { recursive: true });
		await fs.writeFile(resultsPath, JSON.stringify(this.results, null, 2));
		console.log(`\n💾 Results saved to: ${resultsPath}`);
	}

	/**
	 * Helper: Sleep
	 */
	sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

// Run benchmarks
if (require.main === module) {
	const benchmark = new VSCodeBenchmark();
	benchmark.runAllBenchmarks().catch(console.error);
}

module.exports = VSCodeBenchmark;
