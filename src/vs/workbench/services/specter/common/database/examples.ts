/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BugB-Tech. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Database Service Usage Examples
 * 
 * This file demonstrates how to use the DatabaseService
 */

import { DatabaseService } from './databaseService.js';
import { ConfigRow, ConversationRow, MessageRow } from './types.js';

/**
 * Example 1: Initialize and test basic operations
 */
export async function example1_BasicOperations(dbService: DatabaseService): Promise<void> {
	console.log('=== Example 1: Basic Operations ===');

	// Initialize database
	await dbService.initialize();

	// Get current version
	const version = await dbService.getCurrentVersion();
	console.log('Schema version:', version);

	// Insert a config value
	await dbService.execute(
		'INSERT INTO config (key, value, encrypted) VALUES (?, ?, ?)',
		['test_key', 'test_value', 0]
	);

	// Query config
	const config = await dbService.query<ConfigRow>('SELECT * FROM config WHERE key = ?', ['test_key']);
	console.log('Config:', config);

	// Update config
	await dbService.execute(
		'UPDATE config SET value = ? WHERE key = ?',
		['updated_value', 'test_key']
	);

	// Get single row
	const updatedConfig = await dbService.get<ConfigRow>('SELECT * FROM config WHERE key = ?', ['test_key']);
	console.log('Updated config:', updatedConfig);

	// Delete config
	await dbService.execute('DELETE FROM config WHERE key = ?', ['test_key']);

	console.log('✅ Example 1 completed\n');
}

/**
 * Example 2: Transaction usage
 */
export async function example2_Transactions(dbService: DatabaseService): Promise<void> {
	console.log('=== Example 2: Transactions ===');

	// Create a conversation with messages in a transaction
	await dbService.transaction([
		{
			sql: 'INSERT INTO conversations (title) VALUES (?)',
			params: ['Test Conversation']
		},
		{
			sql: 'INSERT INTO messages (conversation_id, role, content) VALUES (last_insert_rowid(), ?, ?)',
			params: ['user', 'Hello, can you help me scan a server?']
		},
		{
			sql: 'INSERT INTO messages (conversation_id, role, content) VALUES (last_insert_rowid(), ?, ?)',
			params: ['assistant', 'Sure! What is the IP address?']
		}
	]);

	console.log('✅ Example 2 completed\n');
}

/**
 * Example 3: Query conversations with counts using view
 */
export async function example3_ViewQueries(dbService: DatabaseService): Promise<void> {
	console.log('=== Example 3: View Queries ===');

	// Query using the v_conversations_with_counts view
	const conversations = await dbService.query(
		'SELECT * FROM v_conversations_with_counts ORDER BY updated_at DESC LIMIT 5'
	);

	console.log('Recent conversations:', conversations);
	console.log('✅ Example 3 completed\n');
}

/**
 * Example 4: Working with workflows
 */
export async function example4_Workflows(dbService: DatabaseService): Promise<void> {
	console.log('=== Example 4: Workflows ===');

	// Create a workflow
	const workflowPlan = JSON.stringify({
		name: 'Redis Vulnerability Check',
		description: 'Check if Redis is vulnerable on target',
		steps: [
			{ step_number: 1, tool_id: 'nmap', action: 'scan_port_6379' },
			{ step_number: 2, tool_id: 'certxgen', action: 'redis_vuln_test' }
		]
	});

	await dbService.execute(
		`INSERT INTO workflows (conversation_id, name, description, workflow_plan, status)
		 VALUES (?, ?, ?, ?, ?)`,
		[1, 'Redis Vuln Check', 'Test Redis vulnerability', workflowPlan, 'draft']
	);

	// Query workflows
	const workflows = await dbService.query('SELECT * FROM workflows');
	console.log('Workflows:', workflows);

	console.log('✅ Example 4 completed\n');
}

/**
 * Example 5: Audit logging
 */
export async function example5_AuditLog(dbService: DatabaseService): Promise<void> {
	console.log('=== Example 5: Audit Logging ===');

	// Log an event
	await dbService.execute(
		`INSERT INTO audit_log (event_type, entity_type, entity_id, user_action, details)
		 VALUES (?, ?, ?, ?, ?)`,
		[
			'workflow_created',
			'workflow',
			1,
			'User created new workflow',
			JSON.stringify({ workflow_name: 'Redis Vuln Check', tool_count: 2 })
		]
	);

	// Query audit logs
	const logs = await dbService.query(
		'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 10'
	);

	console.log('Recent audit logs:', logs);
	console.log('✅ Example 5 completed\n');
}

/**
 * Example 6: Get API key from config (simulating encrypted storage)
 */
export async function example6_ApiKeyManagement(dbService: DatabaseService): Promise<void> {
	console.log('=== Example 6: API Key Management ===');

	// Set API key (in real implementation, this would be encrypted)
	await dbService.execute(
		'UPDATE config SET value = ? WHERE key = ?',
		['sk-test-1234567890', 'deepseek_api_key']
	);

	// Retrieve API key
	const apiKey = await dbService.get<ConfigRow>(
		'SELECT * FROM config WHERE key = ?',
		['deepseek_api_key']
	);

	console.log('API key retrieved:', apiKey);
	console.log('Is encrypted:', apiKey?.encrypted === 1);

	console.log('✅ Example 6 completed\n');
}

/**
 * Run all examples
 */
export async function runAllExamples(dbService: DatabaseService): Promise<void> {
	try {
		await example1_BasicOperations(dbService);
		await example2_Transactions(dbService);
		await example3_ViewQueries(dbService);
		await example4_Workflows(dbService);
		await example5_AuditLog(dbService);
		await example6_ApiKeyManagement(dbService);

		console.log('🎉 All examples completed successfully!');
	} catch (error) {
		console.error('❌ Example failed:', error);
		throw error;
	}
}

/**
 * Example usage in a service:
 * 
 * constructor(
 *     @ISpecterDatabaseService private readonly databaseService: IDatabaseService
 * ) {
 *     // Initialize on startup
 *     this.databaseService.initialize().then(() => {
 *         console.log('Database ready!');
 *     });
 * }
 */
