# Feature Extension (Backend Modules & Potential Frontend Plugins)

The Autonomous Coding Agent platform is designed with a modular Node.js/Express.js backend, allowing developers to extend its functionality by creating and integrating new features primarily as backend modules. Frontend extensions in the React SPA are also possible, though they require careful consideration for integration.

## Overview of the Extension Architecture

The platform's backend extensibility is achieved through a **directory-based module loading system** combined with a **centralized registration mechanism** for routes, services, and potentially event listeners. Each major domain (Auth, AI Workflow, Projects, etc.) is already structured as an internal module, and new features can follow this pattern.

Key goals of this architecture:
*   **Isolation (Logical):** Backend modules are logically separated, often in their own directories, promoting organized code. True runtime isolation is typical of microservices, which this can evolve towards.
*   **Interoperability:** Modules interact with the core platform and other modules through well-defined service interfaces or an event bus.
*   **Discoverability & Loading:** The core application discovers and loads modules from a designated directory at startup.
*   **Lifecycle Management (Basic):** Modules are typically loaded at startup. More advanced lifecycle (install, uninstall, enable/disable at runtime) would require a more sophisticated plugin management system.

## What Can Be Extended?

Primarily focused on backend extensions, but with considerations for frontend:

*   **Adding New API Endpoints:** Backend modules can define new Express routers and controllers to expose new functionalities.
*   **Introducing New Backend Services:** Add new business logic, data processing capabilities, or integrations with external systems (e.g., a new AI model connector).
*   **Modifying Existing Backend Behavior:** Through an event system or strategy patterns if implemented in the core.
*   **Adding New Data Models & Database Interactions:** Modules can define new Prisma schema parts (though managing migrations across modules needs a strategy) or extend existing models.
*   **Frontend Components/Views (Advanced):**
    *   **Dynamic Loading:** For a React SPA, dynamically loading entire feature sets as plugins is complex. It might involve techniques like:
        *   **Micro-frontends:** (e.g., using Webpack Module Federation). This is a significant architectural decision.
        *   **Dynamic `import()`:** For loading components or route configurations lazily.
        *   **Component Registration:** A core system where plugins can register their React components, which are then rendered in predefined extension points in the UI.
    *   For simplicity, initial "frontend extensions" might involve backend modules providing data that the existing frontend can be configured to display, or contributing very isolated components if a dynamic loading system is in place.

## Developing a New Backend Module

### 1. Module Structure (Example)

New backend modules are typically placed in a `src/modules/` directory in the Node.js backend application.
```
src/
├── modules/
│   └── my-new-feature/
│       ├── index.js                 # Main entry point for the module (registers routes, services)
│       ├── manifest.json            # (Optional) Module metadata
│       ├── feature.routes.js        # Express router for this module's API endpoints
│       ├── feature.controller.js    # Request handlers
│       ├── feature.service.js       # Business logic
│       ├── feature.validation.js    # (Optional) Input validation schemas (e.g., using Zod or Joi)
│       └── prisma/                  # (Optional) If module defines its own Prisma schema extensions
│           └── schema.prisma        # Partial schema specific to this module
│       └── README.md                # Module-specific documentation
└── core/                            # Core platform services (app, db, logger, etc.)
└── main.js                          # Main application startup
```

### 2. Module Manifest (`manifest.json` - Optional)
While not strictly enforced by a simple directory loader, a `manifest.json` can be useful for metadata.
```json
{
  "id": "my-new-feature",
  "name": "My New Feature Module",
  "version": "1.0.0",
  "description": "Adds feature X and Y to the platform.",
  "author": "Developer Name",
  "dependencies": [], // IDs of other platform modules it depends on
  "permissions": [    // Permissions this module introduces (see Permission Management guide)
    "my_feature:read_data",
    "my_feature:write_data"
  ]
}
```

### 3. Backend Module Development (Node.js/Express.js)

*   **Entry Point (`my-new-feature/index.js`):**
    This file exports a function that the core application calls to initialize the module, passing any necessary core services or the main Express app instance.

    ```javascript
    // src/modules/my-new-feature/index.js
    const featureRoutes = require('./feature.routes');
    // const FeatureService = require('./feature.service'); // If service needs init

    module.exports = function initializeMyNewFeatureModule(app, platformServices) {
      // platformServices could contain { prisma, logger, eventEmitter, config, etc. }
      console.log('Initializing "My New Feature" module...');

      // const featureServiceInstance = new FeatureService(platformServices.prisma, platformServices.logger);
      // platformServices.registerService('myFeatureService', featureServiceInstance); // Conceptual service registration

      // Register API routes for this module, typically namespaced
      app.use('/api/v1/my-feature', featureRoutes(platformServices)); // Pass services to routes if needed

      // Register event listeners
      // platformServices.eventEmitter.on('core:user.created', (userData) => {
      //   console.log('My New Feature module reacting to new user:', userData.id);
      // });

      console.log('"My New Feature" module initialized.');
    };
    ```

*   **Defining API Endpoints (`feature.routes.js`):**
    Modules define their own Express routers.
    ```javascript
    // src/modules/my-new-feature/feature.routes.js
    const express = require('express');
    const { getData, createData } = require('./feature.controller');
    // const { validateCreateData } = require('./feature.validation'); // Example validation middleware
    // const { isAuthenticated, hasPermission } = require('../../core/middleware/auth.middleware'); // Core auth middleware

    module.exports = function (platformServices) {
      const router = express.Router();

      // Example: GET /api/v1/my-feature/data
      // router.get('/data', isAuthenticated, hasPermission('my_feature:read_data'), (req, res, next) => getData(req, res, next, platformServices));
      router.get('/data', (req, res, next) => getData(req, res, next, platformServices)); // Simplified for example

      // Example: POST /api/v1/my-feature/data
      // router.post('/data', isAuthenticated, hasPermission('my_feature:write_data'), validateCreateData, (req, res, next) => createData(req, res, next, platformServices));
      router.post('/data', (req, res, next) => createData(req, res, next, platformServices)); // Simplified

      return router;
    };
    ```
    *   **Controllers (`feature.controller.js`)** would handle request/response logic, calling services.
    *   **Services (`feature.service.js`)** would contain business logic and database interactions (using Prisma client passed via `platformServices`).

*   **Loading Modules in Core Application (`main.js` or `app.js`):**
    The main application would have logic to scan the `src/modules/` directory and initialize each module.
    ```javascript
    // src/main.js (Simplified conceptual loading)
    // const express = require('express');
    // const fs = require('fs');
    // const path = require('path');
    // const prisma = require('./core/db/prisma.client'); // Prisma client instance
    // const logger = require('./core/logger');
    // // const eventEmitter = require('./core/events'); // Platform's event emitter
    // // const config = require('./core/config');

    // const app = express();
    // app.use(express.json());
    // // ... other core middleware ...

    // const platformServices = { prisma, logger /*, eventEmitter, config */ };

    // const modulesDir = path.join(__dirname, 'modules');
    // fs.readdirSync(modulesDir).forEach(moduleName => {
    //   const modulePath = path.join(modulesDir, moduleName);
    //   if (fs.statSync(modulePath).isDirectory()) {
    //     const moduleInitializerPath = path.join(modulePath, 'index.js');
    //     if (fs.existsSync(moduleInitializerPath)) {
    //       try {
    //         const initializeModule = require(moduleInitializerPath);
    //         if (typeof initializeModule === 'function') {
    //           initializeModule(app, platformServices);
    //         }
    //       } catch (error) {
    //         logger.error(`Failed to initialize module ${moduleName}:`, error);
    //       }
    //     }
    //   }
    // });
    // // ... start server ...
    ```

### 4. Data Persistence / Database Schema Extensions (Prisma)
Modules can extend the Prisma schema.
*   **Modular Schema Files:** Prisma supports defining schema parts in multiple `.prisma` files that can be imported. A module could have its own `my-new-feature/prisma/schema.prisma`.
    ```prisma
    // src/modules/my-new-feature/prisma/schema.prisma
    // model MyFeatureItem {
    //   id        String   @id @default(cuid())
    //   name      String
    //   value     Int
    //   createdAt DateTime @default(now())
    //   updatedAt DateTime @updatedAt
    //   // Relations to core models or other module models
    //   // owner     User?    @relation(fields: [ownerId], references: [id])
    //   // ownerId   String?
    // }
    ```
*   **Main Schema Import:** The main `prisma/schema.prisma` file would need to be structured to allow for these imports or the module's schema parts would need to be manually added/merged. Managing migrations (`prisma migrate dev`, `prisma migrate deploy`) across many dynamically loaded schema parts requires a well-thought-out strategy, often involving a central "source of truth" schema that incorporates all module schemas before migrations are generated.
*   **Alternative:** Modules use the Prisma client provided by `platformServices` to interact with tables defined in the core schema or tables specifically created for them (namespaced if necessary, e.g., `module_myfeature_items`).

### 5. Frontend Extensions (Considerations)
If a backend module needs to surface new UI elements in the React SPA:
*   **API-Driven UI:** The simplest way is for the backend module to provide new API endpoints. The existing frontend application is then updated to call these endpoints and render the data using existing or new generic UI components.
*   **Dynamic Component Injection (Advanced):**
    *   The core React app could define "extension points" (e.g., specific areas in the dashboard, new menu items).
    *   Backend modules could provide metadata about frontend components they offer (e.g., bundle URL, component name).
    *   The frontend would need a system to dynamically load and render these components, potentially using:
        *   `React.lazy()` with dynamic `import()` if components are part of the main bundle or can be code-split.
        *   Webpack Module Federation for true micro-frontend architecture where modules are independently built and deployed frontend bundles. This is complex.
*   **Styling:** Frontend components from modules should adhere to the platform's theming system (Tailwind CSS, CSS variables).

## Managing Modules

*   **Installation:** Primarily involves adding the module's directory to the `src/modules/` folder and ensuring any necessary dependencies are installed (likely at the root `package.json` if in a monorepo, or the module has its own `package.json` if not a monorepo).
*   **Enabling/Disabling:**
    *   **Simple:** Controlled by the presence of the module directory (loader skips if not found).
    *   **Advanced:** A configuration setting (e.g., in database or env var) could list enabled modules. The module loader would check this list.
*   **Updating:** Replace the module's code. Restart the application.
*   **Uninstallation:** Remove the module's directory. Restart. Consider database cleanup if the module created its own tables (manual or scripted).

## Best Practices for Module Development

*   **Namespacing:** API routes (`/api/v1/my-feature/...`), event names (`my-feature:event_name`), database tables (if not using separate Prisma schemas per module), and CSS classes (if contributing frontend CSS) should be namespaced to avoid collisions.
*   **Clear Interfaces:** If modules provide services for other modules to use, define clear JavaScript class/object interfaces.
*   **Dependency Management:** If modules have unique external dependencies, manage them carefully (e.g., via the module's own `package.json` if not in a strict monorepo, or ensure compatibility with root dependencies).
*   **Documentation:** Each module should have a `README.md`.
*   **Permissions:** New permissions introduced by a module must be defined and integrated with the platform's [Permission & Role Management](./09-permission-role-management/README.md) system. The module's routes should use the core authentication and authorization middleware.
*   **Error Handling & Logging:** Use the platform's core logger and follow consistent error handling patterns.

## Example: "External Link Checker" Module (Conceptual Backend)

A module that periodically checks external links found in platform content and reports broken links.

1.  **Directory:** `src/modules/link-checker/`
2.  **`manifest.json`:**
    ```json
    { "id": "link-checker", "name": "External Link Checker", "version": "1.0.0" }
    ```
3.  **`index.js`:**
    ```javascript
    // const LinkCheckerService = require('./link-checker.service');
    // module.exports = (app, { prisma, logger, config }) => {
    //   const service = new LinkCheckerService(prisma, logger, config.LINK_CHECKER_API_KEY);
    //   // Could expose an API to trigger checks or view status
    //   // app.use('/api/v1/link-checker', require('./link-checker.routes')(service));
    //   // Or just run a background job
    //   // setInterval(() => service.checkLinks(), config.LINK_CHECK_INTERVAL_MS);
    //   logger.info('Link Checker module initialized.');
    // };
    ```
4.  **`link-checker.service.js`:** Contains logic to find links in platform data (via Prisma) and check their status.
5.  **Configuration:** `LINK_CHECKER_API_KEY` (for a hypothetical link checking service) and `LINK_CHECK_INTERVAL_MS` would be added to `.env.example` and `.env`.

This modular approach allows the Autonomous Coding Agent platform to be extended with new backend capabilities in an organized manner. True frontend plugin systems in SPAs add significant complexity but can be layered on top if required.
