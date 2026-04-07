/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { DEFAULT_OPTIONS, PromptOptions, RecentFileClippingStrategy } from '../../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { buildCodeSnippetsUsingPagedClipping } from '../../common/recentFilesForPrompt';

// --- Helpers ---

function computeTokens(s: string) {
	return Math.ceil(s.length / 4);
}

type FileEntry = {
	id: DocumentId;
	content: StringText;
	focalRanges?: readonly OffsetRange[];
	editEntryCount?: number;
};

function buildSnippets(
	files: FileEntry[],
	opts: PromptOptions,
): { snippets: string[]; docsInPrompt: Set<DocumentId> } {
	return buildCodeSnippetsUsingPagedClipping(files, computeTokens, opts);
}

function makeOpts(overrides: {
	maxTokens: number;
	pageSize: number;
	clippingStrategy: RecentFileClippingStrategy;
}): PromptOptions {
	return {
		...DEFAULT_OPTIONS,
		recentlyViewedDocuments: {
			...DEFAULT_OPTIONS.recentlyViewedDocuments,
			maxTokens: overrides.maxTokens,
			clippingStrategy: overrides.clippingStrategy,
		},
		pagedClipping: {
			pageSize: overrides.pageSize,
		},
	};
}

/** Compute byte offset of line `lineIdx` (0-based) in a StringText. */
function lineOffset(content: StringText, lineIdx: number): number {
	const lines = content.getLines();
	let offset = 0;
	for (let i = 0; i < lineIdx; i++) {
		offset += lines[i].length + 1;
	}
	return offset;
}

function lineRange(content: StringText, lineIdx: number): OffsetRange {
	const start = lineOffset(content, lineIdx);
	return new OffsetRange(start, start + content.getLines()[lineIdx].length);
}

// --- Realistic file content ---

// A TypeScript service class (37 lines, ~273 tokens total across 4 pages of 10)
const tsServiceFile = new StringText([
	`import { Injectable } from '@angular/core';`,
	`import { HttpClient } from '@angular/common/http';`,
	`import { Observable } from 'rxjs';`,
	``,
	`export interface User {`,
	`  id: number;`,
	`  name: string;`,
	`  email: string;`,
	`  role: 'admin' | 'user';`,
	`}`,
	``,
	`@Injectable({ providedIn: 'root' })`,
	`export class UserService {`,
	`  private readonly apiUrl = '/api/users';`,
	``,
	`  constructor(private http: HttpClient) {}`,
	``,
	`  getUsers(): Observable<User[]> {`,
	`    return this.http.get<User[]>(this.apiUrl);`,
	`  }`,
	``,
	`  getUserById(id: number): Observable<User> {`,
	`    return this.http.get<User>(\`\${this.apiUrl}/\${id}\`);`,
	`  }`,
	``,
	`  createUser(user: Omit<User, 'id'>): Observable<User> {`,
	`    return this.http.post<User>(this.apiUrl, user);`,
	`  }`,
	``,
	`  updateUser(id: number, user: Partial<User>): Observable<User> {`,
	`    return this.http.put<User>(\`\${this.apiUrl}/\${id}\`, user);`,
	`  }`,
	``,
	`  deleteUser(id: number): Observable<void> {`,
	`    return this.http.delete<void>(\`\${this.apiUrl}/\${id}\`);`,
	`  }`,
	`}`,
].join('\n'));

// A React component (38 lines)
const reactComponentFile = new StringText([
	`import React, { useState, useEffect } from 'react';`,
	`import { UserService } from './userService';`,
	`import { User } from './types';`,
	``,
	`interface Props {`,
	`  userId: number;`,
	`  onUpdate: (user: User) => void;`,
	`}`,
	``,
	`export function UserProfile({ userId, onUpdate }: Props) {`,
	`  const [user, setUser] = useState<User | null>(null);`,
	`  const [loading, setLoading] = useState(true);`,
	`  const [error, setError] = useState<string | null>(null);`,
	``,
	`  useEffect(() => {`,
	`    setLoading(true);`,
	`    UserService.getById(userId)`,
	`      .then(data => {`,
	`        setUser(data);`,
	`        setLoading(false);`,
	`      })`,
	`      .catch(err => {`,
	`        setError(err.message);`,
	`        setLoading(false);`,
	`      });`,
	`  }, [userId]);`,
	``,
	`  if (loading) return <div className="spinner" />;`,
	`  if (error) return <div className="error">{error}</div>;`,
	`  if (!user) return null;`,
	``,
	`  return (`,
	`    <div className="user-profile">`,
	`      <h2>{user.name}</h2>`,
	`      <p>{user.email}</p>`,
	`      <span className="role-badge">{user.role}</span>`,
	`      <button onClick={() => onUpdate(user)}>Edit</button>`,
	`    </div>`,
	`  );`,
	`}`,
].join('\n'));

// A tsconfig.json (18 lines, ~58 tokens per page)
const configFile = new StringText([
	`{`,
	`  "compilerOptions": {`,
	`    "target": "ES2020",`,
	`    "module": "commonjs",`,
	`    "lib": ["ES2020"],`,
	`    "strict": true,`,
	`    "esModuleInterop": true,`,
	`    "skipLibCheck": true,`,
	`    "forceConsistentCasingInFileNames": true,`,
	`    "outDir": "./dist",`,
	`    "rootDir": "./src",`,
	`    "declaration": true,`,
	`    "declarationMap": true,`,
	`    "sourceMap": true`,
	`  },`,
	`  "include": ["src/**/*"],`,
	`  "exclude": ["node_modules", "dist", "**/*.spec.ts"]`,
	`}`,
].join('\n'));

const serviceId = DocumentId.create('file:///src/services/userService.ts');
const componentId = DocumentId.create('file:///src/components/UserProfile.tsx');
const configId = DocumentId.create('file:///tsconfig.json');

// --- Snapshot tests ---

suite('Clipping strategy snapshots', () => {

	suite('TopToBottom — clips from start of file, greedy budget', () => {

		test('single file: takes content from top until budget exhausted', () => {
			const { snippets } = buildSnippets(
				[{ id: serviceId, content: tsServiceFile }],
				makeOpts({ maxTokens: 100, pageSize: 10, clippingStrategy: RecentFileClippingStrategy.TopToBottom }),
			);

			expect(snippets).toMatchInlineSnapshot(`
				[
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /src/services/userService.ts (truncated)
				import { Injectable } from '@angular/core';
				import { HttpClient } from '@angular/common/http';
				import { Observable } from 'rxjs';

				export interface User {
				  id: number;
				  name: string;
				  email: string;
				  role: 'admin' | 'user';
				}
				<|/recently_viewed_code_snippet|>",
				]
			`);
		});

		test('two files: most recent gets budget first, second gets remainder', () => {
			const { snippets } = buildSnippets(
				[
					{ id: componentId, content: reactComponentFile },
					{ id: serviceId, content: tsServiceFile },
				],
				makeOpts({ maxTokens: 200, pageSize: 10, clippingStrategy: RecentFileClippingStrategy.TopToBottom }),
			);

			expect(snippets).toMatchInlineSnapshot(`
				[
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /src/components/UserProfile.tsx (truncated)
				import React, { useState, useEffect } from 'react';
				import { UserService } from './userService';
				import { User } from './types';

				interface Props {
				  userId: number;
				  onUpdate: (user: User) => void;
				}

				export function UserProfile({ userId, onUpdate }: Props) {
				  const [user, setUser] = useState<User | null>(null);
				  const [loading, setLoading] = useState(true);
				  const [error, setError] = useState<string | null>(null);

				  useEffect(() => {
				    setLoading(true);
				    UserService.getById(userId)
				      .then(data => {
				        setUser(data);
				        setLoading(false);
				<|/recently_viewed_code_snippet|>",
				]
			`);
		});

		test('three files: budget exhausted after two, third dropped', () => {
			const { snippets, docsInPrompt } = buildSnippets(
				[
					{ id: componentId, content: reactComponentFile },
					{ id: serviceId, content: tsServiceFile },
					{ id: configId, content: configFile },
				],
				makeOpts({ maxTokens: 160, pageSize: 10, clippingStrategy: RecentFileClippingStrategy.TopToBottom }),
			);

			expect(docsInPrompt.has(configId)).toBe(false);
			expect(snippets).toMatchInlineSnapshot(`
				[
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /src/services/userService.ts (truncated)
				import { Injectable } from '@angular/core';
				import { HttpClient } from '@angular/common/http';
				import { Observable } from 'rxjs';

				export interface User {
				  id: number;
				  name: string;
				  email: string;
				  role: 'admin' | 'user';
				}
				<|/recently_viewed_code_snippet|>",
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /src/components/UserProfile.tsx (truncated)
				import React, { useState, useEffect } from 'react';
				import { UserService } from './userService';
				import { User } from './types';

				interface Props {
				  userId: number;
				  onUpdate: (user: User) => void;
				}

				export function UserProfile({ userId, onUpdate }: Props) {
				<|/recently_viewed_code_snippet|>",
				]
			`);
		});
	});

	suite('AroundEditRange — clips centered on edit locations, greedy budget', () => {

		test('single file: centers clip on edit near the bottom of the file', () => {
			// Edit to the `deleteUser` method (line 34)
			const { snippets } = buildSnippets(
				[{ id: serviceId, content: tsServiceFile, focalRanges: [lineRange(tsServiceFile, 34)] }],
				makeOpts({ maxTokens: 100, pageSize: 10, clippingStrategy: RecentFileClippingStrategy.AroundEditRange }),
			);

			expect(snippets).toMatchInlineSnapshot(`
				[
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /src/services/userService.ts (truncated)
				    return this.http.put<User>(\`\${this.apiUrl}/\${id}\`, user);
				  }

				  deleteUser(id: number): Observable<void> {
				    return this.http.delete<void>(\`\${this.apiUrl}/\${id}\`);
				  }
				}
				<|/recently_viewed_code_snippet|>",
				]
			`);
		});

		test('two files: each clipped around its own edit location', () => {
			const { snippets } = buildSnippets(
				[
					// Edit on component: the return JSX (line 32)
					{ id: componentId, content: reactComponentFile, focalRanges: [lineRange(reactComponentFile, 32)] },
					// Edit on service: updateUser method (line 30)
					{ id: serviceId, content: tsServiceFile, focalRanges: [lineRange(tsServiceFile, 30)] },
				],
				makeOpts({ maxTokens: 300, pageSize: 10, clippingStrategy: RecentFileClippingStrategy.AroundEditRange }),
			);

			expect(snippets).toMatchInlineSnapshot(`
				[
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /src/services/userService.ts (truncated)
				    return this.http.put<User>(\`\${this.apiUrl}/\${id}\`, user);
				  }

				  deleteUser(id: number): Observable<void> {
				    return this.http.delete<void>(\`\${this.apiUrl}/\${id}\`);
				  }
				}
				<|/recently_viewed_code_snippet|>",
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /src/components/UserProfile.tsx (truncated)
				      })
				      .catch(err => {
				        setError(err.message);
				        setLoading(false);
				      });
				  }, [userId]);

				  if (loading) return <div className="spinner" />;
				  if (error) return <div className="error">{error}</div>;
				  if (!user) return null;

				  return (
				    <div className="user-profile">
				      <h2>{user.name}</h2>
				      <p>{user.email}</p>
				      <span className="role-badge">{user.role}</span>
				      <button onClick={() => onUpdate(user)}>Edit</button>
				    </div>
				  );
				}
				<|/recently_viewed_code_snippet|>",
				]
			`);
		});

		test('file without focal ranges falls back to top-to-bottom', () => {
			const { snippets } = buildSnippets(
				[{ id: configId, content: configFile }],
				makeOpts({ maxTokens: 100, pageSize: 10, clippingStrategy: RecentFileClippingStrategy.AroundEditRange }),
			);

			expect(snippets).toMatchInlineSnapshot(`
				[
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /tsconfig.json (truncated)
				{
				  "compilerOptions": {
				    "target": "ES2020",
				    "module": "commonjs",
				    "lib": ["ES2020"],
				    "strict": true,
				    "esModuleInterop": true,
				    "skipLibCheck": true,
				    "forceConsistentCasingInFileNames": true,
				    "outDir": "./dist",
				<|/recently_viewed_code_snippet|>",
				]
			`);
		});
	});

	suite('Proportional — two-pass budget, centered on edit locations', () => {

		test('two files with equal edits: budget split evenly', () => {
			const { snippets } = buildSnippets(
				[
					// Edit on component: the useEffect block (line 14)
					{ id: componentId, content: reactComponentFile, focalRanges: [lineRange(reactComponentFile, 14)], editEntryCount: 1 },
					// Edit on service: createUser method (line 26)
					{ id: serviceId, content: tsServiceFile, focalRanges: [lineRange(tsServiceFile, 26)], editEntryCount: 1 },
				],
				makeOpts({ maxTokens: 250, pageSize: 10, clippingStrategy: RecentFileClippingStrategy.Proportional }),
			);

			expect(snippets).toMatchInlineSnapshot(`
				[
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /src/services/userService.ts (truncated)

				  getUserById(id: number): Observable<User> {
				    return this.http.get<User>(\`\${this.apiUrl}/\${id}\`);
				  }

				  createUser(user: Omit<User, 'id'>): Observable<User> {
				    return this.http.post<User>(this.apiUrl, user);
				  }

				  updateUser(id: number, user: Partial<User>): Observable<User> {
				<|/recently_viewed_code_snippet|>",
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /src/components/UserProfile.tsx (truncated)
				  const [user, setUser] = useState<User | null>(null);
				  const [loading, setLoading] = useState(true);
				  const [error, setError] = useState<string | null>(null);

				  useEffect(() => {
				    setLoading(true);
				    UserService.getById(userId)
				      .then(data => {
				        setUser(data);
				        setLoading(false);
				<|/recently_viewed_code_snippet|>",
				]
			`);
		});

		test('file with more edits gets more expansion budget', () => {
			const { snippets } = buildSnippets(
				[
					// Service file: 3 edits (higher weight), edit on getUsers (line 18)
					{ id: serviceId, content: tsServiceFile, focalRanges: [lineRange(tsServiceFile, 18)], editEntryCount: 3 },
					// Config file: 1 edit, edit on "strict" (line 5)
					{ id: configId, content: configFile, focalRanges: [lineRange(configFile, 5)], editEntryCount: 1 },
				],
				makeOpts({ maxTokens: 250, pageSize: 10, clippingStrategy: RecentFileClippingStrategy.Proportional }),
			);

			expect(snippets).toMatchInlineSnapshot(`
				[
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /tsconfig.json (truncated)
				{
				  "compilerOptions": {
				    "target": "ES2020",
				    "module": "commonjs",
				    "lib": ["ES2020"],
				    "strict": true,
				    "esModuleInterop": true,
				    "skipLibCheck": true,
				    "forceConsistentCasingInFileNames": true,
				    "outDir": "./dist",
				<|/recently_viewed_code_snippet|>",
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /src/services/userService.ts (truncated)

				@Injectable({ providedIn: 'root' })
				export class UserService {
				  private readonly apiUrl = '/api/users';

				  constructor(private http: HttpClient) {}

				  getUsers(): Observable<User[]> {
				    return this.http.get<User[]>(this.apiUrl);
				  }
				<|/recently_viewed_code_snippet|>",
				]
			`);
		});

		test('three files: oldest dropped when budget is tight', () => {
			const { snippets, docsInPrompt } = buildSnippets(
				[
					{ id: componentId, content: reactComponentFile, focalRanges: [lineRange(reactComponentFile, 10)], editEntryCount: 1 },
					{ id: serviceId, content: tsServiceFile, focalRanges: [lineRange(tsServiceFile, 15)], editEntryCount: 1 },
					{ id: configId, content: configFile, focalRanges: [lineRange(configFile, 5)], editEntryCount: 1 },
				],
				makeOpts({ maxTokens: 150, pageSize: 10, clippingStrategy: RecentFileClippingStrategy.Proportional }),
			);

			// Config (oldest) should be dropped
			expect(docsInPrompt.has(configId)).toBe(false);
			expect(snippets).toMatchInlineSnapshot(`
				[
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /src/components/UserProfile.tsx (truncated)
				  const [user, setUser] = useState<User | null>(null);
				  const [loading, setLoading] = useState(true);
				  const [error, setError] = useState<string | null>(null);

				  useEffect(() => {
				    setLoading(true);
				    UserService.getById(userId)
				      .then(data => {
				        setUser(data);
				        setLoading(false);
				<|/recently_viewed_code_snippet|>",
				]
			`);
		});
	});

	suite('Strategy comparison — same file and edit, different strategies', () => {

		// Edit on createUser method (line 26, near the middle-bottom)
		const editFocalRange = lineRange(tsServiceFile, 26);

		test('TopToBottom: always clips from top, edit location not visible', () => {
			const { snippets } = buildSnippets(
				[{ id: serviceId, content: tsServiceFile, focalRanges: [editFocalRange] }],
				makeOpts({ maxTokens: 100, pageSize: 10, clippingStrategy: RecentFileClippingStrategy.TopToBottom }),
			);

			expect(snippets).toMatchInlineSnapshot(`
				[
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /src/services/userService.ts (truncated)
				import { Injectable } from '@angular/core';
				import { HttpClient } from '@angular/common/http';
				import { Observable } from 'rxjs';

				export interface User {
				  id: number;
				  name: string;
				  email: string;
				  role: 'admin' | 'user';
				}
				<|/recently_viewed_code_snippet|>",
				]
			`);
		});

		test('AroundEditRange: clips centered on the edit location', () => {
			const { snippets } = buildSnippets(
				[{ id: serviceId, content: tsServiceFile, focalRanges: [editFocalRange] }],
				makeOpts({ maxTokens: 100, pageSize: 10, clippingStrategy: RecentFileClippingStrategy.AroundEditRange }),
			);

			expect(snippets).toMatchInlineSnapshot(`
				[
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /src/services/userService.ts (truncated)

				  getUserById(id: number): Observable<User> {
				    return this.http.get<User>(\`\${this.apiUrl}/\${id}\`);
				  }

				  createUser(user: Omit<User, 'id'>): Observable<User> {
				    return this.http.post<User>(this.apiUrl, user);
				  }

				  updateUser(id: number, user: Partial<User>): Observable<User> {
				<|/recently_viewed_code_snippet|>",
				]
			`);
		});

		test('Proportional: same as AroundEditRange for a single file', () => {
			const { snippets } = buildSnippets(
				[{ id: serviceId, content: tsServiceFile, focalRanges: [editFocalRange], editEntryCount: 1 }],
				makeOpts({ maxTokens: 100, pageSize: 10, clippingStrategy: RecentFileClippingStrategy.Proportional }),
			);

			expect(snippets).toMatchInlineSnapshot(`
				[
				  "<|recently_viewed_code_snippet|>
				code_snippet_file_path: /src/services/userService.ts (truncated)

				  getUserById(id: number): Observable<User> {
				    return this.http.get<User>(\`\${this.apiUrl}/\${id}\`);
				  }

				  createUser(user: Omit<User, 'id'>): Observable<User> {
				    return this.http.post<User>(this.apiUrl, user);
				  }

				  updateUser(id: number, user: Partial<User>): Observable<User> {
				<|/recently_viewed_code_snippet|>",
				]
			`);
		});
	});
});
