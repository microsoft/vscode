# Slack Integration

This guide explains how to integrate Slack with your platform, enabling features like sending notifications to Slack channels, building Slack bots for interaction, and handling Slack slash commands or webhooks.

## Overview

Integrating Slack can:
*   **Enhance Communication:** Send real-time notifications about platform events (e.g., new user sign-ups, task completions, system alerts) directly to relevant Slack channels.
*   **Improve Workflows:** Allow users to interact with your platform from within Slack using slash commands or bots (e.g., create a task, retrieve information).
*   **Centralize Information:** Bring platform updates into the communication hub that many teams already use.

Key Slack API Features for Integration:
*   **Incoming Webhooks:** A simple way to post messages from external sources into Slack.
*   **Slack Apps & Bots:** More powerful integrations that can listen to messages, respond to commands, use interactive components (buttons, modals), and access a wider range of Slack APIs.
*   **Slash Commands:** Allow users to trigger actions in your platform by typing commands like `/yourplatform-do-something` in Slack.
*   **Events API:** Subscribe to events happening in Slack (e.g., messages posted, reactions added) and react to them.
*   **Web API:** A comprehensive set of HTTP methods for interacting with Slack (e.g., posting messages, managing channels, users).

## 1. Incoming Webhooks (Simple Notifications)

Incoming Webhooks are the easiest way to send messages to Slack from your platform.

### a. Setup in Slack:
1.  Go to your Slack App Directory: [https://your-workspace.slack.com/apps/manage](https://your-workspace.slack.com/apps/manage)
2.  Search for "Incoming WebHooks" and click "Add to Slack".
3.  Choose a channel where messages will be posted by default (this can often be overridden in the payload).
4.  Click "Add Incoming WebHooks integration".
5.  Slack will generate a **Webhook URL**. This URL is sensitive; treat it like an API key.
6.  Optionally, customize the name, icon, and description.

### b. Sending Messages from Your Platform:
*   Store the Webhook URL securely in your platform's configuration (e.g., environment variable, encrypted in DB).
*   To send a message, make an HTTP POST request to the Webhook URL with a JSON payload.

**Example (Node.js using `axios`):**
```javascript
// backend/services/slackNotificationService.js
const axios = require('axios');
const SLACK_WEBHOOK_URL = process.env.SLACK_INCOMING_WEBHOOK_URL; // Store securely

async function sendSlackNotification(messageText, channel = null, username = "Platform Bot", icon_emoji = ":robot_face:") {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('Slack Webhook URL not configured. Skipping notification.');
    return;
  }

  const payload = {
    text: messageText,
    username: username,
    icon_emoji: icon_emoji,
  };

  if (channel) {
    payload.channel = channel; // e.g., "#general" or "@username" for DMs (if webhook allows)
  }

  try {
    const response = await axios.post(SLACK_WEBHOOK_URL, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (response.data === 'ok') {
      console.log('Slack notification sent successfully.');
    } else {
      console.error('Error sending Slack notification:', response.data);
    }
  } catch (error) {
    console.error('Failed to send Slack notification:', error.message);
  }
}

// Usage:
// sendSlackNotification("A new user has signed up: user@example.com", "#signups");
// sendSlackNotification("System alert: High CPU usage detected!", "#alerts");
```

**Slack Message Formatting:**
*   Use Slack's `mrkdwn` for basic formatting (bold, italics, links, etc.). See [Slack Formatting Messages](https://api.slack.com/reference/surfaces/formatting).
*   For richer messages, use **Block Kit**, Slack's UI framework for creating interactive and visually appealing messages. See [Block Kit Builder](https://app.slack.com/block-kit-builder).

**Example Block Kit Payload:**
```json
{
  "text": "New Task Created: Design the new homepage", // Fallback text for notifications
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "🚀 *New Task Created!*"
      }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Title:*\nDesign the new homepage" },
        { "type": "mrkdwn", "text": "*Assigned To:*\n<@U012ABCDEF>" } // Mention a user
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "View Task" },
          "style": "primary",
          "url": "https://your-platform.com/task/123"
        }
      ]
    }
  ]
}
```

## 2. Building a Slack App (Bots, Slash Commands, Events API)

For more interactive integrations, create a Slack App.

### a. Create a Slack App:
1.  Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click "Create New App".
2.  Choose "From scratch".
3.  Name your app and select the workspace to develop it in.
4.  Once created, you'll land on the app's Basic Information page.

### b. Add Bot User:
1.  In your app's settings, go to "Features" > "App Home".
2.  Enable "Messages Tab" to allow users to DM your bot.
3.  Review Scopes:
    *   Go to "Features" > "OAuth & Permissions".
    *   Under "Scopes" > "Bot Token Scopes", add necessary permissions. Common ones:
        *   `chat:write`: To send messages as the bot.
        *   `commands`: To add slash commands.
        *   `app_mentions:read`: To listen to mentions of your bot in channels.
        *   `channels:history`, `groups:history`, `im:history`, `mpim:history`: To read messages in channels/DMs your bot is part of.
        *   See [Slack API Scopes](https://api.slack.com/scopes).

### c. Install App to Workspace:
1.  Go to "Settings" > "Install App".
2.  Click "Install to Workspace". This will generate a **Bot User OAuth Token** (starts with `xoxb-`).
3.  Store this `xoxb-` token securely in your platform's backend. It's used to make API calls as your bot.

### d. Using Slack SDKs:
Slack provides official SDKs (e.g., `@slack/bolt` for JavaScript, `slack_sdk` for Python) that simplify interactions. `@slack/bolt` is particularly good as it handles event subscriptions, slash commands, and interactive components.

**Example: Basic Slack Bot with `@slack/bolt` (Node.js)**

```bash
npm install @slack/bolt
```

```javascript
// backend/services/slackBotService.js
const { App } = require('@slack/bolt');

// Initialize Bolt app
const boltApp = new App({
  token: process.env.SLACK_BOT_TOKEN, // xoxb- token
  signingSecret: process.env.SLACK_SIGNING_SECRET, // Found in App's "Basic Information" page
  // socketMode: true, // Or use HTTP mode with a Request URL
  // appToken: process.env.SLACK_APP_TOKEN // xapp- token, needed for Socket Mode
});

// Listen for a simple message containing "hello"
boltApp.message('hello', async ({ message, say }) => {
  // say() sends a message to the channel where the event was triggered
  await say(`Hey there <@${message.user}>! 👋`);
});

// Listen for mentions of your bot
boltApp.event('app_mention', async ({ event, say }) => {
  await say(`Yes, <@${event.user}>? How can I help you today?`);
  // You can parse event.text to understand the command/question
});

// (async () => {
//   // Start your app
//   const port = process.env.SLACK_BOT_PORT || 3001;
//   await boltApp.start(port);
//   console.log(`⚡️ Slack Bolt app is running on port ${port}!`);
// })();

// To integrate with an existing Express app (instead of boltApp.start()):
// const express = require('express');
// const expressApp = express();
// expressApp.use('/slack/events', boltApp.receiver.router); // boltApp.receiver is ExpressReceiver by default
// expressApp.listen(port, () => console.log(`Slack app on port ${port}`));

module.exports = boltApp; // Export for use in your main server file if not using socket mode start
```
**Note on Starting Bolt:**
*   **Socket Mode (Easier for Development):**
    1.  Enable "Socket Mode" in your Slack App settings ("Settings" > "Socket Mode").
    2.  Generate an "App-Level Token" with `connections:write` scope. Store this `xapp-` token.
    3.  Use `socketMode: true` and `appToken` in `new App({})`. Then call `await boltApp.start();`. No public Request URL needed.
*   **HTTP Mode (for Production):**
    1.  You need a publicly accessible HTTPS URL (e.g., `https://your-platform.com/slack/events`). Use tools like ngrok for local development.
    2.  Enter this URL in relevant sections of your Slack App settings (e.g., "Event Subscriptions", "Slash Commands", "Interactivity & Shortcuts").
    3.  Bolt's default `ExpressReceiver` can be integrated into an existing Express app.

### e. Slash Commands:
1.  In your Slack App settings, go to "Features" > "Slash Commands".
2.  Click "Create New Command".
3.  **Command:** e.g., `/yourplatform-create-task`
4.  **Request URL:** The HTTPS endpoint on your server that Slack will POST to when the command is used (e.g., `https://your-platform.com/slack/commands`).
5.  **Short Description & Usage Hint.**

**Handling Slash Commands with Bolt:**
```javascript
// In your boltApp setup:
boltApp.command('/yourplatform-create-task', async ({ command, ack, say, client, body }) => {
  // Acknowledge command request within 3 seconds
  await ack();

  const taskTitle = command.text; // Text entered after the command

  if (!taskTitle) {
    await say("Please provide a title for the task. Usage: `/yourplatform-create-task <title>`");
    return;
  }

  try {
    // Call your platform's service to create the task
    // const newTask = await platformTaskService.create({ title: taskTitle, createdBySlackUser: command.user_id });
    await say(`✅ Task created: "${taskTitle}" (ID: your_task_id_here). Link: https://your-platform.com/task/your_task_id_here`);

    // Optionally, open a modal for more input using client.views.open
    // await client.views.open({
    //   trigger_id: body.trigger_id, // trigger_id from the command payload
    //   view: { /* Your Block Kit modal definition */ }
    // });

  } catch (error) {
    console.error('Error creating task from Slack command:', error);
    await say("Sorry, I couldn't create the task. Please try again later.");
  }
});
```

### f. Event Subscriptions:
1.  In your Slack App settings, go to "Features" > "Event Subscriptions".
2.  Enable Events.
3.  **Request URL:** The HTTPS endpoint for Slack to send events to (e.g., `https://your-platform.com/slack/events`). Slack will verify this URL.
4.  **Subscribe to Bot Events:** Add events your bot should listen to (e.g., `app_mention`, `message.channels`, `message.im`).
5.  **Subscribe to Workspace Events (Optional & Requires Higher Permissions):** e.g., `user_change`, `channel_created`.

**Handling Events with Bolt:** (Examples shown in the basic bot setup above for `app_mention` and `message`).

### g. Interactivity (Buttons, Modals, Select Menus):
1.  In your Slack App settings, go to "Features" > "Interactivity & Shortcuts".
2.  Enable Interactivity.
3.  **Request URL:** The HTTPS endpoint for Slack to send interaction payloads (e.g., button clicks, modal submissions). Bolt often uses the same URL as events.

**Handling Button Clicks with Bolt:**
```javascript
// Assuming you sent a message with a button having action_id: 'approve_task_button'
boltApp.action('approve_task_button', async ({ body, ack, say, client }) => {
  // Acknowledge the action
  await ack();

  const taskId = body.actions[0].value; // If you set a value on the button
  const userId = body.user.id;

  try {
    // platformTaskService.approve(taskId, userId);
    await say(`<@${userId}> approved task ${taskId}! 🎉`);
    // You can also update the original message using client.chat.update or body.response_url
  } catch (error) {
    await say(`Failed to approve task ${taskId}.`);
  }
});

// Handling Modal Submissions
// boltApp.view('your_modal_callback_id', async ({ ack, body, view, client }) => {
//   await ack(); // Acknowledge modal submission
//   const userData = view.state.values; // Extract data from modal input blocks
//   // Process data...
// });
```

## Security and Best Practices

*   **Verify Slack Requests:**
    *   **Signing Secret:** Slack signs its requests to your server. The Bolt SDK handles this automatically if you provide the `signingSecret`. If not using Bolt, you must [manually verify signatures](https://api.slack.com/authentication/verifying-requests-from-slack).
    *   This is crucial to ensure requests are genuinely from Slack.
*   **Secure Tokens:** Store Bot Tokens (`xoxb-`), App-Level Tokens (`xapp-`), and Signing Secrets securely as environment variables or in a secret management system.
*   **Least Privilege:** Only grant your Slack App the scopes it absolutely needs.
*   **Rate Limiting:** Be aware of [Slack API rate limits](https://api.slack.com/docs/rate-limits). Implement appropriate retry logic with backoff.
*   **User Experience:**
    *   Provide clear feedback to users in Slack.
    *   Design intuitive slash commands and interactive messages.
    *   Handle errors gracefully.
*   **OAuth for User-Specific Actions:** If your app needs to perform actions on behalf of a Slack user (not just as the bot), you'll need to implement the [Slack OAuth 2.0 flow](https://api.slack.com/authentication/oauth-v2) to get user-specific tokens (`xoxp-`).
*   **Log Interactions:** Log requests, responses, and errors for easier debugging.

## Platform Configuration

Your platform will need a settings area for administrators to:
*   Input the Slack Bot Token (`xoxb-`).
*   Input the Slack Signing Secret.
*   Input the Slack App-Level Token (`xapp-`) if using Socket Mode.
*   Configure default channels for notifications or other app settings.

By following these guidelines, you can build robust and useful Slack integrations for your platform. Always refer to the official [Slack API documentation](https://api.slack.com/) and the [Bolt SDK documentation](https://slack.dev/bolt-js/tutorial/getting-started) for the most current information.
