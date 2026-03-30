/**
 * Send Release Notification to Discord using Embeds
 *
 * Usage:
 *   node send-discord-release.cjs <type>
 *
 * Args:
 *   type: 'production' or 'beta'
 *
 * Env:
 *   DISCORD_WEBHOOK_URL: Discord webhook URL (read from env, not CLI args)
 *
 * NOTE: Version gate relies on @semantic-release/npm updating package.json.
 * If the release config changes to skip that step, the workflow gate will
 * silently fail to detect new releases.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const releaseType = process.argv[2];
const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

if (!['production', 'beta'].includes(releaseType)) {
  console.error(`[X] Invalid release type: "${releaseType}". Must be 'production' or 'beta'`);
  process.exit(1);
}

if (!webhookUrl) {
  console.error('[X] DISCORD_WEBHOOK_URL env var not set');
  process.exit(1);
}

// Read CHANGELOG.md and extract the latest release notes
function extractLatestRelease() {
  const changelogPath = path.resolve(__dirname, '../CHANGELOG.md');

  if (!fs.existsSync(changelogPath)) {
    return { version: 'Unknown', date: new Date().toISOString().split('T')[0], sections: {} };
  }

  const content = fs.readFileSync(changelogPath, 'utf8');
  const lines = content.split('\n');

  let version = 'Unknown';
  let date = new Date().toISOString().split('T')[0];
  let collecting = false;
  let currentSection = null;
  const sections = {};

  for (const line of lines) {
    // Match version header: ## 1.15.0 (2025-11-22) or ## [1.15.0](url) (2025-11-22)
    const versionMatch = line.match(/^## \[?(\d+\.\d+\.\d+(?:-beta\.\d+)?)\]?.*?\((\d{4}-\d{2}-\d{2})\)/);
    if (versionMatch) {
      if (!collecting) {
        version = versionMatch[1];
        date = versionMatch[2];
        collecting = true;
        continue;
      }
      break;
    }

    if (!collecting) continue;

    const sectionMatch = line.match(/^### (.+)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      sections[currentSection] = [];
      continue;
    }

    if (currentSection && line.trim().startsWith('*')) {
      const item = line.trim().substring(1).trim();
      if (item) {
        sections[currentSection].push(item);
      }
    }
  }

  return { version, date, sections };
}

/**
 * Create Discord embed from parsed release data.
 * Section names from CHANGELOG may already include emojis (e.g., "🚀 Features")
 * from .releaserc presetConfig — detect and avoid double-prepending.
 */
function createEmbed(release) {
  const isBeta = releaseType === 'beta';
  const color = isBeta ? 0xF59E0B : 0x10B981;
  const title = isBeta ? `🧪 Beta Release ${release.version}` : `🚀 Release ${release.version}`;
  const url = `https://github.com/claudekit/claudekit-engineer/releases/tag/v${release.version}`;

  const sectionEmojis = {
    'Features': '🚀',
    'Hotfixes': '🔥',
    'Bug Fixes': '🐞',
    'Documentation': '📚',
    'Styles': '💄',
    'Code Refactoring': '♻️',
    'Performance Improvements': '⚡',
    'Tests': '✅',
    'Build System': '🏗️',
    'CI': '👷',
    'Chores': '🔧'
  };

  // Simplified emoji detection — covers all emojis used in .releaserc presetConfig
  const startsWithEmoji = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

  const fields = [];

  for (const [sectionName, items] of Object.entries(release.sections)) {
    if (items.length === 0) continue;

    let fieldName;
    if (startsWithEmoji.test(sectionName)) {
      fieldName = sectionName;
    } else {
      const emoji = sectionEmojis[sectionName] || '📌';
      fieldName = `${emoji} ${sectionName}`;
    }

    let fieldValue = items.map(item => `• ${item}`).join('\n');

    // Discord field value max is 1024 characters
    if (fieldValue.length > 1024) {
      const truncateAt = fieldValue.lastIndexOf('\n', 1000);
      fieldValue = `${fieldValue.substring(0, truncateAt > 0 ? truncateAt : 1000)}\n... *(truncated)*`;
    }

    fields.push({ name: fieldName, value: fieldValue, inline: false });
  }

  return {
    title,
    url,
    color,
    timestamp: new Date().toISOString(),
    footer: { text: isBeta ? 'Beta Release • Pre-release' : 'Production Release • Latest' },
    fields: fields.slice(0, 25) // Discord max 25 fields per embed
  };
}

// Send to Discord
function sendToDiscord(embed) {
  const payload = {
    username: releaseType === 'beta' ? 'ClaudeKit Beta Release Bot' : 'ClaudeKit Release Bot',
    avatar_url: 'https://github.com/claudekit.png',
    embeds: [embed]
  };

  const url = new URL(webhookUrl);
  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('[OK] Discord notification sent successfully');
      } else {
        console.error(`[X] Discord webhook failed with status ${res.statusCode}`);
        console.error(data);
        process.exit(1);
      }
    });
  });

  let timedOut = false;
  req.setTimeout(10000, () => {
    timedOut = true;
    console.error('[X] Discord webhook request timed out');
    req.destroy();
    process.exit(1);
  });

  req.on('error', (error) => {
    if (timedOut) return;
    console.error('[X] Error sending Discord notification:', error);
    process.exit(1);
  });

  req.write(JSON.stringify(payload));
  req.end();
}

// Main execution
try {
  const release = extractLatestRelease();
  console.log(`[i] Preparing ${releaseType} release notification for v${release.version}`);

  const sectionCount = Object.values(release.sections).flat().length;
  if (sectionCount === 0) {
    console.log('[i] No changelog items found — skipping Discord notification');
    process.exit(0);
  }

  const embed = createEmbed(release);
  sendToDiscord(embed);
} catch (error) {
  console.error('[X] Error:', error);
  process.exit(1);
}
