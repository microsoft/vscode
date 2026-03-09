// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import http from 'http';

/**
 * MCP tools for the build system DAG.
 *
 * These tools proxy requests to the build-dag service, exposing
 * build DAG queries through the MCP protocol. Agents can use them
 * to understand how to build, test, and run the project.
 */

const BUILD_DAG_URL = process.env.BUILD_DAG_URL ?? 'http://build-dag:3301';

async function fetchBuildDag(path: string, method = 'GET', body?: string): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const url = new URL(path, BUILD_DAG_URL);
		const options: http.RequestOptions = {
			method,
			headers: body ? {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(body),
			} : undefined,
		};

		const req = http.request(url, options, (res) => {
			let data = '';
			res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
			res.on('end', () => {
				try {
					resolve(JSON.parse(data));
				} catch {
					reject(new Error(`Invalid response from build-dag: ${data}`));
				}
			});
		});

		req.on('error', reject);
		if (body) {
			req.write(body);
		}
		req.end();
	});
}

/** List all build/run/test targets with their commands and dependencies. */
export async function buildTargets(params: { ecosystem?: string }): Promise<unknown> {
	const query = params.ecosystem ? `?ecosystem=${encodeURIComponent(params.ecosystem)}` : '';
	return fetchBuildDag(`/targets${query}`);
}

/** Get the ordered list of targets to reach a given target (topological sort). */
export async function buildOrder(params: { target: string }): Promise<unknown> {
	return fetchBuildDag(`/build-order?target=${encodeURIComponent(params.target)}`);
}

/** Get all environment variables, services, and prerequisites needed for a target. */
export async function environmentRequirements(params: { target: string }): Promise<unknown> {
	return fetchBuildDag(`/environment?target=${encodeURIComponent(params.target)}`);
}

/** Find which targets need to re-run given a set of changed files. */
export async function affectedTargets(params: { changedFiles: string[] }): Promise<unknown> {
	return fetchBuildDag('/affected', 'POST', JSON.stringify({ changedFiles: params.changedFiles }));
}
