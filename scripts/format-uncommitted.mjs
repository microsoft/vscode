#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Script to format all uncommitted TypeScript files
 * Usage: npm run format:uncommitted
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

// Get uncommitted files
function getUncommittedFiles() {
	try {
		// Get modified and staged files
		const modified = execSync('git diff --name-only', { cwd: vscodeRoot, encoding: 'utf-8' })
			.trim()
			.split('\n')
			.filter(line => line.trim());
		
		const staged = execSync('git diff --cached --name-only', { cwd: vscodeRoot, encoding: 'utf-8' })
			.trim()
			.split('\n')
			.filter(line => line.trim());
		
		// Combine and deduplicate
		const allFiles = [...new Set([...modified, ...staged])];
		
		// Filter for TypeScript files (exclude node_modules)
		return allFiles.filter(file => {
			return file.endsWith('.ts') && !file.includes('node_modules');
		});
	} catch (error) {
		console.error('Error getting uncommitted files:', error.message);
		return [];
	}
}

// Format a single file
function formatFile(filePath) {
	try {
		const fullPath = join(vscodeRoot, filePath);
		if (!existsSync(fullPath)) {
			console.warn(`Warning: File not found: ${filePath}`);
			return false;
		}
		
		const content = readFileSync(fullPath, 'utf-8');
		const formatted = format(filePath, content);
		
		if (formatted !== content) {
			writeFileSync(fullPath, formatted, 'utf-8');
			console.log(`✓ Formatted: ${filePath}`);
			return true;
		} else {
			console.log(`- No changes: ${filePath}`);
			return false;
		}
	} catch (error) {
		console.error(`Error formatting ${filePath}:`, error.message);
		return false;
	}
}

// Main execution
const files = getUncommittedFiles();

if (files.length === 0) {
	console.log('No uncommitted TypeScript files found');
	process.exit(0);
}

console.log(`Found ${files.length} uncommitted file(s) to format:\n`);

let formattedCount = 0;
for (const file of files) {
	if (formatFile(file)) {
		formattedCount++;
	}
}

console.log(`\n✓ Formatted ${formattedCount} of ${files.length} file(s)`);
process.exit(0);
