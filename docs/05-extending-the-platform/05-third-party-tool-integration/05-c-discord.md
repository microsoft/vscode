# Discord Integration

This guide covers how to integrate Discord with the Autonomous Coding Agent platform, focusing on sending notifications from the Node.js backend, building Discord bots for interactive commands using `discord.js`, and potentially Discord authentication.

## Overview

Integrating Discord allows the Autonomous Coding Agent platform to:
*   **Send Notifications:** Post messages to Discord channels or direct messages (DMs) about AI coding task progress, completions, errors, or other platform events.
*   **Create Interactive Bots:** Develop bots that users can interact with via commands in Discord servers to perform actions (e.g., trigger an AI coding task) or retrieve information from your platform.
*   **Community Engagement:** Use Discord as a communication hub for your platform's user community, allowing them to interact with the agent directly.
*   **Discord Authentication (OAuth2):** Optionally, allow users to sign in or link their platform accounts using their Discord identity.

Key Discord API Features for Integration:
*   **Webhooks:** A simple way for the Node.js backend to send messages to Discord channels without a full bot.
*   **Discord Bots (using `discord.js` for Node.js):** More powerful integrations using the Discord API via Gateway (for real-time events) and REST (for actions). Requires creating a Bot Application in the Discord Developer Portal.
*   **Slash Commands:** The modern and preferred way for users to interact with bots, offering auto-completion, structured inputs, and better permission handling.
*   **OAuth2:** For authenticating users with their Discord accounts and obtaining permissions to act on their behalf or access their user information.

## 1. Discord Webhooks (Simple Notifications from Node.js Backend)

Webhooks are the easiest method for sending one-way messages from your platform to a specific Discord channel.

### a. Setup in Discord:
1.  In your Discord Server, go to Server Settings > Integrations.
2.  Click "Webhooks" > "New Webhook".
3.  Customize the webhook's name (e.g., "Agent Notifications"), choose the channel it will post to, and optionally set an avatar.
4.  Copy the **Webhook URL**. This URL is sensitive; treat it like an API key.
5.  Store this Webhook URL securely in your Node.js backend's environment variables (e.g., `DISCORD_WEBHOOK_URL`).

### b. Sending Messages (Node.js Backend):
```javascript
// server/src/services/notificationService.js (or a dedicated discordService.js)
const axios = require('axios');

async function sendDiscordWebhookNotification(messageContent, options = {}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('Discord Webhook URL not configured. Skipping notification.');
    return;
  }

  const payload = {
    content: messageContent, // Basic message content (Markdown supported)
    username: options.username || "Autonomous Coding Agent",
    avatar_url: options.avatar_url || undefined, // URL to an image for the webhook's avatar
    embeds: options.embeds || undefined, // For richer, structured messages
  };

  try {
    await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('Discord webhook notification sent successfully.');
  } catch (error) {
    console.error('Failed to send Discord webhook notification:', error.response ? error.response.data : error.message);
  }
}

// Example Usage:
// sendDiscordWebhookNotification("AI Task `TASK_XYZ` has started processing.");
//
// const reportEmbed = [{
//   title: "AI Task `TASK_ABC` Completed",
//   description: "Code generation finished. View details on the platform.",
//   color: 0x5865F2, // Discord blurple
//   fields: [{ name: "Status", value: "Success", inline: true }, { name: "Duration", value: "35s", inline: true }],
//   timestamp: new Date().toISOString(),
//   footer: { text: "Agent Notification System" }
// }];
// sendDiscordWebhookNotification(null, { embeds: reportEmbed }); // Content can be null if only sending embeds

module.exports = { sendDiscordWebhookNotification };
```
*   Use **Embeds** for richer messages. See [Discord Embed Structure](https://discord.com/developers/docs/resources/channel#embed-object).

## 2. Building a Discord Bot (using `discord.js`)

For interactive commands, event handling, and more complex interactions, create a Discord Bot Application. The Node.js backend will host the bot.

### a. Create a Discord Application and Bot:
1.  Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2.  Click "New Application". Give it a name (e.g., "My Coding Agent").
3.  Navigate to the "Bot" tab. Click "Add Bot" and confirm.
4.  **Bot Token:** Under the bot's username, click "Reset Token" or "View Token". This token is your bot's password. **Keep it secret and secure.** Store it in your Node.js backend's `.env` file as `DISCORD_BOT_TOKEN`.
5.  **Privileged Gateway Intents:** Enable necessary intents under the "Bot" tab:
    *   **Message Content Intent:** **Crucial if your bot needs to read the content of messages** (e.g., for traditional prefix commands like `!agent help`). For new bots, Slash Commands are preferred and often don't require this intent for basic operation.
    *   Server Members Intent and Presence Intent: Enable if your bot needs information about server members or their presence. (Requires verification for bots in 100+ servers).

### b. Invite Your Bot to a Server:
1.  Go to "OAuth2" > "URL Generator" in your application's settings.
2.  Under "Scopes", select `bot` and `applications.commands` (essential for slash commands).
3.  Under "Bot Permissions", select the permissions your bot needs (e.g., "Send Messages", "Read Message History", "Embed Links", "Use Slash Commands").
4.  Copy the generated URL, paste it into your browser, and add the bot to your desired server(s).

### c. Setup `discord.js` in Node.js Backend:
```bash
# In server/ directory
npm install discord.js dotenv
```
Ensure `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID` (Application ID from "General Information" page), and optionally `DISCORD_GUILD_ID` (your test server's ID for instant slash command updates) are in your `.env` file.

```javascript
// server/src/core/discord/discordBot.js (or similar path)
const { Client, GatewayIntentBits, Events, REST, Routes, Collection } = require('discord.js');
require('dotenv').config(); // For process.env variables

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // GatewayIntentBits.MessageContent, // Only if using prefix commands AND enabled in Dev Portal
    // GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection(); // To store slash commands

// --- Load Slash Commands (conceptual, actual loading depends on your file structure) ---
// Example: Assuming commands are in 'server/src/core/discord/commands/'
// const fs = require('node:fs');
// const path = require('node:path');
// const commandsPath = path.join(__dirname, 'commands');
// const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
// for (const file of commandFiles) {
//   const filePath = path.join(commandsPath, file);
//   const command = require(filePath);
//   if ('data' in command && 'execute' in command) {
//     client.commands.set(command.data.name, command);
//   } else {
//     console.warn(`[WARNING] Command at ${filePath} is missing "data" or "execute" property.`);
//   }
// }

// --- Event Handlers ---
client.once(Events.ClientReady, c => {
  console.log(`🟢 Discord bot is ready! Logged in as ${c.user.tag}`);
  // registerSlashCommands(); // Call this once or when commands change
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return; // Only handle slash commands

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    await interaction.reply({ content: 'Error: Command not found.', ephemeral: true });
    return;
  }

  try {
    await command.execute(interaction); // Execute the command
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  }
});

// --- Slash Command Registration (run once, or when commands change) ---
// This part should be in a separate script or run conditionally.
/*
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID; // Test server ID

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

async function registerSlashCommands() {
  const commandsToRegister = [];
  for (const command of client.commands.values()) {
    commandsToRegister.push(command.data.toJSON());
  }

  try {
    console.log(`Started refreshing ${commandsToRegister.length} application (/) commands.`);
    let data;
    if (GUILD_ID) { // Register to a specific guild for instant updates (testing)
      data = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commandsToRegister },
      );
    } else { // Global registration (can take up to an hour)
      data = await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commandsToRegister },
      );
    }
    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
}
// To register commands:
// 1. Define command files (e.g., ping.js, agent-task.js) in a 'commands' folder.
// 2. Load them into client.commands as shown above.
// 3. Call registerSlashCommands() (e.g., via a separate script `node deploy-commands.js`).
*/

// --- Start the Bot ---
async function startDiscordBot() {
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.error("🔴 DISCORD_BOT_TOKEN is not set. Bot will not start.");
    return;
  }
  // TODO: Load commands into client.commands here before login
  // Example:
  // const pingCommand = require('./commands/ping'); // Assuming you have commands/ping.js
  // client.commands.set(pingCommand.data.name, pingCommand);

  try {
    await client.login(BOT_TOKEN);
  } catch (error) {
    console.error("🔴 Failed to start Discord bot:", error);
  }
}

// module.exports = { startDiscordBot, client }; // Export if starting from main app file
// If running this file directly: startDiscordBot();
```
*   **Command Files:** You would create separate files for each slash command (e.g., `commands/ping.js`, `commands/agent-task.js`). Each file exports a `data` object (using `SlashCommandBuilder`) and an `execute` async function.
*   **Deployment of Commands:** Slash commands need to be registered with Discord. This is usually done via a separate script (`deploy-commands.js`) that you run once or when commands change.

### d. Interactive Components (Buttons, Modals, Select Menus):
`discord.js` supports creating and handling these components. Interactions are received through the `Events.InteractionCreate` event, checking `interaction.isButton()`, `interaction.isStringSelectMenu()`, `interaction.isModalSubmit()`, etc.

## 3. Discord OAuth2 (User Authentication - Optional)

If you want users to "Login with Discord" to your platform:
1.  **Setup in Discord Developer Portal:** Go to "OAuth2" > "General". Add Redirect URIs (e.g., `https://your-platform-api.com/api/auth/discord/callback`). Note Client ID & Secret.
2.  **OAuth2 Flow:** Similar to Google/Slack. Your Node.js backend handles redirecting to Discord, exchanging the code for tokens, fetching user info (`/users/@me`), and linking/creating a platform account. Store tokens securely.

## Security and Best Practices
*   **Secure Bot Token & Client Secret:** Use environment variables and your hosting's secret management.
*   **Permissions (Intents & Scopes):** Request only necessary Gateway Intents for the bot and OAuth scopes for user auth.
*   **Input Validation:** Validate all user inputs from commands or interactions.
*   **Rate Limits:** Be mindful of Discord API rate limits. `discord.js` handles some, but complex interactions might need custom logic.
*   **Slash Commands are Preferred:** Prioritize Slash Commands over legacy prefix commands. They are more secure and user-friendly.
*   **Error Handling:** Implement robust error handling and provide user-friendly error messages in Discord.

## Platform Configuration
*   **React Frontend:** May offer UI to connect a Discord server (if bot needs specific server context beyond global commands) or manage notification preferences.
*   **Node.js Backend:** Stores `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (for OAuth) securely. Manages webhook URLs or bot command configurations.

By integrating Discord, the Autonomous Coding Agent can significantly enhance its reach and interactivity within developer communities. Always refer to the [Discord Developer Documentation](https://discord.com/developers/docs/intro) and [discord.js guide](https://discordjs.guide/).
