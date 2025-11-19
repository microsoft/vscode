import { strict as assert } from 'assert';
import test from 'node:test';
import { extractRunnableCommand } from '../commandParser';

test('extracts bash fenced code block', () => {
    const command = extractRunnableCommand('Here you go:\n```bash\nnpm install\nnpm test\n```');
    assert.equal(command, 'npm install\nnpm test');
});

test('extracts commands prefixed with $', () => {
    const command = extractRunnableCommand('$ git status\n$ npm run lint');
    assert.equal(command, 'git status\nnpm run lint');
});

test('prefers fenced bash block over inline prompts', () => {
    const command = extractRunnableCommand('Try this:\n$ echo skip\n```bash\n$ echo run me\n```');
    assert.equal(command, 'echo run me');
});

test('returns undefined when no runnable content found', () => {
    const command = extractRunnableCommand('No commands here.');
    assert.equal(command, undefined);
});
