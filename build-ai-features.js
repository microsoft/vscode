#!/usr/bin/env node

/**
 * Build script to compile AI Assistant features for CodeMate
 */

import fs from 'fs';
import path from 'path';

console.log('🤖 Building CodeMate AI Features...\n');

// Check if AI Assistant files exist
const aiAssistantPath = 'src/vs/workbench/contrib/aiAssistant';
const requiredFiles = [
	'common/aiAssistantService.ts',
	'browser/aiAssistantServiceImpl.ts',
	'browser/aiCompletionProvider.ts',
	'browser/aiInlineCompletionProvider.ts',
	'browser/aiChatViewSimple.ts',
	'browser/aiAssistantContribution.ts',
	'browser/media/aiChat.css',
	'browser/media/aiSettings.css'
];

console.log('✅ Checking AI Assistant files...');
let allFilesExist = true;

for (const file of requiredFiles) {
	const filePath = path.join(aiAssistantPath, file);
	if (fs.existsSync(filePath)) {
		console.log(`   ✓ ${file}`);
	} else {
		console.log(`   ❌ ${file} - MISSING`);
		allFilesExist = false;
	}
}

if (!allFilesExist) {
	console.log('\n❌ Some AI Assistant files are missing. Please ensure all files are created.');
	process.exit(1);
}

console.log('\n✅ All AI Assistant files found!');

// Check product.json configuration
console.log('\n✅ Checking product configuration...');
const productJsonPath = 'product.json';
if (fs.existsSync(productJsonPath)) {
	const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
	if (productJson.nameShort === 'CodeMate') {
		console.log('   ✓ Product name updated to CodeMate');
	} else {
		console.log('   ⚠️  Product name not updated');
	}
} else {
	console.log('   ❌ product.json not found');
}

// Display build instructions
console.log('\n🚀 Build Instructions:');
console.log('1. Install dependencies: npm install');
console.log('2. Compile TypeScript: npm run compile');
console.log('3. Run CodeMate: npm run electron');
console.log('\n📋 AI Configuration Steps:');
console.log('1. Open CodeMate');
console.log('2. Configure AI provider in settings');
console.log('3. Add your API key');
console.log('4. Start using AI features!');

console.log('\n🎉 CodeMate AI Features are ready to build!');
console.log('\n📚 Features included:');
console.log('   • AI Chat Assistant');
console.log('   • Smart Code Completion');
console.log('   • Inline AI Completions');
console.log('   • Code Explanation');
console.log('   • Code Refactoring');
console.log('   • Multiple AI Provider Support');

console.log('\n🔧 Supported AI Providers:');
console.log('   • OpenAI (GPT-4, GPT-3.5)');
console.log('   • Anthropic (Claude)');
console.log('   • Local AI Models');

console.log('\n⚡ Keyboard Shortcuts:');
console.log('   • Ctrl+Shift+E: Explain selected code');
console.log('   • Ctrl+Shift+G: Generate code');
console.log('   • Ctrl+Shift+R: Refactor selected code');
