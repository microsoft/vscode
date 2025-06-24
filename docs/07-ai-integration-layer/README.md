# AI Integration Layer

This guide describes the design and implementation of the AI Integration Layer within the Autonomous Coding Agent platform's Node.js backend. This layer, referred to as the `AIServiceProxy` module in the System Architecture, is crucial for embedding, calling, and managing interactions with various AI agents and models (e.g., OpenAI, Anthropic, Hugging Face, custom models).

## Overview

The `AIServiceProxy` module acts as a centralized abstraction layer for all AI-related functionalities. Its primary goals are:
*   **Standardize Interactions:** Provide a consistent interface for the `WorkflowEngine` and other backend services to interact with diverse AI models.
*   **Simplify Integration & Swappability:** Make it easy to add new AI providers or models, or switch between them with minimal code changes in the core application logic.
*   **Manage Credentials Securely:** Centralize the management of API keys and authentication details for various AI services, using environment variables and the platform's secret management strategy.
*   **Handle Common AI Tasks:** Encapsulate logic for:
    *   Request formatting tailored to each AI provider.
    *   Response parsing and standardization.
    *   Error handling, including provider-specific errors and retry mechanisms.
    *   Basic response caching or deduplication (optional).
*   **Facilitate Advanced AI Features:**
    *   **Prompt Management & Templating:** Manage and version prompts, allowing dynamic data insertion.
    *   **Model Selection Logic:** Route requests to appropriate models based on task type, user preference, or cost/performance considerations.
    *   **Asynchronous Task Handling:** Interface with the message queue (e.g., BullMQ/Redis Streams) for long-running AI tasks.
    *   **Webhook Handling:** (If AI providers use webhooks for async task completion) Provide endpoints to receive and process these notifications.
*   **Monitor and Log AI Interactions:** Track AI service usage (e.g., token counts), performance (latency, error rates), and potentially costs via the `TelemetryLogger`.

## Core Components of the `AIServiceProxy` Module (Node.js)

[**A diagram could show: WorkflowEngine -> AIServiceProxy -> [OpenAIConnector, AnthropicConnector, CustomModelConnector] -> External AI APIs. Also, AIServiceProxy <-> MessageQueue <-> AIWorkerService (conceptual).**]

1.  **Main Proxy Service (`aiServiceProxy.js`):**
    *   The primary interface exposed to other backend modules.
    *   Contains methods like `generateCode(prompt, modelConfig)`, `analyzeSnippet(code, analysisType)`, etc.
    *   Implements model selection logic.
    *   Routes requests to the appropriate specific AI service connector.

2.  **AI Service Connectors (e.g., `openaiConnector.js`, `anthropicConnector.js`):**
    *   Individual modules within `AIServiceProxy`, each dedicated to a specific AI provider (OpenAI, Anthropic, Hugging Face) or a category of custom models.
    *   **Responsibilities:**
        *   Handle API authentication for the specific service (using API keys from environment variables like `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).
        *   Format requests according to the provider's API specification.
        *   Make HTTP calls (using `axios` or provider-specific SDKs like `openai` npm package).
        *   Parse responses and transform them into a standardized internal format.
        *   Handle provider-specific error codes and implement retry logic.
    *   Example: `openaiConnector.js` would use the `openai` library to interact with GPT models.

3.  **Configuration Management (Leveraging Core Config):**
    *   API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) are stored as environment variables and accessed via `process.env` or a central config service.
    *   Model IDs, endpoint URLs for custom models, and other AI service parameters are also configured via environment variables.

4.  **Prompt Management & Templating Engine (`promptManager.js` - Conceptual):**
    *   Stores and versions prompts for different AI tasks (e.g., "generate unit tests for this function," "refactor this code for readability").
    *   Uses a simple templating engine (e.g., Handlebars, or even basic string interpolation) to insert dynamic context (like user code, project details) into prompts.
    *   Example:
        ```javascript
        // const prompts = {
        //   GENERATE_UNIT_TEST: "Generate Jest unit tests for the following {{language}} function:\n```{{language}}\n{{code}}\n```\nEnsure comprehensive coverage.",
        // };
        // function getPrompt(templateName, context) { /* ... renders template ... */ }
        ```

5.  **Asynchronous Task Dispatcher (Integration with Message Queue):**
    *   For long-running AI tasks, the `AIServiceProxy` (or a specific connector) will publish a job to the message queue (e.g., BullMQ backed by Redis).
    *   The job payload includes the prompt, model configuration, `WorkflowRun` ID, and any other necessary context.
    *   Dedicated worker services (potentially running as separate Node.js processes or serverless functions) consume these jobs, execute the AI task via the appropriate connector, and then update the `WorkflowRun` in PostgreSQL with the results.

6.  **Response Handler & Standardizer:**
    *   Each connector is responsible for parsing the specific AI provider's response.
    *   The `AIServiceProxy` may define a standard internal format for AI-generated content (e.g., `{ type: 'code', language: 'javascript', content: '...', explanation: '...' }`) to ensure consistency for the `WorkflowEngine` and frontend.

7.  **Webhook Handler (Conceptual - if needed for specific AI services):**
    *   If an AI service (e.g., for model fine-tuning) uses webhooks to notify task completion, dedicated Express routes would be set up.
    *   These routes would validate the webhook (e.g., signature verification), parse the payload, and trigger actions like updating a `WorkflowRun` status.

## Integrating Specific AI Services (Node.js Examples)

### 1. OpenAI Connector (`openaiConnector.js`)
```javascript
// server/src/modules/aiServiceProxy/connectors/openaiConnector.js
const OpenAI = require('openai');
// const { TelemetryLogger } = require('../../../core/logger'); // Assuming core logger

let openaiClient;

function getOpenAIClient() {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key (OPENAI_API_KEY) is not configured.');
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

async function generateChatCompletion(messages, modelOptions = {}) {
  const client = getOpenAIClient();
  const model = modelOptions.model || "gpt-3.5-turbo"; // Default model
  try {
    // TelemetryLogger.info({ message: 'Sending request to OpenAI ChatCompletion', model, messagesCount: messages.length });
    const startTime = Date.now();
    const completion = await client.chat.completions.create({
      model: model,
      messages: messages, // e.g., [{role: "system", content: "..."}, {role: "user", content: "..."}]
      temperature: modelOptions.temperature || 0.7,
      max_tokens: modelOptions.max_tokens || 2048,
      // ... other valid OpenAI options
    });
    const duration = Date.now() - startTime;
    // TelemetryLogger.info({
    //   message: 'Received response from OpenAI ChatCompletion',
    //   model,
    //   durationMs: duration,
    //   usage: completion.usage
    // });
    // TODO: Track token usage (completion.usage.prompt_tokens, completion.usage.completion_tokens) for cost analysis

    return completion.choices[0].message.content?.trim();
  } catch (error) {
    // TelemetryLogger.error({ message: 'OpenAI API Error', error: error.message, model });
    // Handle specific OpenAI error types (e.g., rate limits, auth errors, content policy violations)
    throw error; // Re-throw for AIServiceProxy to handle or standardize
  }
}
module.exports = { generateChatCompletion };
```

### 2. Anthropic Connector (`anthropicConnector.js` - Conceptual)
```javascript
// server/src/modules/aiServiceProxy/connectors/anthropicConnector.js
const Anthropic = require('@anthropic-ai/sdk'); // Assuming official SDK
// const { TelemetryLogger } = require('../../../core/logger');

let anthropicClient;

function getAnthropicClient() {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key (ANTHROPIC_API_KEY) is not configured.');
    }
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

async function generateCompletionAnthropic(prompt, modelOptions = {}) {
  const client = getAnthropicClient();
  const model = modelOptions.model || "claude-2"; // Example model
  try {
    // TelemetryLogger.info({ message: 'Sending request to Anthropic', model });
    const response = await client.completions.create({
      model: model,
      prompt: `\n\nHuman: ${prompt}\n\nAssistant:`, // Anthropic's required prompt format
      max_tokens_to_sample: modelOptions.max_tokens || 2048,
      temperature: modelOptions.temperature || 0.7,
      // ... other Anthropic options
    });
    // TelemetryLogger.info({ message: 'Received response from Anthropic', model });
    // TODO: Track token usage if API provides it
    return response.completion?.trim();
  } catch (error) {
    // TelemetryLogger.error({ message: 'Anthropic API Error', error: error.message, model });
    throw error;
  }
}
module.exports = { generateCompletionAnthropic };
```

### 3. Custom Model Connector (Generic REST API)
Refer to the example in `docs/05-extending-the-platform/05-third-party-tool-integration/05-e-custom-enterprise-tools.md` for `CustomModelConnector` using `axios`. The `AIServiceProxy` would call methods from such a connector.

## Asynchronous AI Task Handling via Message Queue

1.  **Task Submission (by `WorkflowEngine` to `AIServiceProxy`):**
    The `AIServiceProxy` receives a request for a long-running AI task.
2.  **Job Creation (`AIServiceProxy`):**
    *   It constructs a job payload (prompt, model config, `WorkflowRun` ID, user ID).
    *   Adds the job to a BullMQ queue (e.g., `ai-coding-tasks-queue`).
    *   Updates the `WorkflowRun` status in PostgreSQL to "Queued" or "Processing".
    *   Returns a job ID or acknowledgment to the `WorkflowEngine`.
3.  **Job Consumption (AI Worker Service - separate Node.js process or Serverless Function):**
    *   A BullMQ worker process listens to the `ai-coding-tasks-queue`.
    *   When a job is received, the worker:
        *   Calls the appropriate method in `AIServiceProxy` (or directly a specific connector) to execute the AI inference. This call within the worker would be synchronous from the worker's perspective but handles the actual (potentially long) AI API call.
        *   Handles retries and errors.
        *   Upon completion/failure, updates the `WorkflowRun` in PostgreSQL with the result or error.
        *   Optionally, emits an event (e.g., via Redis Pub/Sub or another mechanism) that the `NotificationService` can pick up to inform the frontend via WebSockets.

## Result Interpretation and Post-processing
*   The `AIServiceProxy` or the `WorkflowEngine` can be responsible for post-processing.
*   **Standardization:** Ensure AI outputs (code, explanations, error messages) are mapped to a consistent schema before storing in `WorkflowRun` or sending to the frontend.
*   **Content Moderation:** For AI-generated text or code that might be user-visible, consider passing it through a moderation API (e.g., OpenAI's Moderation endpoint) as a step in the `AIServiceProxy` or `WorkflowEngine`.
*   **Code Validation/Linting:** AI-generated code might be passed through basic linters or formatters as a post-processing step.

## Best Practices
*   **Abstraction & Generic Interfaces:** The `WorkflowEngine` should interact with `AIServiceProxy` through generic methods (e.g., `executeGenerativeTask(taskDetails)`), abstracting away the specific AI provider.
*   **Configuration-Driven Model Selection:** Allow selection of AI models (GPT-4, Claude, specific fine-tuned models) via configuration (user settings, project settings, or workflow definitions) rather than hardcoding in the `AIServiceProxy`.
*   **Robust Error Handling:** Implement comprehensive error handling for API calls, including retries with exponential backoff, and clear logging of errors.
*   **Security:** Securely manage all AI provider API keys using environment variables and appropriate secret management for production. Redact sensitive data from logs.
*   **Cost Management & Monitoring:**
    *   Integrate token usage tracking from AI providers into `TelemetryLogger`.
    *   Implement caching for identical, expensive AI requests if applicable (e.g., caching embeddings).
    *   Provide mechanisms or alerts for high AI usage if cost is a concern.
*   **Testability:** Design connectors and the proxy layer to be testable, allowing mocks for external AI APIs during unit/integration testing.

By implementing a dedicated AI Integration Layer (`AIServiceProxy`), the Autonomous Coding Agent platform can efficiently manage and scale its interactions with a diverse and evolving range of AI models and services.
