# Cloud Code Deployment (Serverless Functions)

This guide provides guidelines for integrating serverless functions (e.g., Firebase Functions, AWS Lambda, Google Cloud Functions, Azure Functions) with the Autonomous Coding Agent platform. Serverless functions are useful for running backend code in response to events, handling background jobs, or extending your API without managing traditional servers, especially for tasks related to AI processing or asynchronous operations.

## Overview

Serverless functions allow the Autonomous Coding Agent platform to:
*   **Extend API Functionality:** Create new, isolated API endpoints (e.g., for specific AI model interactions, webhook handlers) that can be called from the React frontend or the main Node.js backend.
*   **Handle Real-time Triggers:** Execute code in response to:
    *   Database changes (e.g., a new `WorkflowRun` document in PostgreSQL could trigger a notification function via a database trigger mechanism or a CDC event stream).
    *   File uploads to cloud storage (e.g., processing a newly uploaded codebase).
    *   Message queue events (e.g., an AI task completion message from BullMQ/Redis Streams).
*   **Run Background AI Jobs:** Perform computationally intensive or long-running AI tasks (e.g., batch code analysis, model fine-tuning if applicable, complex data processing for AI training) without burdening the main Node.js application server.
*   **Reduce Operational Overhead:** Cloud providers manage the underlying infrastructure, scaling, and availability for these functions.
*   **Pay-per-use:** Typically pay only for the execution time and resources consumed by functions, which can be cost-effective for spiky workloads.

Common Serverless Providers suitable for a Node.js ecosystem:
*   **AWS Lambda:** Integrates deeply with other AWS services. Excellent Node.js support. Often paired with API Gateway for HTTP endpoints.
*   **Google Cloud Functions (GCF):** Part of Google Cloud Platform. Strong Node.js support. Can be triggered by various GCP events or HTTP. Firebase Functions are built on GCF.
*   **Azure Functions:** Microsoft's serverless offering with good Node.js support.
*   **Firebase Functions:** Specifically for projects using Firebase services, built on Google Cloud Functions. Might be less relevant if the core platform isn't Firebase-centric, but useful for comparison.

## General Integration Steps

1.  **Choose a Provider:** Select based on existing cloud infrastructure (if any), cost, performance needs, and integration with other services your platform might use (e.g., if already using AWS S3, Lambda is a natural fit for S3 event triggers).
2.  **Set Up Development Environment:**
    *   Install necessary CLIs (e.g., AWS CLI, Google Cloud SDK, Azure CLI, Serverless Framework).
    *   Configure local environment for Node.js function development.
3.  **Write Function Code (Node.js):**
    *   Develop the logic, ensuring it can connect to necessary services (e.g., your PostgreSQL database, external AI APIs) using environment variables for configuration.
    *   The function handler will receive event data and a context object.
4.  **Define Triggers:** Specify what event triggers the function (HTTP, database, storage, queue).
5.  **Configure Permissions (IAM):** Grant the function IAM roles with the minimum necessary permissions to access other cloud resources (e.g., read/write to your PostgreSQL DB if it's cloud-hosted and accessible, call AI provider APIs).
6.  **Deploy the Function:** Use the provider's CLI or tools like Serverless Framework.
7.  **Test and Monitor:** Test thoroughly (locally and in the cloud) and set up logging/monitoring (e.g., CloudWatch, Google Cloud Logging/Monitoring).

## Integrating Specific Serverless Providers (Node.js Examples)

Given our hypothetical platform uses Node.js, AWS Lambda and Google Cloud Functions are strong contenders.

### 1. AWS Lambda (with Serverless Framework)

The Serverless Framework simplifies deploying and managing AWS Lambda functions.

**a. Setup:**
   *   Install AWS CLI and configure it with your credentials.
   *   Install Serverless Framework: `npm install -g serverless`
   *   In a new directory for your Lambda service (or a sub-directory in your monorepo): `serverless create --template aws-nodejs --path my-agent-lambda-service`

**b. Writing Functions (Example: Process AI Task from SQS, call OpenAI):**
   Assume an AI task is placed on an SQS queue by the main Node.js backend.

   `my-agent-lambda-service/handler.js`:
   ```javascript
   'use strict';
   // const OpenAI = require('openai'); // Assuming openai npm package

   // let openaiClient; // Initialize once if possible, or per invocation based on context

   module.exports.processAiTask = async (event) => {
     // Initialize OpenAI client (ideally outside handler for reuse if container is warm)
     // if (!openaiClient && process.env.OPENAI_API_KEY) {
     //   openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
     // }

     for (const record of event.Records) { // SQS events come in Records array
       const taskPayload = JSON.parse(record.body);
       console.log('Processing AI task:', taskPayload);

       try {
         // Example: Call OpenAI (replace with actual AI logic)
         // if (!openaiClient) throw new Error('OpenAI client not initialized or API key missing.');
         // const completion = await openaiClient.chat.completions.create({
         //   model: taskPayload.model || "gpt-3.5-turbo",
         //   messages: [{role: "user", content: taskPayload.prompt}],
         // });
         // const result = completion.choices[0].message.content;
         const result = `Mock AI result for prompt: ${taskPayload.prompt}`; // Mock result

         console.log(`AI Task ${taskPayload.taskId} completed. Result: ${result}`);
         // TODO: Store result back in PostgreSQL, or send notification
         // Example: Call platform API to update task status (requires API key/auth for Lambda)
         // await axios.post(`${process.env.PLATFORM_API_URL}/tasks/${taskPayload.taskId}/complete`, { result });

       } catch (error) {
         console.error(`Error processing AI task ${taskPayload.taskId}:`, error);
         // TODO: Implement error handling, e.g., move to Dead Letter Queue (DLQ)
         // For SQS, if the function errors, the message might be retried based on queue config.
       }
     }
     return { message: `${event.Records.length} SQS messages processed.` };
   };
   ```

   `my-agent-lambda-service/serverless.yml`:
   ```yaml
   service: autonomous-agent-tasks

   frameworkVersion: '3'

   provider:
     name: aws
     runtime: nodejs18.x # Or your preferred Node.js LTS
     region: us-east-1   # Your preferred region
     environment:
       OPENAI_API_KEY: ${env:OPENAI_API_KEY} # Injected from environment or AWS Secrets Manager
       PLATFORM_API_URL: ${env:PLATFORM_API_URL} # URL of your main platform API
       # DATABASE_URL: ${env:DATABASE_URL_FOR_LAMBDA} # If Lambda connects directly to DB
     iam:
       role:
         statements:
           # Permissions for Lambda to read from SQS
           - Effect: "Allow"
             Action:
               - "sqs:ReceiveMessage"
               - "sqs:DeleteMessage"
               - "sqs:GetQueueAttributes"
             Resource: "arn:aws:sqs:us-east-1:ACCOUNT_ID:YourAiTaskQueueName" # Specify SQS ARN
           # Optional: Permissions to write to CloudWatch Logs (usually default)
           # Optional: Permissions to access PostgreSQL if directly connecting
           # Optional: Permissions to call other AWS services or external APIs

   functions:
     aiTaskProcessor:
       handler: handler.processAiTask
       description: "Processes AI tasks from an SQS queue."
       events:
         - sqs:
             arn: "arn:aws:sqs:us-east-1:ACCOUNT_ID:YourAiTaskQueueName" # ARN of the SQS queue
             batchSize: 1 # Process one message at a time, or more for batching
             # enabled: true # Default is true
       # reservedConcurrency: 5 # Optional: Limit concurrent executions
       # timeout: 30 # Optional: Max execution time in seconds (default 6s for Node.js)
   ```

**c. Deployment:**
   ```bash
   # Ensure OPENAI_API_KEY, PLATFORM_API_URL etc. are set in your environment or use Serverless Framework's .env support or AWS Systems Manager Parameter Store for secrets.
   serverless deploy
   ```

### 2. Google Cloud Functions (GCF)

Can be used standalone or as part of Firebase.

**a. Setup:**
   *   Install Google Cloud SDK (`gcloud` CLI) and authenticate.
   *   Enable necessary APIs (Cloud Functions API, Cloud Build API).

**b. Writing Functions (Example: HTTP Trigger to call an AI model):**
   `index.js` (for GCF):
   ```javascript
   // const OpenAI = require('openai');
   // let openaiClient;

   /**
    * HTTP Cloud Function that proxies a request to an AI model.
    *
    * @param {Object} req Express request object.
    * @param {Object} res Express response object.
    */
   exports.invokeAiModel = async (req, res) => {
     // if (!openaiClient && process.env.OPENAI_API_KEY) {
     //   openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
     // }
     // if (!openaiClient) {
     //   console.error('OpenAI client not initialized or API key missing.');
     //   return res.status(500).send('AI service not configured.');
     // }

     const userPrompt = req.body.prompt;
     if (!userPrompt) {
       return res.status(400).send('Missing "prompt" in request body.');
     }

     try {
       // const completion = await openaiClient.chat.completions.create({
       //   model: req.body.model || "gpt-3.5-turbo",
       //   messages: [{ role: "user", content: userPrompt }],
       // });
       // const result = completion.choices[0].message.content;
       const result = `Mock AI result for HTTP prompt: ${userPrompt}`; // Mock

       res.status(200).json({ result });
     } catch (error) {
       console.error("Error invoking AI model:", error);
       res.status(500).send("Error processing your request with AI model.");
     }
   };
   ```
   `package.json`:
   ```json
   {
     "name": "gcf-agent-invoker",
     "version": "0.0.1",
     "main": "index.js",
     "dependencies": {
       "openai": "^4.0.0" // Example if using OpenAI directly
     }
   }
   ```

**c. Deployment (using `gcloud` CLI):**
   ```bash
   gcloud functions deploy invokeAiModel \
     --runtime nodejs18 \
     --trigger-http \
     --allow-unauthenticated \ # Or configure IAM for authentication
     --region your-gcp-region \
     --entry-point invokeAiModel \
     --env-vars-file .env.gcf.yaml # File containing environment variables
   ```
   `.env.gcf.yaml` example:
   ```yaml
   # OPENAI_API_KEY: "sk-xxxxxxxxxxxx"
   # PLATFORM_CALLBACK_SECRET: "some_secret_for_securing_callbacks_if_needed"
   ```

### 3. Azure Functions

Similar setup using Azure Functions Core Tools for Node.js. Functions can be triggered by HTTP, queues, timers, etc.

## Security Considerations for Serverless Functions

*   **Principle of Least Privilege (IAM):** Crucial. Grant functions *only* the IAM permissions they need to access specific resources (e.g., a particular SQS queue, specific S3 bucket paths, ability to call specific AI APIs if access is managed via cloud IAM).
*   **Secure Environment Variables:** Store API keys (like `OPENAI_API_KEY`), database credentials (if directly accessed), and other secrets using the provider's secret management (AWS Secrets Manager, Google Secret Manager, Azure Key Vault). Do not hardcode them.
*   **Input Validation:** Validate all data received from triggers (HTTP request bodies/params, SQS message content).
*   **Authentication & Authorization for HTTP Triggers:**
    *   Protect HTTP-triggered functions with an authentication mechanism (e.g., API Gateway authorizers in AWS, IAM for GCF, function keys or Easy Auth in Azure).
    *   Your main platform API can act as a proxy, authenticating the user first, then invoking the serverless function internally (e.g., via AWS SDK or HTTP call to a private API Gateway endpoint).
*   **Network Configuration (VPC/Private Networking):** If functions need to access resources in a private network (like your PostgreSQL database in a VPC), configure serverless VPC access.
*   **Dependency Management:** Keep Node.js dependencies up-to-date (`npm audit fix`).

## When to Use Serverless Functions with the Autonomous Coding Agent Platform

*   **Asynchronous AI Processing:** For AI tasks that take longer than a typical HTTP request timeout (e.g., >30 seconds), offload them to a serverless function triggered by a message queue (SQS, Pub/Sub). The main backend API places a job on the queue, the function processes it, and then updates the status/result in the PostgreSQL DB or sends a notification.
*   **Webhook Handlers:** If the platform needs to receive webhooks from external services (e.g., Git provider events, AI model training completion), a serverless HTTP function is an excellent, scalable way to handle these.
*   **Scheduled Tasks (Cron Jobs):** For periodic tasks like data cleanup, report generation, or triggering routine AI analyses (e.g., AWS Lambda with EventBridge Scheduler, GCF with Cloud Scheduler).
*   **Specific, Decoupled API Endpoints:** If a new, somewhat independent piece of functionality is needed that doesn't fit well into the main modular monolith, or needs to scale differently.
*   **Event-Driven Reactions:** Responding to file uploads (e.g., a new codebase uploaded to S3/GCS triggers an analysis function) or database events (if using CDC tools that can trigger functions).

By using serverless functions strategically, the Autonomous Coding Agent platform can enhance its scalability, responsiveness, and ability to integrate event-driven or asynchronous AI workflows.
