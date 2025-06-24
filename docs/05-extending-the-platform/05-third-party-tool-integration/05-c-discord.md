# Discord Integration

This guide covers how to integrate Discord with your platform, focusing on sending notifications, building Discord bots for interactive commands, and potentially Discord authentication.

## Overview

Integrating Discord allows your platform to:
*   **Send Notifications:** Post messages to Discord channels or direct messages (DMs) about platform events (e.g., new content, user achievements, system alerts).
*   **Create Interactive Bots:** Develop bots that users can interact with via commands in Discord servers to perform actions or retrieve information from your platform.
*   **Community Engagement:** Use Discord as a communication hub for your platform's user community.
*   **Discord Authentication (OAuth2):** Allow users to sign in or link their platform accounts using their Discord identity.

Key Discord API Features for Integration:
*   **Webhooks:** A simple way to send messages to Discord channels without a full bot.
*   **Discord Bots:** More powerful integrations using the Discord API via Gateway (for real-time events) and REST (for actions). Requires creating a Bot Application in the Discord Developer Portal.
*   **Slash Commands:** Modern way for users to interact with bots, offering auto-completion and structured inputs.
*   **OAuth2:** For authenticating users and obtaining permissions to act on their behalf or access their user information.

## 1. Discord Webhooks (Simple Notifications)

Webhooks are the easiest method for sending messages from your platform to a specific Discord channel.

### a. Setup in Discord:
1.  Open your Discord Server settings.
2.  Go to "Integrations".
3.  Click "Webhooks" > "New Webhook".
4.  Customize the webhook's name and choose the channel it will post to.
5.  Optionally, set an avatar.
6.  Copy the **Webhook URL**. This URL is sensitive; treat it like an API key.

### b. Sending Messages from Your Platform:
*   Store the Webhook URL securely in your platform's configuration.
*   To send a message, make an HTTP POST request to the Webhook URL with a JSON payload.

**Example (Node.js using `axios`):**
```javascript
// backend/services/discordNotificationService.js
const axios = require('axios');
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL; // Store securely

async function sendDiscordNotification(content, username = "Platform Bot", avatar_url = null, embeds = null) {
  if (!DISCORD_WEBHOOK_URL) {
    console.warn('Discord Webhook URL not configured. Skipping notification.');
    return;
  }

  const payload = {
    content: content, // Basic message content (Markdown supported)
    username: username,
  };

  if (avatar_url) {
    payload.avatar_url = avatar_url;
  }
  if (embeds && Array.isArray(embeds)) { // For richer messages
    payload.embeds = embeds;
  }

  try {
    await axios.post(DISCORD_WEBHOOK_URL, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('Discord notification sent successfully.');
  } catch (error) {
    console.error('Failed to send Discord notification:', error.response ? error.response.data : error.message);
  }
}

// Usage:
// sendDiscordNotification("A critical alert has been triggered on the platform!");
// sendDiscordNotification("New blog post published: 'My Awesome Title'", "Platform News", "your_avatar_url.png");

// Example with an Embed:
// const exampleEmbed = [{
//   title: "New User Signed Up!",
//   description: "Welcome user@example.com to the platform.",
//   color: 0x00AA00, // Hex color code (integer)
//   fields: [
//     { name: "User ID", value: "12345", inline: true },
//     { name: "Signup Date", value: new Date().toLocaleDateString(), inline: true }
//   ],
//   footer: { text: "Platform Notification System" }
// }];
// sendDiscordNotification(null, "Platform Bot", null, exampleEmbed); // Content can be null if only sending embeds
```

**Discord Message Formatting:**
*   Supports Markdown.
*   **Embeds:** For richer, structured messages. See [Discord Embed Structure](https://discord.com/developers/docs/resources/channel#embed-object). Use an online embed visualizer to help design them.

## 2. Building a Discord Bot

For interactive commands, event handling, and more complex interactions, create a Discord Bot Application.

### a. Create a Discord Application and Bot:
1.  Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2.  Click "New Application". Give it a name.
3.  Once created, navigate to the "Bot" tab in the left sidebar.
4.  Click "Add Bot" and confirm.
5.  **Bot Token:** You'll see an option to "Reset Token" or "View Token". This token is your bot's password. **Keep it secret and secure.** Store it in your platform's backend configuration.
6.  **Privileged Gateway Intents:** Depending on what your bot needs to do, you might need to enable Privileged Gateway Intents under the "Bot" tab:
    *   **Presence Intent:** For events related to user presence (online status, activity).
    *   **Server Members Intent:** For events related to members joining/leaving servers or member updates.
    *   **Message Content Intent:** **Crucial if your bot needs to read the content of messages** (e.g., for prefix commands like `!help`). This intent is becoming more restricted. Slash commands are preferred and often don't require this intent.
    *   *If your bot serves more than 100 servers, you'll need to apply for verification to use these intents.*

### b. Invite Your Bot to a Server:
1.  Go to the "OAuth2" > "URL Generator" tab in your application's settings.
2.  Under "Scopes", select `bot` and `applications.commands` (if using slash commands).
3.  Under "Bot Permissions", select the permissions your bot needs (e.g., "Send Messages", "Read Message History", "Embed Links").
4.  Copy the generated URL and paste it into your browser. Select a server to add the bot to (you need "Manage Server" permissions on that server).

### c. Using a Discord API Library:
Libraries like `discord.js` (JavaScript/Node.js), `discord.py` (Python), or `Javacord` (Java) simplify interacting with the Discord API.

**Example: Basic Discord Bot with `discord.js` v14 (Node.js)**

```bash
npm install discord.js dotenv
```
Create a `.env` file for your token:
```
DISCORD_BOT_TOKEN=your_bot_token_here
```

```javascript
// backend/services/discordBotService.js
const { Client, GatewayIntentBits, Events, InteractionType, REST, Routes } = require('discord.js');
require('dotenv').config(); // To load DISCORD_BOT_TOKEN from .env

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // Required for basic bot functionality
    GatewayIntentBits.GuildMessages, // Required to receive messages in guilds
    GatewayIntentBits.MessageContent, // REQUIRED TO READ MESSAGE CONTENT (enable in Dev Portal)
    GatewayIntentBits.GuildMembers, // If you need member information
  ],
});

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID; // Your Application ID from Dev Portal
const GUILD_ID = process.env.DISCORD_GUILD_ID; // Optional: Specific server ID for testing slash commands immediately

client.once(Events.ClientReady, c => {
  console.log(`🟢 Discord bot is ready! Logged in as ${c.user.tag}`);
  // registerSlashCommands(); // Call function to register slash commands
});

// Example: Responding to prefix commands (requires MessageContent intent)
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return; // Ignore messages from other bots

  if (message.content.toLowerCase() === '!ping') {
    await message.reply('Pong! 🏓');
  }

  if (message.content.toLowerCase() === '!platform-status') {
    // const status = await getPlatformStatusFromYourAPI();
    await message.channel.send(`Platform status: All systems operational!`);
  }
});

// Example: Handling Slash Commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return; // Only handle slash commands

  const { commandName } = interaction;

  if (commandName === 'ping') {
    await interaction.reply({ content: 'Pong from slash command!', ephemeral: true }); // ephemeral: only visible to user
  } else if (commandName === 'userinfo') {
    await interaction.reply(`Your tag: ${interaction.user.tag}\nYour ID: ${interaction.user.id}`);
  } else if (commandName === 'get-data') {
    const optionValue = interaction.options.getString('category'); // Get option value
    // const data = await fetchDataFromPlatform(optionValue);
    await interaction.reply(`You asked for data in category: ${optionValue}. Result: [platform_data_here]`);
  }
});


// --- Slash Command Registration (run once or when commands change) ---
const commands = [
  { name: 'ping', description: 'Replies with Pong!' },
  { name: 'userinfo', description: 'Displays your Discord user info.' },
  {
    name: 'get-data',
    description: 'Fetches data from the platform.',
    options: [
      {
        name: 'category',
        type: 3, // STRING type for ApplicationCommandOptionType.String
        description: 'The category of data to fetch.',
        required: true,
        choices: [ // Optional choices
            { name: 'Users', value: 'users' },
            { name: 'Posts', value: 'posts' },
        ]
      },
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

async function registerSlashCommands() {
  try {
    console.log('Started refreshing application (/) commands.');
    if (GUILD_ID) {
      // For fast testing on a specific server
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands },
      );
      console.log(`Successfully reloaded application (/) commands for guild ${GUILD_ID}.`);
    } else {
      // For global commands (can take up to an hour to propagate)
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands },
      );
      console.log('Successfully reloaded global application (/) commands.');
    }
  } catch (error) {
    console.error(error);
  }
}
// Call registerSlashCommands() when your bot starts or via a separate script.
// For production, you typically only run this when commands are updated.

// --- Start the Bot ---
// (async () => {
//   try {
//     if (!BOT_TOKEN) {
//       console.error("🔴 DISCORD_BOT_TOKEN is not set in .env file.");
//       return;
//     }
//     if (CLIENT_ID) await registerSlashCommands(); // Register commands if CLIENT_ID is set
//     await client.login(BOT_TOKEN);
//   } catch (error) {
//     console.error("🔴 Failed to start Discord bot:", error);
//   }
// })();

module.exports = client; // Export for use in your main server file
```
**To run this bot:**
1.  Ensure `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID` are in your `.env` file. `DISCORD_GUILD_ID` is optional for testing.
2.  Uncomment the `(async () => { ... })();` block or integrate `client.login(BOT_TOKEN)` and `registerSlashCommands()` into your platform's startup sequence.

### d. Slash Commands:
*   **Definition:** Defined via the Discord API (as shown in the `discord.js` example) or through the Developer Portal ("App Settings" > "Integrations" > Configure Bot > Add commands).
*   **Global vs. Guild Commands:** Guild commands update instantly for a specific server (good for testing). Global commands work on all servers the bot is in but can take up to an hour to propagate.
*   **Handling:** Your bot listens for `interactionCreate` events and checks if `interaction.isChatInputCommand()`.

### e. Buttons, Select Menus, Modals (Message Components & Interactions):
Discord allows adding interactive components to messages.
*   **Sending Components:** Include them in the `components` array of your message payload.
*   **Handling Interactions:** Listen for `interactionCreate` events and check `interaction.isButton()`, `interaction.isStringSelectMenu()`, etc. Each component has a `customId` you define, which you use to identify it in your interaction handler.
*   **Modals:** Can be opened in response to a command or component interaction to gather more structured input from users.

```javascript
// Example sending a button (discord.js)
// const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
// const row = new ActionRowBuilder()
//   .addComponents(
//     new ButtonBuilder()
//       .setCustomId('primary_action_button')
//       .setLabel('Click Me!')
//       .setStyle(ButtonStyle.Primary),
//   );
// await message.channel.send({ content: 'Here is a button:', components: [row] });

// Handling button interaction (discord.js)
// client.on(Events.InteractionCreate, async interaction => {
//   if (!interaction.isButton()) return;
//   if (interaction.customId === 'primary_action_button') {
//     await interaction.reply({ content: 'You clicked the button!', ephemeral: true });
//   }
// });
```

## 3. Discord OAuth2 (User Authentication)

Allow users to log into your platform or link their Discord account.

### a. Setup in Discord Developer Portal:
1.  In your Discord Application settings, go to "OAuth2" > "General".
2.  Add **Redirect URIs** (e.g., `https://your-platform.com/auth/discord/callback`). This is where Discord will send the user after they authorize.
3.  Note your **Client ID** and **Client Secret**. Store the Client Secret securely.

### b. OAuth2 Flow:
Similar to Google OAuth2:
1.  **Redirect User to Discord:** Your platform redirects the user to a Discord authorization URL.
    *   URL: `https://discord.com/api/oauth2/authorize`
    *   Parameters:
        *   `client_id`: Your app's Client ID.
        *   `redirect_uri`: Your registered redirect URI.
        *   `response_type=code`.
        *   `scope`: Space-separated list of scopes (e.g., `identify email guilds guilds.join`). See [Discord OAuth2 Scopes](https://discord.com/developers/docs/topics/oauth2#shared-resources-oauth2-scopes).
2.  **User Authorizes:** User logs into Discord and approves the requested permissions.
3.  **Discord Redirects Back:** Discord sends the user to your `redirect_uri` with an `authorization_code`.
4.  **Exchange Code for Tokens:** Your backend makes a POST request to `https://discord.com/api/oauth2/token` with:
    *   `client_id`, `client_secret`, `grant_type=authorization_code`, `code`, `redirect_uri`.
5.  **Receive and Use Tokens:** Discord responds with `access_token`, `refresh_token`, `expires_in`, `scope`.
    *   Use the `access_token` to make API calls on behalf of the user (e.g., fetch user profile: `GET https://discord.com/api/users/@me` with `Authorization: Bearer ACCESS_TOKEN`).
    *   Store tokens securely. Refresh `access_token` using `refresh_token` when it expires.

[**Provide backend code examples for the OAuth2 flow, similar to the Google Services guide.**]

## Security and Best Practices

*   **Secure Your Bot Token and Client Secret:** Never expose them in client-side code or commit them to version control. Use environment variables or secret management.
*   **Permissions (Intents & Scopes):** Only request the intents and OAuth scopes your bot/app absolutely needs.
*   **Input Validation:** Validate any input from users (command arguments, modal fields).
*   **Rate Limits:** Discord API has rate limits. Handle them gracefully (libraries often do this, but be aware). See [Discord API Rate Limits](https://discord.com/developers/docs/topics/rate-limits).
*   **Error Handling:** Implement robust error handling in your bot's code.
*   **Slash Commands are Preferred:** For new bots, prioritize slash commands over message content/prefix commands as they are more user-friendly, secure (don't always need Message Content intent), and better integrated into Discord.
*   **User Privacy:** Be clear about what data your bot collects or stores.

## Platform Configuration

Your platform will need settings for administrators to:
*   Input the Discord Bot Token.
*   Input Discord Client ID and Client Secret (if using OAuth2).
*   Configure default channels for webhook notifications or bot announcements.
*   Enable/disable specific bot features or commands.

By following this guide and consulting the [Discord Developer Documentation](https://discord.com/developers/docs/intro), you can create powerful and engaging Discord integrations for your platform. Remember to choose the right tools (webhooks vs. full bot) based on your needs.
