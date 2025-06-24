# API Documentation (Swagger/OpenAPI)

Comprehensive, accurate, and easy-to-use API documentation is crucial for developers building on or integrating with your platform. This guide outlines the strategy for generating and maintaining API documentation, preferably using Swagger/OpenAPI standards.

## Overview

*   **Purpose:** To provide a clear, interactive, and machine-readable description of your platform's APIs. This includes all exposed endpoints, request/response formats, authentication methods, parameters, and error codes.
*   **Standard:** **OpenAPI Specification (OAS)** (formerly Swagger Specification) is the industry standard for describing RESTful APIs.
    *   Version 3.x (OAS3) is the latest major version.
*   **Benefits of OpenAPI:**
    *   **Interactive Documentation:** Tools like Swagger UI and Redoc can generate user-friendly, interactive API docs where users can try out API calls directly from their browser.
    *   **Client SDK Generation:** Many tools can auto-generate client libraries in various programming languages from an OpenAPI specification.
    *   **Server Stub Generation:** Can be used to generate boilerplate server code.
    *   **API Design & Consistency:** Promotes a design-first or contract-first approach to API development.
    *   **Automated Testing:** Enables automated testing of API endpoints against their specification.

## API Documentation Strategy

The goal is to have auto-generated or semi-auto-generated OpenAPI documentation that stays in sync with the actual API implementation.

### 1. Choosing a Generation Method:

There are several approaches to generating an OpenAPI specification:

**a. Code-First (Annotations/Decorators):**
*   **How it works:** Developers add annotations or decorators directly in the API controller/handler code (e.g., in Node.js with libraries like `swagger-jsdoc` or `nestjs/swagger`, Python with `drf-spectacular` for Django or `FastAPI`'s built-in support, Java with SpringFox or MicroProfile OpenAPI).
*   **Process:** A build step or runtime process scans this code and generates the `openapi.json` or `openapi.yaml` file.
*   **Pros:**
    *   Documentation lives close to the code, making it more likely to be updated by developers.
    *   Can be very accurate if annotations are done correctly.
*   **Cons:**
    *   Can clutter code with documentation-specific annotations.
    *   Requires discipline from developers to keep annotations up-to-date and comprehensive.
    *   Might require specific libraries tied to your framework.

**b. Design-First (Manual or GUI Tool):**
*   **How it works:** The OpenAPI specification is written manually in YAML or JSON, or designed using a visual tool (e.g., Swagger Editor, Stoplight, Postman API Builder).
*   **Process:** The API implementation then adheres to this pre-defined contract.
*   **Pros:**
    *   Promotes better API design and consistency before coding begins.
    *   Clear contract for frontend and backend teams.
*   **Cons:**
    *   Keeping the documentation and implementation in sync can be challenging if not enforced by tooling or processes.
    *   Can be more time-consuming to write initially.

**c. Hybrid / Specification-First with Code Generation:**
*   **How it works:** Design the OpenAPI spec first. Then, use tools to generate server stubs or interfaces from the spec. Developers implement the business logic within these generated structures.
*   **Pros:** Strong contract enforcement.
*   **Cons:** Tooling for code generation might have limitations or produce code that needs significant adaptation.

**d. Test-Driven / Inferred from Tests:**
*   **How it works:** Some tools can generate an API spec by analyzing integration or E2E tests that hit the API endpoints.
*   **Pros:** Documentation reflects actual API behavior as verified by tests.
*   **Cons:** Might not capture all details (e.g., descriptions, exact error models) unless tests are extremely comprehensive. Less common as a primary method.

[**Specify the chosen primary method for your platform. A common and effective approach for existing codebases is often Code-First with good library support, or a dedicated effort to create a Design-First spec and then align the code.**]

### 2. Key Information to Include in the OpenAPI Specification:

For each API endpoint, the documentation should clearly define:
*   **Path:** (e.g., `/users/{userId}`)
*   **HTTP Method:** (e.g., `GET`, `POST`, `PUT`, `DELETE`)
*   **Summary & Description:** A human-readable explanation of what the endpoint does.
*   **Tags:** To group related endpoints (e.g., "Users", "Posts", "Billing").
*   **Parameters:**
    *   Path parameters (e.g., `userId` in `/users/{userId}`)
    *   Query parameters (e.g., `?limit=10&offset=0`)
    *   Header parameters (e.g., `X-Custom-Header`)
    *   Cookie parameters
    *   For each parameter: name, location (`in`), description, required status, schema (data type, format, enums, examples).
*   **Request Body (for `POST`, `PUT`, `PATCH`):**
    *   Description.
    *   Content type(s) (e.g., `application/json`, `application/xml`, `multipart/form-data`).
    *   Schema defining the structure of the request body, including data types, required fields, examples.
*   **Responses:**
    *   For each possible HTTP status code (e.g., `200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `500 Internal Server Error`).
    *   Description of the response.
    *   Content type(s).
    *   Schema defining the structure of the response body, with examples.
    *   Headers (if any).
*   **Authentication/Security Schemes:**
    *   Define how the API is secured (e.g., API Key, OAuth 2.0 Bearer Token, Basic Auth).
    *   Specify which security schemes apply to each endpoint or globally.
    *   Example (OpenAPI 3.0):
      ```yaml
      components:
        securitySchemes:
          ApiKeyAuth:
            type: apiKey
            in: header
            name: X-API-Key
          BearerAuth:
            type: http
            scheme: bearer
            bearerFormat: JWT
      security: # Global security, can be overridden per operation
        - BearerAuth: []
      ```
*   **Servers:** Base URLs for different environments (e.g., development, staging, production).
    ```yaml
    servers:
      - url: https://api.your-platform.com/v1
        description: Production server
      - url: https://staging-api.your-platform.com/v1
        description: Staging server
      - url: http://localhost:8080/api/v1
        description: Local development server
    ```
*   **Schemas (Components):** Reusable definitions for complex data types used in request/response bodies or parameters. This keeps the spec DRY.
    ```yaml
    components:
      schemas:
        User:
          type: object
          properties:
            id:
              type: string
              format: uuid
              example: "d290f1ee-6c54-4b01-90e6-d701748f0851"
            username:
              type: string
              example: "johndoe"
            email:
              type: string
              format: email
              example: "johndoe@example.com"
        ErrorResponse:
          type: object
          properties:
            statusCode:
              type: integer
              example: 400
            message:
              type: string
              example: "Invalid input provided."
            errors: # Optional array of specific field errors
              type: array
              items:
                type: object
                properties:
                  field:
                    type: string
                  message:
                    type: string
    ```

### 3. Tooling for Generating and Displaying Docs:

*   **Swagger UI:** The most popular tool for rendering interactive API documentation from an OpenAPI spec. Can be hosted as part of your developer portal or run locally.
*   **Redoc:** Generates a clean, three-pane documentation view. Less interactive for "try it out" but often preferred for readability.
*   **Stoplight Elements:** Embeddable UI components for API documentation.
*   **Backend Framework Integrations:**
    *   **Node.js (Express):** `swagger-ui-express` (to serve Swagger UI), `swagger-jsdoc` (to generate spec from JSDoc comments).
    *   **NestJS:** `@nestjs/swagger` (excellent integration for generating spec from decorators).
    *   **Python (Django):** `drf-spectacular` or `drf-yasg`.
    *   **Python (FastAPI):** Built-in support for OpenAPI generation and Swagger UI/Redoc.
    *   **Java (Spring Boot):** `springdoc-openapi` (replaces SpringFox).
    *   **Go:** `swaggo/swag` or `go-swagger`.
*   **CI/CD Integration:**
    *   The CI/CD pipeline should include a step to generate the `openapi.json`/`openapi.yaml` file.
    *   This generated file can then be:
        *   Published to a static hosting site (e.g., GitHub Pages, S3 bucket).
        *   Served by an application endpoint (e.g., `/api-docs/openapi.json`).
        *   Used by Swagger UI/Redoc instances.
    *   Optionally, validate the generated spec against OpenAPI standards during CI.

### 4. Usage Examples:

Good API documentation includes clear usage examples for each endpoint.
*   **Request Examples:** Show example request bodies (JSON, XML). The `example` or `examples` keyword in OpenAPI schemas is used for this.
*   **Response Examples:** Show example response bodies for different status codes.
*   **Code Snippets:** Consider providing copy-pasteable code snippets in popular languages (e.g., cURL, Python, JavaScript) showing how to call the endpoint. Tools like Postman can generate these, or some documentation generators might support them.

### 5. Documenting Webhooks and Callbacks:

OpenAPI 3.x has support for documenting asynchronous APIs, including webhooks and callbacks.
*   **Callbacks:** Define operations that are invoked by your API to a client-provided URL.
    ```yaml
    paths:
      /subscribe:
        post:
          summary: Subscribe to notifications
          requestBody:
            required: true
            content:
              application/json:
                schema:
                  type: object
                  properties:
                    callbackUrl: # URL where your platform will send notifications
                      type: string
                      format: url
          responses:
            '202':
              description: Subscription accepted
          callbacks: # Define the expected callback from your platform
            myEventNotification: # Arbitrary name for the callback
              '{$request.body#/callbackUrl}': # Expression to use the callbackUrl from request
                post:
                  requestBody:
                    description: Notification payload for myEvent
                    content:
                      application/json:
                        schema:
                          $ref: '#/components/schemas/MyEventPayload' # Define this schema
                  responses:
                    '200':
                      description: Callback received successfully by the client
    ```
*   **Webhooks (Alternative Approach if not using OAS Callbacks):**
    *   If your platform *receives* webhooks from third parties (e.g., Slack, Jira), these are essentially API endpoints on your platform that need to be documented for those third parties (or for internal understanding).
    *   Document their path, method (usually POST), expected request body schema, security (signature verification), and expected responses.
    *   If your platform *sends* webhooks to clients, you're defining the contract your clients need to implement. This is where OAS `callbacks` are ideal.

### 6. Versioning API Documentation:

*   If your API is versioned (e.g., `/v1/users`, `/v2/users`), your documentation should also be versioned.
*   Provide a way for users to select the API version they are interested in (e.g., a dropdown in Swagger UI).
*   Each API version should have its own OpenAPI specification file.

## Maintenance and Best Practices

*   **Keep it Up-to-Date:** Documentation is useless if it's inaccurate.
    *   If using code-first, ensure developers update annotations as they change API behavior.
    *   If design-first, ensure implementation strictly follows the spec. Use linters or contract testing to verify.
*   **Review Documentation as Part of Code Review:** Make API documentation changes part of the PR/MR review process.
*   **Clarity and Simplicity:** Use clear language. Avoid jargon where possible. Provide concise summaries and more detailed descriptions.
*   **Audience:** Understand who will be using the API docs (internal developers, external partners, customers) and tailor the level of detail accordingly.
*   **"Try It Out" Feature:** Ensure this is functional and configured correctly with appropriate environments (e.g., a sandbox or staging environment).
*   **Deprecation Policy:** Clearly document how API endpoints are deprecated and when they will be removed. Use the `deprecated: true` field in OpenAPI.
*   **Changelog:** Maintain a changelog for API updates, especially breaking changes.

## Example Setup (Conceptual - Node.js with Express and `swagger-jsdoc` + `swagger-ui-express`)

1.  **Install Packages:**
    ```bash
    npm install swagger-jsdoc swagger-ui-express express
    ```
2.  **Define OpenAPI Options and Annotate Routes:**
    `app.js` or `server.js`:
    ```javascript
    // const express = require('express');
    // const swaggerJsdoc = require('swagger-jsdoc');
    // const swaggerUi = require('swagger-ui-express');

    // const app = express();
    // app.use(express.json());

    // // Swagger definition
    // const swaggerOptions = {
    //   definition: {
    //     openapi: '3.0.0',
    //     info: {
    //       title: 'My Platform API',
    //       version: '1.0.0',
    //       description: 'API documentation for My Platform services.',
    //       contact: { name: 'API Support', url: 'https://your-platform.com/support', email: 'api@your-platform.com' },
    //     },
    //     servers: [{ url: 'http://localhost:3000/api/v1', description: 'Development server' }],
    //     components: {
    //       securitySchemes: {
    //         ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-KEY' }
    //       }
    //     },
    //     // security: [{ ApiKeyAuth: [] }] // Apply global security if needed
    //   },
    //   apis: ['./routes/*.js'], // Path to the API docs (where your JSDoc annotations are)
    // };
    // const swaggerSpec = swaggerJsdoc(swaggerOptions);

    // // Serve Swagger UI
    // app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

    // // --- Example Route with JSDoc Annotations (in e.g., routes/users.js) ---
    // /**
    //  * @swagger
    //  * tags:
    //  *   name: Users
    //  *   description: User management and retrieval
    //  */

    // /**
    //  * @swagger
    //  * /users:
    //  *   get:
    //  *     summary: Retrieve a list of users
    //  *     tags: [Users]
    //  *     security:
    //  *       - ApiKeyAuth: [] # Requires API Key for this endpoint
    //  *     parameters:
    //  *       - in: query
    //  *         name: limit
    //  *         schema:
    //  *           type: integer
    //  *           default: 10
    //  *         description: Maximum number of users to return
    //  *     responses:
    //  *       200:
    //  *         description: A list of users.
    //  *         content:
    //  *           application/json:
    //  *             schema:
    //  *               type: array
    //  *               items:
    //  *                 $ref: '#/components/schemas/User' # Assuming User schema is defined in swaggerOptions
    //  *       401:
    //  *         description: Unauthorized (API Key missing or invalid)
    //  */
    // // app.get('/api/v1/users', (req, res) => { /* ... your route logic ... */ });

    // // (Define User schema in swaggerOptions.definition.components.schemas.User)

    // const PORT = process.env.PORT || 3000;
    // app.listen(PORT, () => console.log(`Server running on port ${PORT}, API docs at http://localhost:${PORT}/api-docs`));
    ```
    [**This is a simplified example. Real-world setup would involve more complex schema definitions and better organization.**]

By prioritizing comprehensive and auto-generated API documentation using standards like OpenAPI, you empower developers, improve integration quality, and enhance the overall developer experience for your platform.
