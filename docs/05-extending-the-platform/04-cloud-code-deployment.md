# Cloud Code Deployment (Serverless Functions)

This guide provides guidelines for integrating serverless functions (e.g., Firebase Functions, AWS Lambda, Google Cloud Functions, Azure Functions) with the platform. Serverless functions are useful for running backend code in response to events, handling background jobs, or extending your API without managing traditional servers.

## Overview

Serverless functions allow you to:
*   **Extend API Functionality:** Create new API endpoints or microservices that can be called from your frontend or other backend services.
*   **Handle Real-time Triggers:** Execute code in response to database changes (e.g., Firestore triggers, DynamoDB streams), file uploads (e.g., S3 events, Cloud Storage events), message queue events, or custom events.
*   **Run Background Jobs:** Perform tasks like image processing, data aggregation, sending notifications, or scheduled tasks (cron jobs) without burdening your main application server.
*   **Reduce Operational Overhead:** Cloud providers manage the underlying infrastructure, scaling, and availability.
*   **Pay-per-use:** You typically pay only for the execution time and resources consumed by your functions.

Common Serverless Providers:
*   **AWS Lambda:** Integrates deeply with other AWS services. Supports multiple runtimes.
*   **Google Cloud Functions:** Part of Google Cloud Platform, integrates with Firebase and other GCP services.
*   **Azure Functions:** Microsoft's serverless offering, integrates with Azure services.
*   **Firebase Functions:** Built on Google Cloud Functions, tightly integrated with Firebase services (Firestore, Authentication, Storage, etc.), making it very convenient for Firebase-centric applications.

## General Integration Steps

1.  **Choose a Provider:** Select a serverless provider that best fits your existing cloud ecosystem, technical expertise, and feature requirements.
2.  **Set Up Development Environment:**
    *   Install the necessary CLI tools for your chosen provider (e.g., AWS CLI, Google Cloud SDK/Firebase CLI, Azure CLI).
    *   Configure your local environment for function development (e.g., Node.js for Firebase/Google Cloud Functions, Python/Node.js/Java/etc. for AWS Lambda/Azure Functions).
3.  **Write Your Function Code:** Develop the logic for your serverless function. This typically involves:
    *   An entry point (handler function) that receives event data and context.
    *   Business logic.
    *   Interaction with other services (databases, APIs, storage).
4.  **Define Triggers:** Specify what event will trigger your function (e.g., HTTP request, database write, file upload, message queue).
5.  **Configure Permissions (IAM):** Grant your function the necessary permissions to access other cloud resources (e.g., read/write to a database, access a storage bucket).
6.  **Deploy the Function:** Use the provider's CLI or web console to deploy your function code and configuration.
7.  **Test and Monitor:** Test your function thoroughly and set up logging and monitoring to track its execution and identify issues.

## Integrating Specific Serverless Providers

### 1. Firebase Functions (using Google Cloud Functions)

Firebase Functions are excellent for applications already using Firebase services. They are written in Node.js (JavaScript or TypeScript).

**a. Setup:**
   *   Ensure you have a Firebase project.
   *   Install Firebase CLI: `npm install -g firebase-tools`
   *   Login: `firebase login`
   *   Initialize Firebase Functions in your project directory: `firebase init functions`
     (Choose JavaScript or TypeScript, select linters/etc.)
   This creates a `functions` directory with `index.js` (or `index.ts`), `package.json`, etc.

**b. Writing Functions (Example: HTTP Trigger & Firestore Trigger):**
   File: `functions/index.js` or `functions/src/index.ts`

   ```javascript
   // functions/index.js
   const functions = require("firebase-functions");
   const admin = require("firebase-admin"); // For accessing Firestore, Auth, etc.
   admin.initializeApp();

   // Example 1: HTTP Callable Function (can be called directly from client SDK)
   exports.addMessage = functions.https.onCall(async (data, context) => {
     // Check authentication (context.auth will be populated if called from an authenticated client)
     if (!context.auth) {
       throw new functions.https.HttpsError(
         "unauthenticated",
         "The function must be called while authenticated."
       );
     }
     const text = data.text; // Data passed from the client
     // You can perform validation on 'text' here

     try {
       const writeResult = await admin.firestore().collection("messages").add({
         text: text,
         authorUid: context.auth.uid,
         createdAt: admin.firestore.FieldValue.serverTimestamp(),
       });
       return { messageId: writeResult.id, status: "success" };
     } catch (error) {
       console.error("Error adding message:", error);
       throw new functions.https.HttpsError("internal", "Error writing to Firestore.", error.message);
     }
   });

   // Example 2: HTTP Request Function (standard HTTPS endpoint)
   exports.helloWorld = functions.https.onRequest((request, response) => {
     functions.logger.info("Hello logs!", {structuredData: true}); // Structured logging
     response.send(`Hello from Firebase! You sent: ${request.query.name || 'nothing'}`);
   });

   // Example 3: Firestore Trigger (runs when a new document is created in 'users' collection)
   exports.sendWelcomeEmail = functions.firestore
     .document("users/{userId}")
     .onCreate(async (snap, context) => {
       const newUser = snap.data();
       const userId = context.params.userId;

       const email = newUser.email;
       const displayName = newUser.displayName || "User";

       functions.logger.log(`New user created: ${userId}, email: ${email}`);
       // Here you would integrate with an email sending service (e.g., SendGrid, Mailgun)
       // For example: await sendEmail(email, "Welcome!", `Hello ${displayName}, welcome to our platform!`);
       // Make sure to handle API keys for email services securely (e.g., using environment configuration)
       return null; // Or a promise if doing async work
     });

   // Example 4: Scheduled Function (runs every day at 5 AM)
   exports.scheduledCleanup = functions.pubsub
     .schedule("every day 05:00")
     .timeZone("America/New_York") // Optional: set timezone
     .onRun(async (context) => {
       functions.logger.log("Running scheduled cleanup task!");
       // Add your cleanup logic here (e.g., delete old data from Firestore)
       // const oldDataQuery = admin.firestore().collection('logs').where('timestamp', '<', oneWeekAgo);
       // const snapshot = await oldDataQuery.get();
       // const batch = admin.firestore().batch();
       // snapshot.docs.forEach(doc => batch.delete(doc.ref));
       // await batch.commit();
       return null;
     });
   ```
   [**Provide TypeScript examples if relevant.**]

**c. Environment Configuration (for API keys, etc.):**
   Use Firebase environment configuration for sensitive data:
   ```bash
   firebase functions:config:set someservice.key="THE API KEY" someservice.id="THE ID"
   firebase functions:config:set sendgrid.key="YOUR_SENDGRID_API_KEY"
   ```
   Access in code: `functions.config().someservice.key`

**d. Deployment:**
   ```bash
   firebase deploy --only functions
   # Deploy a specific function:
   # firebase deploy --only functions:addMessage,functions:sendWelcomeEmail
   ```

**e. Calling Functions from Client/Platform:**
   *   **Callable Functions:** Use Firebase Client SDKs (`firebase.functions().httpsCall('addMessage', { text: 'Hello!' })`). Handles authentication context automatically.
   *   **HTTP Request Functions:** Call the provided URL like any other HTTP endpoint.

### 2. AWS Lambda

AWS Lambda supports various runtimes (Node.js, Python, Java, Go, Ruby, .NET). Often used with API Gateway for HTTP triggers or integrated with S3, DynamoDB, SQS, etc.

**a. Setup:**
   *   Install AWS CLI and configure it.
   *   Serverless Framework (`npm install -g serverless`) is highly recommended for managing Lambda deployments.

**b. Writing Functions (Example: Node.js with Serverless Framework):**
   Project structure with Serverless Framework:
   ```
   my-lambda-service/
   ├── serverless.yml        # Serverless Framework configuration
   ├── handler.js            # Your function code
   └── package.json
   ```

   `serverless.yml` (Example):
   ```yaml
   service: my-lambda-service

   frameworkVersion: '3'

   provider:
     name: aws
     runtime: nodejs18.x
     region: us-east-1 # Specify your region
     iam: # Define permissions for your Lambda function
       role:
         statements:
           - Effect: "Allow"
             Action:
               - "s3:GetObject"
             Resource: "arn:aws:s3:::your-bucket-name/*"
           - Effect: "Allow"
             Action:
               - "dynamodb:Query"
               - "dynamodb:Scan"
               - "dynamodb:GetItem"
               - "dynamodb:PutItem"
             Resource: "arn:aws:dynamodb:us-east-1:*:table/your-table-name"
     environment: # Environment variables
       MY_VARIABLE: 'some_value'
       STRIPE_SECRET_KEY: ${env:STRIPE_SECRET_KEY} # Reference environment variables from your system

   functions:
     hello:
       handler: handler.hello # Points to hello function in handler.js
       description: "A simple hello world function"
       events:
         - httpApi: # Creates an API Gateway HTTP API trigger
             path: /hello
             method: get
     processS3Event:
       handler: handler.processS3Event
       description: "Processes new objects in S3 bucket"
       events:
         - s3:
             bucket: your-bucket-name # Replace with your bucket name
             event: s3:ObjectCreated:*
             # rules: # Optional rules
             #  - prefix: uploads/
             #  - suffix: .jpg
   ```

   `handler.js` (Example):
   ```javascript
   'use strict';

   module.exports.hello = async (event) => {
     // event contains request data for HTTP triggers (queryStringParameters, body, etc.)
     console.log("Received event:", JSON.stringify(event, null, 2));
     const name = event.queryStringParameters && event.queryStringParameters.name;
     return {
       statusCode: 200,
       body: JSON.stringify(
         {
           message: `Hello ${name || 'World'}! Your function executed successfully!`,
           input: event,
         },
         null,
         2
       ),
     };
   };

   module.exports.processS3Event = async (event) => {
     // event contains S3 event data (e.g., bucket name, object key)
     console.log("Processing S3 event:", JSON.stringify(event, null, 2));
     for (const record of event.Records) {
       const bucketName = record.s3.bucket.name;
       const objectKey = record.s3.object.key;
       console.log(`New object created in ${bucketName}: ${objectKey}`);
       // Add your processing logic here (e.g., image resizing, data extraction)
     }
     return { message: "S3 event processed successfully." };
   };
   ```

**c. Deployment (with Serverless Framework):**
   ```bash
   serverless deploy
   ```

**d. Environment Variables:**
   Set in `serverless.yml` or use services like AWS Systems Manager Parameter Store or AWS Secrets Manager for sensitive data, then reference them.

### 3. Google Cloud Functions

Similar to Firebase Functions (as Firebase uses GCP infrastructure) but can be used independently of Firebase.

**a. Setup:**
   *   Install Google Cloud SDK (`gcloud` CLI) and configure it.

**b. Writing Functions (Example: Node.js - HTTP Trigger):**
   `index.js`:
   ```javascript
   /**
    * HTTP Cloud Function.
    *
    * @param {Object} req Cloud Function request context.
    * @param {Object} res Cloud Function response context.
    */
   exports.helloHttp = (req, res) => {
     const name = req.query.name || req.body.name || 'World';
     console.log(`Received request for: ${name}`);
     res.status(200).send(`Hello ${name}!`);
   };
   ```
   `package.json`:
   ```json
   {
     "name": "gcp-hello-world",
     "version": "0.0.1",
     "dependencies": {}
   }
   ```

**c. Deployment (using `gcloud` CLI):**
   ```bash
   gcloud functions deploy helloHttp \
     --runtime nodejs18 \
     --trigger-http \
     --allow-unauthenticated \
     --region your-region \
     --entry-point helloHttp
   ```
   (For authenticated functions, configure `--no-allow-unauthenticated` and set up IAM).

   For other triggers (e.g., Pub/Sub, Cloud Storage):
   ```bash
   gcloud functions deploy myStorageFunction \
     --runtime nodejs18 \
     --trigger-resource YOUR_BUCKET_NAME \
     --trigger-event google.storage.object.finalize \
     --region your-region \
     --entry-point processStorageEvent
   ```

### 4. Azure Functions

Supports multiple languages. Can be developed with Azure Functions Core Tools or directly in the Azure portal.

**a. Setup:**
   *   Install Azure CLI and Azure Functions Core Tools (`npm install -g azure-functions-core-tools@4 --unsafe-perm true`).

**b. Writing Functions (Example: Node.js - HTTP Trigger):**
   Project Structure (created with `func init MyAzureFunctionProj --worker-runtime node --language javascript` and `func new --template "HTTP trigger" --name MyHttpTrigger`):
   ```
   MyAzureFunctionProj/
   ├── MyHttpTrigger/
   │   ├── function.json  # Trigger bindings and configuration
   │   └── index.js       # Function code
   ├── host.json
   └── package.json
   └── local.settings.json # For local development settings (not deployed)
   ```

   `MyHttpTrigger/function.json`:
   ```json
   {
     "bindings": [
       {
         "authLevel": "function", // or "anonymous", "admin"
         "type": "httpTrigger",
         "direction": "in",
         "name": "req",
         "methods": ["get", "post"]
       },
       {
         "type": "http",
         "direction": "out",
         "name": "res"
       }
     ],
     "scriptFile": "../MyHttpTrigger/index.js" // Relative path from where func host starts
   }
   ```

   `MyHttpTrigger/index.js`:
   ```javascript
   module.exports = async function (context, req) {
       context.log('JavaScript HTTP trigger function processed a request.');

       const name = (req.query.name || (req.body && req.body.name));
       const responseMessage = name
           ? "Hello, " + name + ". This HTTP triggered function executed successfully."
           : "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.";

       context.res = {
           // status: 200, /* Defaults to 200 */
           body: responseMessage
       };
   }
   ```

**c. Deployment:**
   ```bash
   # Login to Azure
   az login
   # Deploy (assuming you've created a Function App in Azure)
   func azure functionapp publish <YourFunctionAppName>
   ```

## Security Considerations for Serverless Functions

*   **Principle of Least Privilege:** Grant functions only the IAM permissions they absolutely need.
*   **Input Validation:** Always validate data received from triggers (HTTP requests, event payloads).
*   **Secure Environment Variables:** Store API keys, database credentials, and other secrets securely using the provider's secret management services (e.g., AWS Secrets Manager, Google Secret Manager, Azure Key Vault, Firebase Functions config).
*   **Authentication & Authorization:**
    *   For HTTP-triggered functions, implement authentication (e.g., API keys, JWT tokens, OAuth) and authorization logic.
    *   Firebase Callable Functions handle Firebase Auth context automatically.
    *   Cloud providers offer IAM mechanisms to control who can invoke functions.
*   **Dependency Management:** Keep function dependencies up-to-date and scan for vulnerabilities.
*   **Logging and Monitoring:** Implement comprehensive logging and monitoring to detect and respond to security incidents or errors.

## When to Use Serverless Functions with Your Platform

*   **Event-driven tasks:** Processing file uploads, reacting to database changes, sending notifications.
*   **Asynchronous background jobs:** Report generation, data aggregation, sending bulk emails.
*   **Scheduled tasks (cron jobs):** Regular cleanup, data synchronization.
*   **API extensions/microservices:** Adding specific, decoupled API endpoints without modifying the core backend monolith (if you have one).
*   **Third-party integrations:** Handling webhooks from external services.
*   **Rapid prototyping:** Quickly building and deploying backend logic.

By leveraging serverless functions, you can extend your platform's capabilities in a scalable, cost-effective, and operationally efficient manner. Choose the provider and integration patterns that best suit your platform's architecture and needs.
