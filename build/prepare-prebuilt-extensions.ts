/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// test-workbench_change - new file
/*---------------------------------------------------------------------------------------------
 *  Prepare Prebuilt Extensions
 *  This script pulls the prebuilt extensions submodule and extracts VSIX files
 *
 *  Usage:
 *    # Auto-detect current platform (default behavior)
 *    node build/prepare-prebuilt-extensions.ts
 *
 *    # Extract for specific platform
 *    node build/prepare-prebuilt-extensions.ts --platform=darwin --arch=arm64
 *    node build/prepare-prebuilt-extensions.ts --platform=win32 --arch=x64
 *    node build/prepare-prebuilt-extensions.ts --platform=linux --arch=x64
 *
 *  Directory Structure:
 *    prebuilt-extensions/
 *      ├── *.vsix                    # Platform-agnostic extensions (always included)
 *      ├── darwin/
 *      │   ├── arm64/*.vsix         # macOS ARM64 extensions
 *      │   └── x64/*.vsix           # macOS Intel extensions
 *      ├── win32/
 *      │   ├── arm64/*.vsix         # Windows ARM64 extensions
 *      │   └── x64/*.vsix           # Windows x64 extensions
 *      └── linux/
 *          ├── arm64/*.vsix         # Linux ARM64 extensions
 *          └── x64/*.vsix           # Linux x64 extensions
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os'; // test-workbench_change
import { promisify } from 'util';
import yauzl from 'yauzl';

const exec = promisify(cp.exec);
const root = path.dirname(import.meta.dirname);

interface ExtractOptions {
	platform?: string;
	arch?: string;
}

/**
 * Detect current platform and architecture
 */
function detectPlatform(): { platform: string; arch: string } {
	// test-workbench_change start
	const platform = os.platform();
	const arch = os.arch();

	// Map Node.js platform names to VS Code platform names
	const platformMap: Record<string, string> = {
		'darwin': 'darwin',
		'win32': 'win32',
		'linux': 'linux'
	};

	// Map Node.js arch names to VS Code arch names
	const archMap: Record<string, string> = {
		'x64': 'x64',
		'arm64': 'arm64',
		'ia32': 'ia32',
		'arm': 'arm'
	};

	return {
		platform: platformMap[platform] || platform,
		arch: archMap[arch] || arch
	};
	// test-workbench_change end
}

/**
 * Get submodule URL from .gitmodules
 */
function getSubmoduleUrl(): string | null {
	const gitmodulesPath = path.join(root, '.gitmodules');
	if (!fs.existsSync(gitmodulesPath)) {
		return null;
	}
	const gitmodules = fs.readFileSync(gitmodulesPath, 'utf8');
	const match = gitmodules.match(/\[submodule "prebuilt-extensions"\][^[]*url\s*=\s*(\S+)/);
	return match?.[1] ?? null;
}

/**
 * Clone or update the prebuilt extensions repository.
 * Directly clones from the remote URL in .gitmodules — no git submodule workflow needed.
 */
async function updateSubmodule(): Promise<void> {
	const url = getSubmoduleUrl();

	if (!url) {
		console.log('⚠ Prebuilt extensions not configured. Skipping.');
		console.log('  To use prebuilt extensions, add to .gitmodules:');
		console.log('  [submodule "prebuilt-extensions"]');
		console.log('    path = prebuilt-extensions');
		console.log('    url = <your-vsix-repo-url>');
		return;
	}

	console.log(`Repository: ${url}`);

	const submodulePath = path.join(root, 'prebuilt-extensions');

	try {
		if (fs.existsSync(submodulePath)) {
			// Already cloned — pull latest
			console.log('  Pulling latest...');
			await exec(`git -C "${submodulePath}" pull --ff-only`, { cwd: root });
			console.log('✓ Up to date');
		} else {
			// Clone fresh (shallow clone for speed)
			console.log('  Cloning...');
			await exec(`git clone --depth 1 "${url}" "${submodulePath}"`, { cwd: root });
			console.log('✓ Cloned');
		}
	} catch (error) {
		console.warn('⚠ Failed to update prebuilt extensions:', error);
		console.log('  Continuing with existing content...');
	}
}

/**
 * Extract a VSIX file to the extensions directory
 */
async function extractVsix(vsixPath: string, targetDir: string): Promise<void> {
	return new Promise((resolve, reject) => {
		yauzl.open(vsixPath, { lazyEntries: true }, (err, zipfile) => {
			if (err || !zipfile) {
				return reject(err || new Error('Failed to open VSIX file'));
			}

			zipfile.readEntry();
			zipfile.on('entry', (entry: yauzl.Entry) => {
				// Skip directories
				if (/\/$/.test(entry.fileName)) {
					zipfile.readEntry();
					return;
				}

				// Extract files from the 'extension' folder in VSIX
				if (entry.fileName.startsWith('extension/')) {
					const relativePath = entry.fileName.substring('extension/'.length);
					const targetPath = path.join(targetDir, relativePath);
					const targetDirPath = path.dirname(targetPath);

					// Ensure directory exists
					fs.mkdirSync(targetDirPath, { recursive: true });

					zipfile.openReadStream(entry, (err, readStream) => {
						if (err || !readStream) {
							return reject(err || new Error('Failed to read entry'));
						}

						const writeStream = fs.createWriteStream(targetPath);
						readStream.pipe(writeStream);
						writeStream.on('close', () => {
							zipfile.readEntry();
						});
						writeStream.on('error', reject);
					});
				} else {
					zipfile.readEntry();
				}
			});

			zipfile.on('end', () => {
				resolve();
			});

			zipfile.on('error', reject);
		});
	});
}

/**
 * Get platform-specific VSIX files
 */
function getPlatformVsixFiles(submodulePath: string, options: ExtractOptions): string[] {
	// test-workbench_change start
	let { platform, arch } = options;
	const vsixFiles: string[] = [];

	// Auto-detect platform if no platform specified (default behavior)
	if (!platform) {
		const detected = detectPlatform();
		platform = detected.platform;
		arch = detected.arch;
		console.log(`Auto-detected platform: ${platform}/${arch}`);
	}

	// Collect VSIX files from multiple sources
	const searchPaths: string[] = [];

	// 1. Platform-agnostic extensions (root directory)
	searchPaths.push(submodulePath);

	// 2. Platform-specific extensions
	if (platform) {
		if (arch) {
			// Specific platform and arch: prebuilt-extensions/{platform}/{arch}/
			searchPaths.push(path.join(submodulePath, platform, arch));
		} else {
			// All architectures for this platform: prebuilt-extensions/{platform}/
			searchPaths.push(path.join(submodulePath, platform));
		}
	}

	// Find all VSIX files recursively
	function findVsixFiles(dir: string, depth: number = 0): void {
		if (!fs.existsSync(dir)) {
			return;
		}

		const entries = fs.readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);

			if (entry.isDirectory()) {
				// For root directory, only search at top level (depth 0)
				// For platform directories, search recursively
				if (dir === submodulePath && depth === 0) {
					// Skip platform directories when searching root
					if (!['darwin', 'win32', 'linux'].includes(entry.name)) {
						findVsixFiles(fullPath, depth + 1);
					}
				} else if (dir !== submodulePath) {
					findVsixFiles(fullPath, depth + 1);
				}
			} else if (entry.isFile() && entry.name.endsWith('.vsix')) {
				vsixFiles.push(fullPath);
			}
		}
	}

	// Search all paths and deduplicate
	const uniqueFiles = new Set<string>();
	for (const searchPath of searchPaths) {
		findVsixFiles(searchPath);
	}

	vsixFiles.forEach(file => uniqueFiles.add(file));

	if (uniqueFiles.size === 0 && platform) {
		console.warn(`No VSIX files found for platform: ${platform}${arch ? '/' + arch : ''}`);
	}

	return Array.from(uniqueFiles);
	// test-workbench_change end
}

/**
 * Extract all VSIX files to the .build/extensions directory
 */
async function extractExtensions(options: ExtractOptions = {}): Promise<void> {
	const submodulePath = path.join(root, 'prebuilt-extensions');
	const extensionsDir = path.join(root, '.build', 'extensions');

	// Check if submodule directory exists
	if (!fs.existsSync(submodulePath)) {
		console.log('⚠ Submodule directory not found. Skipping extension extraction.');
		return;
	}

	// Ensure extensions directory exists
	fs.mkdirSync(extensionsDir, { recursive: true });

	// Get VSIX files for the platform
	const vsixFiles = getPlatformVsixFiles(submodulePath, options);

	if (vsixFiles.length === 0) {
		console.log('No VSIX files found for the specified platform');
		return;
	}

	console.log(`Found ${vsixFiles.length} VSIX file(s) to extract`);

	// Extract each VSIX file
	for (const vsixFile of vsixFiles) {
		const vsixName = path.basename(vsixFile, '.vsix');
		console.log(`Extracting ${vsixName}...`);

		// Read package.json from VSIX to get extension name
		const extensionName = await getExtensionNameFromVsix(vsixFile);
		// Convert to lowercase to match VS Code's extension directory naming convention
		const targetDir = path.join(extensionsDir, (extensionName || vsixName).toLowerCase());

		// Remove existing extension directory if it exists
		if (fs.existsSync(targetDir)) {
			fs.rmSync(targetDir, { recursive: true, force: true });
		}

		try {
			await extractVsix(vsixFile, targetDir);

			// Create marker file to identify this as a prebuilt extension // test-workbench_change
			const markerPath = path.join(targetDir, '.prebuilt-extension'); // test-workbench_change
			fs.writeFileSync(markerPath, `Extracted from: ${path.basename(vsixFile)}\nDate: ${new Date().toISOString()}`); // test-workbench_change

			console.log(`✓ Extracted ${extensionName || vsixName}`);
		} catch (error) {
			console.error(`Failed to extract ${vsixName}:`, error);
			throw error;
		}
	}

	console.log('✓ All extensions extracted successfully');
}

/**
 * Get extension name from VSIX package.json
 */
async function getExtensionNameFromVsix(vsixPath: string): Promise<string | null> {
	return new Promise((resolve) => {
		yauzl.open(vsixPath, { lazyEntries: true }, (err, zipfile) => {
			if (err || !zipfile) {
				resolve(null);
				return;
			}

			zipfile.readEntry();
			zipfile.on('entry', (entry: yauzl.Entry) => {
				if (entry.fileName === 'extension/package.json') {
					zipfile.openReadStream(entry, (err, readStream) => {
						if (err || !readStream) {
							resolve(null);
							return;
						}

						let data = '';
						readStream.on('data', (chunk) => {
							data += chunk.toString();
						});
						readStream.on('end', () => {
							try {
								const packageJson = JSON.parse(data);
								const name = packageJson.publisher && packageJson.name
									? `${packageJson.publisher}.${packageJson.name}`
									: packageJson.name;
								zipfile.close();
								resolve(name);
							} catch {
								resolve(null);
							}
						});
					});
				} else {
					zipfile.readEntry();
				}
			});

			zipfile.on('end', () => {
				resolve(null);
			});
		});
	});
}

/**
 * Main function
 */
export async function preparePrebuiltExtensions(options: ExtractOptions = {}): Promise<void> {
	console.log('=== Preparing Prebuilt Extensions ===');

	try {
		// Step 1: Update submodule (will skip if not configured)
		await updateSubmodule();

		// Step 2: Extract extensions (will skip if no submodule)
		await extractExtensions(options);

		console.log('=== Prebuilt Extensions Ready ===');
	} catch (error) {
		console.error('⚠ Error during extension preparation:', error);
		console.log('  Build will continue without prebuilt extensions.');
		// Don't throw - allow build to continue
	}
}

// CLI support
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);
	const platform = args.find(arg => arg.startsWith('--platform='))?.split('=')[1];
	const arch = args.find(arg => arg.startsWith('--arch='))?.split('=')[1];

	preparePrebuiltExtensions({ platform, arch })
		.then(() => process.exit(0))
		.catch((error) => {
			console.error(error);
			process.exit(1);
		});
}
