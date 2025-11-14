/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Database } from '@vscode/sqlite3';
import { Fibonacci } from '../common/fibonacci.js';

interface IFibonacciRecord {
	position: number;
	value: string;
	timestamp: number;
}

/**
 * Fibonacci calculator with SQLite database storage
 */
export class FibonacciDatabase {

	private readonly fibonacci: Fibonacci;
	private db: Database | undefined;
	private whenConnected: Promise<Database> | undefined;

	constructor(private readonly dbPath: string) {
		this.fibonacci = new Fibonacci();
	}

	/**
	 * Initialize the database connection and create tables
	 */
	async initialize(): Promise<void> {
		if (this.whenConnected) {
			return this.whenConnected.then(() => { });
		}

		this.whenConnected = this.connect();
		await this.whenConnected;
	}

	private async connect(): Promise<Database> {
		return new Promise<Database>((resolve, reject) => {
			import('@vscode/sqlite3').then(sqlite3 => {
				const db = new sqlite3.default.Database(this.dbPath, (error) => {
					if (error) {
						return reject(error);
					}

					// Create table if it doesn't exist
					db.run(`
						CREATE TABLE IF NOT EXISTS fibonacci (
							position INTEGER PRIMARY KEY,
							value TEXT NOT NULL,
							timestamp INTEGER NOT NULL
						)
					`, (err) => {
						if (err) {
							return reject(err);
						}

						this.db = db;
						resolve(db);
					});
				});
			}).catch(reject);
		});
	}

	/**
	 * Calculate and store a Fibonacci number
	 * @param n The position in the Fibonacci sequence
	 * @returns The Fibonacci number at position n
	 */
	async calculate(n: number): Promise<bigint> {
		await this.initialize();

		// Check if already in database
		const existing = await this.get(n);
		if (existing !== undefined) {
			return existing;
		}

		// Calculate and store
		const value = this.fibonacci.calculate(n);
		await this.store(n, value);

		return value;
	}

	/**
	 * Calculate and store multiple Fibonacci numbers
	 * @param n The maximum position in the Fibonacci sequence
	 * @returns Array of Fibonacci numbers from 0 to n
	 */
	async calculateRange(n: number): Promise<bigint[]> {
		await this.initialize();

		const result: bigint[] = [];

		for (let i = 0; i <= n; i++) {
			const value = await this.calculate(i);
			result.push(value);
		}

		return result;
	}

	/**
	 * Store a Fibonacci number in the database
	 */
	private async store(position: number, value: bigint): Promise<void> {
		if (!this.db) {
			throw new Error('Database not initialized');
		}

		return new Promise<void>((resolve, reject) => {
			const stmt = this.db!.prepare('INSERT OR REPLACE INTO fibonacci (position, value, timestamp) VALUES (?, ?, ?)');
			stmt.run(position, value.toString(), Date.now(), (err: Error | null) => {
				if (err) {
					return reject(err);
				}
				stmt.finalize();
				resolve();
			});
		});
	}

	/**
	 * Get a Fibonacci number from the database
	 */
	private async get(position: number): Promise<bigint | undefined> {
		if (!this.db) {
			throw new Error('Database not initialized');
		}

		return new Promise<bigint | undefined>((resolve, reject) => {
			this.db!.get('SELECT value FROM fibonacci WHERE position = ?', [position], (err, row: IFibonacciRecord | undefined) => {
				if (err) {
					return reject(err);
				}

				if (row) {
					resolve(BigInt(row.value));
				} else {
					resolve(undefined);
				}
			});
		});
	}

	/**
	 * Get all stored Fibonacci numbers
	 */
	async getAll(): Promise<Map<number, bigint>> {
		await this.initialize();

		if (!this.db) {
			throw new Error('Database not initialized');
		}

		return new Promise<Map<number, bigint>>((resolve, reject) => {
			this.db!.all('SELECT position, value FROM fibonacci ORDER BY position', (err: Error | null, rows: IFibonacciRecord[]) => {
				if (err) {
					return reject(err);
				}

				const result = new Map<number, bigint>();
				rows.forEach(row => {
					result.set(row.position, BigInt(row.value));
				});

				resolve(result);
			});
		});
	}

	/**
	 * Close the database connection
	 */
	async close(): Promise<void> {
		if (this.db) {
			return new Promise<void>((resolve, reject) => {
				this.db!.close((err) => {
					if (err) {
						return reject(err);
					}
					this.db = undefined;
					resolve();
				});
			});
		}
	}
}
