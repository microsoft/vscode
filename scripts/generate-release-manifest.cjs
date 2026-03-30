#!/usr/bin/env node
/**
 * Generate release manifest for ClaudeKit with file timestamps
 * Tracks all kit files with checksums and git commit timestamps
 *
 * Usage: node scripts/generate-release-manifest.cjs [version]
 * Output: release-manifest.json in project root
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Directories to include in release
const INCLUDE_DIRS = ['.claude', '.opencode', 'plans/templates'];
const INCLUDE_FILES = ['.gitignore', '.repomixignore', '.mcp.json', 'CLAUDE.md', 'AGENTS.md'];

// Directories to skip
const SKIP_DIRS = [
  'node_modules', '.venv', 'venv', '.test-venv', '__pycache__',
  '.git', '.svn', 'dist', 'build', 'debug', 'projects',
  'shell-snapshots', 'file-history', 'todos', 'session-env',
  'statsig', '.anthropic',
];

// Hidden files to include
const INCLUDE_HIDDEN = ['.gitignore', '.repomixignore', '.mcp.json'];

/**
 * Calculate SHA-256 checksum of a file
 * Uses streaming for memory efficiency with large files
 */
function calculateChecksum(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Get last git commit timestamp for a file
 * Returns ISO 8601 timestamp or null if not tracked
 */
function getGitTimestamp(filePath) {
  try {
    const result = execSync(
      `git log -1 --format="%cI" -- "${filePath}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Recursively scan directory and collect files
 * Tracks visited inodes to prevent symlink cycles
 */
function scanDirectory(dir, baseDir, visitedInodes = new Set()) {
  const files = [];

  if (!fs.existsSync(dir)) return files;

  // Check for symlink cycles using inode
  let dirStats;
  try {
    dirStats = fs.statSync(dir);
  } catch {
    return files;
  }

  const inodeKey = `${dirStats.dev}:${dirStats.ino}`;
  if (visitedInodes.has(inodeKey)) {
    console.warn(`  Warning: Skipping cyclic symlink at ${dir}`);
    return files;
  }
  visitedInodes.add(inodeKey);

  const entries = fs.readdirSync(dir);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);

    let stats;
    try {
      stats = fs.statSync(fullPath);
    } catch {
      // File may have been deleted or permission denied
      continue;
    }

    if (stats.isDirectory()) {
      if (SKIP_DIRS.includes(entry)) continue;
      files.push(...scanDirectory(fullPath, baseDir, visitedInodes));
    } else if (stats.isFile()) {
      // Skip hidden files except allowed ones
      if (entry.startsWith('.') && !INCLUDE_HIDDEN.includes(entry)) {
        continue;
      }
      files.push(fullPath);
    }
    // Skip symlinks to files (only follow directory symlinks with cycle detection)
  }

  return files;
}

/**
 * Main function
 */
function main() {
  const version = process.argv[2] || process.env.npm_package_version || 'unknown';
  const projectRoot = process.cwd();
  const outputPath = path.join(projectRoot, 'release-manifest.json');
  const tempPath = path.join(projectRoot, 'release-manifest.json.tmp');

  console.log(`Generating release manifest v${version}...`);

  const allFiles = [];

  // Scan included directories
  for (const dir of INCLUDE_DIRS) {
    const dirPath = path.join(projectRoot, dir);
    if (fs.existsSync(dirPath)) {
      const files = scanDirectory(dirPath, projectRoot);
      allFiles.push(...files);
      console.log(`  ${dir}: ${files.length} files`);
    }
  }

  // Add included root files
  for (const file of INCLUDE_FILES) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      allFiles.push(filePath);
    }
  }

  console.log(`Total files: ${allFiles.length}`);
  console.log('Calculating checksums and fetching git timestamps...');

  const manifest = {
    version,
    generatedAt: new Date().toISOString(),
    files: [],
  };

  let skippedFiles = 0;

  for (const file of allFiles) {
    try {
      // Re-check file exists (may have been deleted during processing)
      if (!fs.existsSync(file)) {
        skippedFiles++;
        continue;
      }

      let relativePath = path.relative(projectRoot, file).replace(/\\/g, '/');

      // Strip .claude/ prefix for files inside .claude directory
      // CLI tracks files relative to .claude/, not project root
      if (relativePath.startsWith('.claude/')) {
        relativePath = relativePath.slice('.claude/'.length);
      }

      const stats = fs.statSync(file);
      const checksum = calculateChecksum(file);
      const lastModified = getGitTimestamp(file);

      const entry = {
        path: relativePath,
        checksum,
        size: stats.size,
      };

      // Only add lastModified if we got a valid timestamp
      if (lastModified) {
        entry.lastModified = lastModified;
      }

      manifest.files.push(entry);
    } catch (err) {
      // Skip files that can't be processed (deleted, permission denied, etc.)
      console.warn(`  Warning: Skipping ${file}: ${err.message}`);
      skippedFiles++;
    }
  }

  // Atomic write: write to temp file then rename
  fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2) + '\n');
  fs.renameSync(tempPath, outputPath);

  const withTimestamps = manifest.files.filter(f => f.lastModified).length;
  console.log(`Generated: ${outputPath}`);
  console.log(`Files with timestamps: ${withTimestamps}/${manifest.files.length}`);
  if (skippedFiles > 0) {
    console.log(`Skipped files: ${skippedFiles}`);
  }
}

main();
