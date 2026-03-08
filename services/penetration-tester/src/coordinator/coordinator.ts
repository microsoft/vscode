/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'node:crypto';
import { FalkorDbClient } from '../clients/falkordbClient';
import {
	AttackSurface,
	Endpoint,
	OwaspCategory,
	PenTestConfig,
	PlannedTest,
	TestPlan,
	TestType,
} from '../types';

/**
 * The Coordinator analyses the application and generates a prioritised test plan.
 *
 * It queries the code graph for the attack surface (endpoints, auth, DB queries,
 * user input handling), maps findings to OWASP Top 10 categories, and dispatches
 * a ranked list of tests for the sandbox agents to execute.
 */
export class Coordinator {
	private readonly config: PenTestConfig;
	private readonly falkorDb: FalkorDbClient;

	constructor(config: PenTestConfig, falkorDb: FalkorDbClient) {
		this.config = config;
		this.falkorDb = falkorDb;
	}

	/**
	 * Analyse the application and generate a prioritised test plan.
	 */
	async createTestPlan(targetUrl: string): Promise<TestPlan> {
		const attackSurface = await this.falkorDb.getAttackSurface();
		const prioritizedCategories = this.prioritiseCategories(attackSurface);
		const tests = this.generateTests(attackSurface, prioritizedCategories);

		return {
			id: randomUUID(),
			targetUrl,
			attackSurface,
			prioritizedCategories,
			tests: this.sortByPriority(tests),
			createdAt: Date.now(),
		};
	}

	/**
	 * Create a focused test plan for a specific endpoint.
	 */
	async createFocusedPlan(targetUrl: string, endpointPath: string): Promise<TestPlan> {
		const attackSurface = await this.falkorDb.getAttackSurface();
		const matchingEndpoints = attackSurface.endpoints.filter(
			e => e.path === endpointPath || e.path.includes(endpointPath),
		);

		const focusedSurface: AttackSurface = {
			...attackSurface,
			endpoints: matchingEndpoints.length > 0 ? matchingEndpoints : [{
				method: 'GET',
				path: endpointPath,
				parameters: [],
				authentication: false,
				dataFlows: [],
			}],
		};

		const prioritizedCategories = this.prioritiseCategories(focusedSurface);
		const tests = this.generateTests(focusedSurface, prioritizedCategories);

		return {
			id: randomUUID(),
			targetUrl,
			attackSurface: focusedSurface,
			prioritizedCategories,
			tests: this.sortByPriority(tests),
			createdAt: Date.now(),
		};
	}

	/**
	 * Create a test plan focused on a specific OWASP category.
	 */
	async createCategoryPlan(targetUrl: string, category: OwaspCategory): Promise<TestPlan> {
		const attackSurface = await this.falkorDb.getAttackSurface();
		const testTypes = this.categoryToTestTypes(category);
		const tests: PlannedTest[] = [];

		for (const endpoint of attackSurface.endpoints) {
			for (const testType of testTypes) {
				tests.push(this.createPlannedTest(testType, category, endpoint, 1));
			}
		}

		return {
			id: randomUUID(),
			targetUrl,
			attackSurface,
			prioritizedCategories: [category],
			tests: this.sortByPriority(tests),
			createdAt: Date.now(),
		};
	}

	/**
	 * Prioritise OWASP categories based on the code analysis.
	 * Categories are ranked by how likely they are to have real vulnerabilities.
	 */
	private prioritiseCategories(surface: AttackSurface): OwaspCategory[] {
		const scores = new Map<OwaspCategory, number>();

		// A03 Injection — high priority if there are unparameterised queries
		const unparameterizedQueries = surface.databaseQueries.filter(q => !q.parameterized);
		scores.set('A03-injection', unparameterizedQueries.length * 3 + surface.userInputHandlers.length);

		// A01 Broken Access Control — high if many authenticated endpoints
		const authEndpoints = surface.endpoints.filter(e => e.authentication);
		const unauthEndpoints = surface.endpoints.filter(e => !e.authentication);
		scores.set('A01-broken-access-control', authEndpoints.length * 2 + unauthEndpoints.length);

		// A07 Auth Failures — if auth mechanisms exist
		scores.set('A07-auth-failures', surface.authMechanisms.length * 2);

		// A02 Cryptographic Failures — if JWT or session-based auth detected
		const cryptoRelevant = surface.authMechanisms.some(
			m => m.includes('jwt') || m.includes('crypto') || m.includes('hash'),
		);
		scores.set('A02-cryptographic-failures', cryptoRelevant ? 5 : 1);

		// A05 Security Misconfiguration — always relevant
		scores.set('A05-security-misconfiguration', 3);

		// A06 Vulnerable Components — always relevant
		scores.set('A06-vulnerable-components', 2);

		// A10 SSRF — if external API calls exist
		scores.set('A10-ssrf', surface.externalApiCalls.length * 2);

		// A04 Insecure Design — baseline
		scores.set('A04-insecure-design', 1);

		// A08 Software Integrity — if file uploads exist
		scores.set('A08-software-integrity-failures', surface.fileUploadHandlers.length * 2);

		// A09 Logging Failures — lowest priority
		scores.set('A09-logging-failures', 1);

		return Array.from(scores.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([category]) => category);
	}

	/**
	 * Generate concrete tests based on attack surface and prioritised categories.
	 */
	private generateTests(surface: AttackSurface, categories: OwaspCategory[]): PlannedTest[] {
		const tests: PlannedTest[] = [];

		for (let priority = 0; priority < categories.length; priority++) {
			const category = categories[priority];
			const testTypes = this.categoryToTestTypes(category);

			for (const endpoint of surface.endpoints) {
				for (const testType of testTypes) {
					if (this.isApplicable(testType, endpoint, surface)) {
						tests.push(this.createPlannedTest(testType, category, endpoint, priority + 1));
					}
				}
			}
		}

		return tests;
	}

	/**
	 * Map an OWASP category to concrete test types.
	 */
	private categoryToTestTypes(category: OwaspCategory): TestType[] {
		const mapping: Record<OwaspCategory, TestType[]> = {
			'A01-broken-access-control': ['idor', 'privilege-escalation', 'missing-auth'],
			'A02-cryptographic-failures': ['session-management'],
			'A03-injection': ['sql-injection', 'nosql-injection', 'command-injection', 'template-injection', 'xss-reflected', 'xss-stored'],
			'A04-insecure-design': ['idor', 'missing-auth'],
			'A05-security-misconfiguration': ['zap-baseline'],
			'A06-vulnerable-components': ['zap-baseline'],
			'A07-auth-failures': ['brute-force', 'session-management', 'password-reset'],
			'A08-software-integrity-failures': ['zap-baseline'],
			'A09-logging-failures': ['zap-baseline'],
			'A10-ssrf': ['command-injection'],
		};

		return mapping[category] ?? ['zap-baseline'];
	}

	/**
	 * Check whether a test type is applicable to a given endpoint.
	 */
	private isApplicable(testType: TestType, endpoint: Endpoint, surface: AttackSurface): boolean {
		switch (testType) {
			case 'sql-injection':
			case 'nosql-injection':
				return endpoint.parameters.length > 0 || surface.databaseQueries.length > 0;
			case 'command-injection':
				return endpoint.parameters.length > 0;
			case 'template-injection':
				return surface.technologyStack.templateEngine !== 'none';
			case 'xss-reflected':
				return endpoint.parameters.length > 0;
			case 'xss-stored':
				return endpoint.method === 'POST' || endpoint.method === 'PUT';
			case 'brute-force':
				return endpoint.path.includes('login') || endpoint.path.includes('auth');
			case 'session-management':
				return endpoint.authentication;
			case 'password-reset':
				return endpoint.path.includes('password') || endpoint.path.includes('reset');
			case 'idor':
				return endpoint.parameters.some(p => p.location === 'path');
			case 'privilege-escalation':
				return endpoint.authentication;
			case 'missing-auth':
				return !endpoint.authentication;
			case 'zap-baseline':
			case 'zap-active':
			case 'zap-api':
				return true;
			default:
				return true;
		}
	}

	private createPlannedTest(
		type: TestType,
		owaspCategory: OwaspCategory,
		endpoint: Endpoint,
		priority: number,
	): PlannedTest {
		return {
			id: randomUUID(),
			type,
			owaspCategory,
			targetEndpoint: endpoint,
			parameters: {},
			priority,
		};
	}

	private sortByPriority(tests: PlannedTest[]): PlannedTest[] {
		return tests.sort((a, b) => a.priority - b.priority);
	}
}
