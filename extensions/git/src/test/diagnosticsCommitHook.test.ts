/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Diagnostic, DiagnosticSeverity, Range, Uri, languages } from 'vscode';

// Import the function we want to test (we'll need to export it first)
// import { evaluateDiagnosticsCommitHook } from '../commands';

/**
 * Test suite for the diagnostics commit hook functionality
 */
suite('Diagnostics Commit Hook', () => {
	
	setup(() => {
		// Clear any existing diagnostics before each test
		// This ensures we start with a clean state
	});

	teardown(() => {
		// Clean up after each test
	});

	test('should not show dialog when no diagnostics exist', async () => {
		// This test verifies that files with no diagnostics don't trigger the dialog
		const testUri = Uri.file('/test/file.ts');
		
		// Ensure no diagnostics exist for this file
		const diagnostics = languages.getDiagnostics(testUri);
		assert.strictEqual(diagnostics.length, 0, 'Expected no diagnostics for test file');
		
		// TODO: Call evaluateDiagnosticsCommitHook and verify it returns true
	});

	test('should not show dialog for information and hint diagnostics only', async () => {
		// This test verifies that purely informational diagnostics don't block commits
		const testUri = Uri.file('/test/file.ts');
		
		// Create test diagnostics collection
		const collection = languages.createDiagnosticCollection('test');
		
		try {
			// Add only information and hint diagnostics
			const infoDiagnostic = new Diagnostic(
				new Range(0, 0, 0, 10),
				'This is just information',
				DiagnosticSeverity.Information
			);
			infoDiagnostic.source = 'typescript';
			
			const hintDiagnostic = new Diagnostic(
				new Range(1, 0, 1, 10),
				'This is just a hint',
				DiagnosticSeverity.Hint
			);
			hintDiagnostic.source = 'typescript';
			
			collection.set(testUri, [infoDiagnostic, hintDiagnostic]);
			
			// Verify diagnostics were set
			const diagnostics = languages.getDiagnostics(testUri);
			assert.strictEqual(diagnostics.length, 2, 'Expected 2 diagnostics');
			
			// TODO: Test that evaluateDiagnosticsCommitHook returns true (no dialog)
			// when config is set to only care about errors/warnings
		} finally {
			collection.dispose();
		}
	});

	test('should show dialog for error diagnostics', async () => {
		// This test verifies that actual error diagnostics do trigger the dialog
		const testUri = Uri.file('/test/file.ts');
		
		// Create test diagnostics collection
		const collection = languages.createDiagnosticCollection('test');
		
		try {
			// Add an error diagnostic
			const errorDiagnostic = new Diagnostic(
				new Range(0, 0, 0, 10),
				'This is an error',
				DiagnosticSeverity.Error
			);
			errorDiagnostic.source = 'typescript';
			
			collection.set(testUri, [errorDiagnostic]);
			
			// Verify diagnostic was set
			const diagnostics = languages.getDiagnostics(testUri);
			assert.strictEqual(diagnostics.length, 1, 'Expected 1 diagnostic');
			assert.strictEqual(diagnostics[0].severity, DiagnosticSeverity.Error, 'Expected error severity');
			
			// TODO: Test that evaluateDiagnosticsCommitHook returns false (shows dialog)
		} finally {
			collection.dispose();
		}
	});

	test('should show dialog for warning diagnostics when configured', async () => {
		// This test verifies that warning diagnostics trigger dialog when configured to do so
		const testUri = Uri.file('/test/file.ts');
		
		// Create test diagnostics collection
		const collection = languages.createDiagnosticCollection('test');
		
		try {
			// Add a warning diagnostic
			const warningDiagnostic = new Diagnostic(
				new Range(0, 0, 0, 10),
				'This is a warning',
				DiagnosticSeverity.Warning
			);
			warningDiagnostic.source = 'typescript';
			
			collection.set(testUri, [warningDiagnostic]);
			
			// Verify diagnostic was set
			const diagnostics = languages.getDiagnostics(testUri);
			assert.strictEqual(diagnostics.length, 1, 'Expected 1 diagnostic');
			assert.strictEqual(diagnostics[0].severity, DiagnosticSeverity.Warning, 'Expected warning severity');
			
			// TODO: Test with different configurations (error-only vs warning-inclusive)
		} finally {
			collection.dispose();
		}
	});

	test('should handle diagnostics without source correctly', async () => {
		// This test verifies that diagnostics without source are handled properly
		const testUri = Uri.file('/test/file.ts');
		
		// Create test diagnostics collection
		const collection = languages.createDiagnosticCollection('test');
		
		try {
			// Add diagnostic without source
			const diagnostic = new Diagnostic(
				new Range(0, 0, 0, 10),
				'This diagnostic has no source',
				DiagnosticSeverity.Error
			);
			// Explicitly not setting source
			
			collection.set(testUri, [diagnostic]);
			
			// Verify diagnostic was set
			const diagnostics = languages.getDiagnostics(testUri);
			assert.strictEqual(diagnostics.length, 1, 'Expected 1 diagnostic');
			assert.strictEqual(diagnostics[0].source, undefined, 'Expected no source');
			
			// TODO: Test that this diagnostic is ignored due to missing source
		} finally {
			collection.dispose();
		}
	});
});