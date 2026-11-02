/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// Try any model from the terminal:
//   FORK_API_KEY=sk-... node scripts/try-model.ts --format openai --url https://openrouter.ai/api/v1 --model openai/gpt-4o-mini "Say hi"
// The key comes from FORK_API_KEY so it never lands in your shell history.

import { parseArgs } from 'node:util';
import { createModelClient, ModelRouterError, testConnection, type ApiFormat, type ModelConfig } from '../src/index.ts';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		format: { type: 'string', default: 'openai' },
		url: { type: 'string' },
		model: { type: 'string' },
		check: { type: 'boolean', default: false },
		help: { type: 'boolean', default: false },
	},
});

if (values.help || !values.url || !values.model) {
	console.log('Usage: FORK_API_KEY=<key> node scripts/try-model.ts --format <openai|anthropic|gemini> --url <endpoint> --model <name> [--check] [prompt]');
	console.log('  --check   run the connection test instead of a prompt');
	process.exit(values.help ? 0 : 1);
}

const config: ModelConfig = {
	id: 'cli',
	displayName: 'CLI',
	apiFormat: values.format as ApiFormat,
	baseUrl: values.url,
	apiKey: process.env.FORK_API_KEY || undefined,
	model: values.model,
};

try {
	if (values.check) {
		console.log(JSON.stringify(await testConnection(config), null, 2));
	} else {
		const prompt = positionals.join(' ') || 'Say hello in one short sentence.';
		const started = Date.now();
		for await (const event of createModelClient(config).stream({ messages: [{ role: 'user', content: prompt }] })) {
			if (event.type === 'text') {
				process.stdout.write(event.text);
			} else if (event.type === 'done') {
				const usage = event.usage ? `, ${event.usage.inputTokens ?? '?'} in / ${event.usage.outputTokens ?? '?'} out tokens` : '';
				console.log(`\n\n[${event.stopReason}, ${Date.now() - started} ms${usage}]`);
			}
		}
	}
} catch (error) {
	if (error instanceof ModelRouterError) {
		console.error(`Error (${error.kind}): ${error.message}`);
		process.exit(1);
	}
	throw error;
}
