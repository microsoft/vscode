# Slack Integration

This guide explains how to integrate Slack with the Autonomous Coding Agent platform, enabling features like sending notifications from the Node.js backend to Slack channels, building Slack bots for interaction using `@slack/bolt` in Node.js, and handling Slack slash commands or webhooks.

## Overview

Integrating Slack with the Autonomous Coding Agent can:
*   **Enhance Communication:** Send real-time notifications about AI coding task progress, completions, errors, or other platform events directly to relevant Slack channels.
*   **Improve Workflows:** Allow developers to trigger coding tasks, query task status, or interact with the AI agent from within Slack using slash commands or bot interactions.
*   **Centralize Information:** Bring updates and outputs from the coding agent into the team's primary communication hub.

Key Slack API Features for Integration:
*   **Incoming Webhooks:** Simplest way for the Node.js backend to post messages into Slack.
*   **Slack Apps & Bots (using `@slack/bolt` for Node.js):** More powerful integrations that can listen to messages, respond to commands, use interactive components (buttons, modals), and access a wider range of Slack APIs.
*   **Slash Commands:** Allow users to trigger actions in your platform by typing commands like `/agent-do-task <description>` in Slack.
*   **Events API:** Subscribe to events happening in Slack (e.g., `app_mention`) and have your Node.js bot react to them.
*   **Web API:** Used by the bot (via SDK) to perform actions like posting rich messages, opening modals, etc.

## 1. Incoming Webhooks (Simple Notifications from Node.js Backend)

For one-way notifications from the platform to Slack.

### a. Setup in Slack:
1.  Go to your Slack App Directory: `https://YOUR_WORKSPACE_NAME.slack.com/apps/manage`.
2.  Search for "Incoming WebHooks" and click "Add to Slack".
3.  Choose a default channel for posting (can be overridden in the payload).
4.  Click "Add Incoming WebHooks integration".
5.  Slack will generate a **Webhook URL**. Copy this URL.
6.  Store this Webhook URL securely in your Node.js backend's environment variables (e.g., `SLACK_INCOMING_WEBHOOK_URL`).

### b. Sending Messages (Node.js Backend):
```javascript
// server/src/services/notificationService.js (or a dedicated slackService.js)
const axios = require('axios');

async function sendSlackNotification(messageText, options = {}) {
  const webhookUrl = process.env.SLACK_INCOMING_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('Slack Webhook URL not configured. Skipping notification.');
    return;
  }

  const payload = {
    text: messageText, // Fallback text
    blocks: options.blocks || undefined, // For Block Kit messages
    channel: options.channel || undefined, // e.g., "#dev-alerts"
    username: options.username || "Autonomous Agent Bot",
    icon_emoji: options.icon_emoji || ":robot_face:",
  };

  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (response.data === 'ok') {
      console.log('Slack notification sent successfully via webhook.');
    } else {
      console.error('Error sending Slack notification via webhook:', response.data);
    }
  } catch (error) {
    console.error('Failed to send Slack notification via webhook:', error.message);
  }
}

// Example Usage:
// sendSlackNotification("AI Task `TASK_ID_123` completed successfully.", { channel: "#agent-updates" });
//
// const taskDetailsBlock = [{ type: "section", text: { type: "mrkdwn", text: "*Task Completed:*\nRefactor `userService.js`" } }];
// sendSlackNotification("Task Update", { blocks: taskDetailsBlock, channel: "#project-alpha" });

module.exports = { sendSlackNotification };
```
*   Use Slack's [Block Kit](https://api.slack.com/block-kit) for richer messages.

## 2. Building a Slack App (Bots, Slash Commands, Events API with `@slack/bolt`)

For interactive features, create a Slack App. The Node.js backend will host the bot logic.

### a. Create a Slack App:
1.  Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click "Create New App" > "From scratch".
2.  Name your app (e.g., "Coding Agent Companion") and select your workspace.

### b. Configure Bot User & Permissions:
1.  **App Home:** Enable "Messages Tab" to allow DMs with the bot.
2.  **OAuth & Permissions:**
    *   Note your **Signing Secret** from the "Basic Information" page (store as `SLACK_SIGNING_SECRET` in `.env`).
    *   Add Bot Token Scopes (e.g., `chat:write` for sending messages, `commands` for slash commands, `app_mentions:read` to listen to mentions).
3.  **Install App to Workspace:** This generates a **Bot User OAuth Token** (`xoxb-...`). Store it as `SLACK_BOT_TOKEN` in `.env`.

### c. Setup `@slack/bolt` in Node.js Backend:
```bash
# In server/ directory
npm install @slack/bolt axios
```

```javascript
// server/src/core/slack/boltApp.js (or similar path)
const { App, ExpressReceiver } = require('@slack/bolt');

const expressReceiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: '/slack/events', // Default endpoint path, can be customized
});

const boltApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: expressReceiver,
  // For Socket Mode (easier local dev without ngrok, enable in Slack App settings):
  // socketMode: true,
  // appToken: process.env.SLACK_APP_TOKEN, // xapp-... token
});

// --- Event Listeners ---
boltApp.message(/^hello$/i, async ({ message, say }) => {
  await say(`Hey there <@${message.user}>! I'm the Autonomous Coding Agent bot.`);
});

boltApp.event('app_mention', async ({ event, say }) => {
  // Example: Simple echo for mentions
  const userText = event.text.replace(/<@U[A-Z0-9]+>/gi, '').trim(); // Remove mention part
  await say(`You mentioned me, <@${event.user}>! You said: "${userText}". How can I assist with a coding task?`);
});


// --- Slash Command Handlers ---
boltApp.command('/agent-status', async ({ command, ack, say }) => {
  await ack(); // Acknowledge command within 3 seconds
  // const platformStatus = await getPlatformStatusInternal(); // Fetch status from your platform
  await say('Autonomous Coding Agent platform is running smoothly! 🚀');
});

boltApp.command('/agent-run-task', async ({ command, ack, say, client, body }) => {
  await ack();
  const taskDescription = command.text;
  if (!taskDescription) {
    await say("Please provide a description for the task. Usage: `/agent-run-task <your task description>`");
    return;
  }
  try {
    // TODO: Call your platform's backend service to initiate the AI coding task
    // const task = await platformApiService.createAiTask({ description: taskDescription, requestedBySlackUser: command.user_id });
    // await say(`✅ Task "${taskDescription}" (ID: ${task.id}) has been initiated. I'll notify you of progress.`);
    await say(`✅ Task "${taskDescription}" has been initiated. (This is a mock response).`);
  } catch (error) {
    console.error('Error initiating task from Slack:', error);
    await say("Sorry, I couldn't start that task. There might be an issue with the platform.");
  }
});

// --- Interactivity Handlers (e.g., button clicks) ---
// boltApp.action('approve_button_action_id', async ({ body, ack, say }) => {
//   await ack();
//   // const value = body.actions[0].value; // Value from button
//   // await platformApiService.approveItem(value);
//   await say(`Thanks, <@${body.user.id}>! Action processed.`);
// });

// Error handler
boltApp.error(async (error) => {
  console.error('Bolt app error:', error);
});

module.exports = { boltApp, expressReceiver };

// To integrate into your main Express app (e.g., server/src/main.js):
// const { expressReceiver } = require('./core/slack/boltApp'); // Adjust path
// ...
// app.use('/slack/events', expressReceiver.router); // Mount Bolt's router
// ...
// If using Socket Mode, start Bolt app separately:
// const { boltApp } = require('./core/slack/boltApp');
// (async () => { await boltApp.start(); console.log('⚡️ Bolt app started in Socket Mode'); })();
```

### d. Configure Request URLs in Slack App Settings:
*   **Event Subscriptions:** `https://YOUR_PUBLIC_APP_URL/slack/events`
    *   Subscribe to bot events like `app_mention`, `message.im`.
*   **Slash Commands:** For each command (e.g., `/agent-status`), set the Request URL to `https://YOUR_PUBLIC_APP_URL/slack/events` (Bolt's receiver handles routing based on command).
*   **Interactivity & Shortcuts:** Set Request URL to `https://YOUR_PUBLIC_APP_URL/slack/events`.
*   For local development, use a tunneling service like **ngrok** to expose your local Node.js server: `ngrok http 8080` (if your Express app runs on port 8080). Then use the ngrok HTTPS URL in Slack settings.

## Security and Best Practices

*   **Verify Slack Requests:** `@slack/bolt` handles signature verification automatically using the `SLACK_SIGNING_SECRET`. This is crucial.
*   **Secure Tokens:** Store `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, and `SLACK_APP_TOKEN` (if using Socket Mode) in `.env` and never commit them. Use your hosting provider's secret management for production.
*   **Least Privilege Scopes:** Only grant your Slack App the bot token scopes it absolutely needs.
*   **Rate Limiting:** Be aware of [Slack API rate limits](https://api.slack.com/docs/rate-limits). Bolt SDK has some built-in retry logic.
*   **User Experience:** Provide clear feedback, intuitive commands, and graceful error handling in Slack.
*   **OAuth for User-Specific Actions (Advanced):** If the bot needs to act *as a specific Slack user* (not as the bot itself), you'd implement the full Slack OAuth 2.0 flow to obtain user tokens (`xoxp-`). This is more complex and usually not needed for typical bot interactions controlled by the platform.

## Platform Configuration (React Frontend & Node.js Backend)

*   **React Frontend:** May have a settings page where users can:
    *   See if Slack integration is active for their workspace/project.
    *   Potentially configure which platform events trigger Slack notifications and to which channels (this config would be saved via the backend).
*   **Node.js Backend:**
    *   Stores Slack credentials (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, webhook URLs) via environment variables.
    *   Stores user/project-specific Slack configurations (e.g., target channels for notifications) in the PostgreSQL database.

By integrating Slack, the Autonomous Coding Agent platform can become more embedded in developers' daily workflows, providing timely updates and enabling interaction directly from their communication hub.
