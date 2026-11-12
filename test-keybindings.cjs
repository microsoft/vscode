#!/usr/bin/env node
/**
 * Test script to validate git extension keybindings
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Testing Git Extension Keybindings\n');

// Load package.json
const packageJsonPath = path.join(__dirname, 'extensions/git/package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const keybindings = packageJson.contributes.keybindings;
const commands = packageJson.contributes.commands;

console.log('✅ package.json is valid JSON\n');

// Test 1: Check our new keybindings exist
console.log('📋 Test 1: New keybindings added');
const expectedBindings = [
  { key: 'ctrl+shift+s', command: 'git.stage' },
  { key: 'ctrl+shift+u', command: 'git.unstage' },
  { key: 'ctrl+shift+a', command: 'git.stageAll' }
];

let allFound = true;
expectedBindings.forEach(expected => {
  const found = keybindings.find(kb => 
    kb.key === expected.key && kb.command === expected.command
  );
  if (found) {
    console.log(`  ✅ ${expected.key} → ${expected.command}`);
  } else {
    console.log(`  ❌ ${expected.key} → ${expected.command} (NOT FOUND)`);
    allFound = false;
  }
});

// Test 2: Check commands exist
console.log('\n📋 Test 2: Commands registered');
const expectedCommands = ['git.stage', 'git.unstage', 'git.stageAll'];
expectedCommands.forEach(cmd => {
  const found = commands.find(c => c.command === cmd);
  if (found) {
    console.log(`  ✅ ${cmd}: "${found.title}"`);
  } else {
    console.log(`  ❌ ${cmd} (NOT FOUND)`);
    allFound = false;
  }
});

// Test 3: Check for duplicate keybindings
console.log('\n📋 Test 3: No duplicate keybindings');
const keyMap = {};
let duplicates = false;
keybindings.forEach(kb => {
  const key = kb.key;
  if (keyMap[key]) {
    console.log(`  ❌ Duplicate: ${key} used by both ${keyMap[key]} and ${kb.command}`);
    duplicates = true;
  } else {
    keyMap[key] = kb.command;
  }
});
if (!duplicates) {
  console.log('  ✅ No duplicate keybindings found');
}

// Test 4: Check when clauses are valid
console.log('\n📋 Test 4: When clauses are valid');
const newBindings = keybindings.filter(kb => 
  ['git.stage', 'git.unstage', 'git.stageAll'].includes(kb.command)
);
newBindings.forEach(kb => {
  if (kb.when && kb.when.includes('config.git.enabled')) {
    console.log(`  ✅ ${kb.command}: has proper when clause`);
  } else {
    console.log(`  ⚠️  ${kb.command}: missing or incomplete when clause`);
  }
});

// Summary
console.log('\n' + '='.repeat(50));
if (allFound && !duplicates) {
  console.log('✅ ALL TESTS PASSED');
  console.log('\n📝 Keybindings added:');
  console.log('   Ctrl+Shift+S → Stage current file');
  console.log('   Ctrl+Shift+U → Unstage current file');
  console.log('   Ctrl+Shift+A → Stage all changes');
  process.exit(0);
} else {
  console.log('❌ SOME TESTS FAILED');
  process.exit(1);
}
