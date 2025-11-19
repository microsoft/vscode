import assert from 'assert/strict';
import test from 'node:test';
import { extractRunnableCommand } from '../commandParser';

test('runnable snippet detection', async (t) => {
    await t.test('prefers earliest fenced bash block', () => {
        const text = [
            '```bash',
            'echo first',
            '```',
            '```bash',
            'echo second',
            '```'
        ].join('\n');
        assert.equal(extractRunnableCommand(text), 'echo first');
    });

    await t.test('supports shell-like aliases', () => {
        const text = 'Try this:\n```shell\nls -la\n```';
        assert.equal(extractRunnableCommand(text), 'ls -la');
    });

    await t.test('strips prompt prefixes from inline commands', () => {
        const text = '    $ npm install\n\t$ npm test';
        assert.equal(extractRunnableCommand(text), 'npm install\nnpm test');
    });
});
