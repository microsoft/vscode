import { strict as assert } from 'assert';
import test from 'node:test';
import { analyzePrompt, enhancePrompt } from '../promptProcessor';

test('classifies search intent', () => {
    const meta = analyzePrompt('search for foo');
    assert.equal(meta.intent, 'search');
    assert.deepEqual(meta.tokens, ['search', 'for', 'foo']);
});

test('classifies summarize intent', () => {
    const meta = analyzePrompt('please summarize this file');
    assert.equal(meta.intent, 'summarize');
});

test('defaults to unknown intent', () => {
    const meta = analyzePrompt('hello world');
    assert.equal(meta.intent, 'unknown');
});

test('enhances search prompt with files and suggestions', () => {
    const meta = analyzePrompt('search errors');
    const enhanced = enhancePrompt(meta, { filePaths: ['src/a.ts', 'src/b.ts'], suggestions: ['check logs'] });
    assert.ok(enhanced.includes('src/a.ts'));
    assert.ok(enhanced.includes('Suggestions:'));
});

test('enhances summarize prompt with summaries', () => {
    const meta = analyzePrompt('summarize project');
    const enhanced = enhancePrompt(meta, { summaries: ['Summary A'] });
    assert.ok(enhanced.includes('Summary A'));
});
