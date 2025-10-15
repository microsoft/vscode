/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BugB-Tech. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Database Migration System for Specter
 * 
 * Handles database schema versioning and updates
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Migration {
	version: number;
	name: string;
	up: string[];  // SQL statements to apply migration
	down: string[];  // SQL statements to rollback migration
}

export class DatabaseMigrations {
	
	private static readonly MIGRATIONS: Migration[] = [
		{
			version: 1,
			name: 'initial_schema',
			up: [
				// Read from schema.sql file
				// This will be populated when we read the schema file
			],
			down: [
				'DROP TABLE IF EXISTS audit_log;',
				'DROP TABLE IF EXISTS executions;',
				'DROP TABLE IF EXISTS workflow_steps;',
				'DROP TABLE IF EXISTS workflows;',
				'DROP TABLE IF EXISTS messages;',
				'DROP TABLE IF EXISTS conversations;',
				'DROP TABLE IF EXISTS config;',
				'DROP VIEW IF EXISTS v_conversations_with_counts;',
				'DROP VIEW IF EXISTS v_workflows_with_execution;'
			]
		}
	];

	/**
	 * Get all available migrations
	 */
	public static getMigrations(): Migration[] {
		return this.MIGRATIONS;
	}

	/**
	 * Get migrations that need to be applied
	 * @param currentVersion Current database version
	 * @returns Array of migrations to apply
	 */
	public static getPendingMigrations(currentVersion: number): Migration[] {
		return this.MIGRATIONS.filter(m => m.version > currentVersion);
	}

	/**
	 * Get the latest migration version
	 */
	public static getLatestVersion(): number {
		if (this.MIGRATIONS.length === 0) {
			return 0;
		}
		return Math.max(...this.MIGRATIONS.map(m => m.version));
	}

	/**
	 * Read the initial schema from schema.sql file
	 * This is used to populate the initial migration
	 */
	public static getInitialSchema(): string[] {
		try {
			const schemaPath = path.join(__dirname, 'schema.sql');
			const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
			
			// Split by semicolons and filter out empty statements
			const statements = schemaContent
				.split(';')
				.map(s => s.trim())
				.filter(s => s.length > 0 && !s.startsWith('--'))
				.map(s => s + ';');
			
			return statements;
		} catch (error) {
			console.error('Failed to read schema.sql:', error);
			return [];
		}
	}

	/**
	 * Create the schema_version table to track migrations
	 */
	public static getVersionTableSQL(): string {
		return `
			CREATE TABLE IF NOT EXISTS schema_version (
				id INTEGER PRIMARY KEY CHECK (id = 1),
				version INTEGER NOT NULL DEFAULT 0,
				updated_at TEXT DEFAULT (datetime('now'))
			);
			
			INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0);
		`;
	}

	/**
	 * Get SQL to update schema version
	 */
	public static getUpdateVersionSQL(version: number): string {
		return `UPDATE schema_version SET version = ${version}, updated_at = datetime('now') WHERE id = 1;`;
	}

	/**
	 * Get SQL to get current schema version
	 */
	public static getCurrentVersionSQL(): string {
		return 'SELECT version FROM schema_version WHERE id = 1;';
	}
}

/**
 * Example usage:
 * 
 * const migrations = DatabaseMigrations.getMigrations();
 * const currentVersion = await db.get(DatabaseMigrations.getCurrentVersionSQL());
 * const pending = DatabaseMigrations.getPendingMigrations(currentVersion);
 * 
 * for (const migration of pending) {
 *     console.log(`Applying migration ${migration.version}: ${migration.name}`);
 *     for (const sql of migration.up) {
 *         await db.execute(sql);
 *     }
 *     await db.execute(DatabaseMigrations.getUpdateVersionSQL(migration.version));
 * }
 */
