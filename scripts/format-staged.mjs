#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) DSpace. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Script to format all staged TypeScript files and re-stage them.
 * This is used by the pre-commit hook to auto-format files before hygiene validation.
 *
 * Usage: npm run format:staged (called automatically by precommit hook)
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const vscodeRoot = join(__dirname, '..');

// Import the formatter
const formatterPath = join(vscodeRoot, 'build/lib/formatter.ts');
if (!existsSync(formatterPath)) {
	console.error('Error: Formatter not found at', formatterPath);
	console.error('Please run "npm run compile" first to build the formatter');
	process.exit(1);
}

// Import the formatter - use the same approach as the manual command
const formatterModule = await import(`file://${formatterPath}`);
const { format } = formatterModule;

// Get only staged files (files in git index)
function getStagedFiles() {
	try {
		const staged = execSync('git diff --cached --name-only', { cwd: vscodeRoot, encoding: 'utf-8' })
			.trim()
			.split('\n')
			.filter(line => line.trim());

		// Filter for TypeScript files (exclude node_modules)
		return staged.filter(file => {
			return file.endsWith('.ts') && !file.includes('node_modules');
		});
	} catch (error) {
		console.error('Error getting staged files:', error.message);
		return [];
	}
}

// Format a single file and re-stage it
function formatAndStageFile(filePath) {
	try {
		const fullPath = join(vscodeRoot, filePath);
		if (!existsSync(fullPath)) {
			// File was deleted, skip it
			return false;
		}

		const content = readFileSync(fullPath, 'utf-8');
		const formatted = format(filePath, content);

		if (formatted !== content) {
			writeFileSync(fullPath, formatted, 'utf-8');
			// Re-stage the file so the formatted version is committed
			execSync(`git add "${fullPath}"`, { cwd: vscodeRoot });
			console.log(`✓ Formatted and staged: ${filePath}`);
			return true;
		}
		return false;
	} catch (error) {
		console.error(`Error formatting ${filePath}:`, error.message);
		return false;
	}
}

// Main execution
const files = getStagedFiles();

if (files.length === 0) {
	// No staged TypeScript files, nothing to do
	process.exit(0);
}

console.log(`Formatting ${files.length} staged TypeScript file(s)...`);

let formattedCount = 0;
for (const file of files) {
	if (formatAndStageFile(file)) {
		formattedCount++;
	}
}

if (formattedCount > 0) {
	console.log(`✓ Auto-formatted ${formattedCount} file(s)`);
}
process.exit(0);

