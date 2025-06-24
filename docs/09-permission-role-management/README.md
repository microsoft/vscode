# Permission & Role Management

This guide outlines how user roles and permissions are managed within the Autonomous Coding Agent platform (Node.js/Express backend with Prisma, React frontend), and crucially, how this system can be extended when new backend modules, features, or third-party integrations are added.

## Overview

The platform employs a **Role-Based Access Control (RBAC)** system, likely supplemented with ownership checks for resources. Key concepts:
*   **Users:** Individuals interacting with the platform, managed by the `AuthService` and stored in the `User` table (PostgreSQL via Prisma).
*   **Permissions (Actions/Operations):** Specific actions a user can perform. Defined as strings, often following a `resource:action` or `module:resource:action` convention (e.g., `project:create`, `ai_workflow:execute`, `user:manage_api_keys`).
*   **Resources:** Entities within the platform (e.g., `Project`, `AIWorkflow`, `CodeSnippet`, `APIKey`).
*   **Roles:** Collections of permissions. Users are assigned one or more roles. Permissions are additive if a user has multiple roles. Examples: `PlatformAdmin`, `Developer`, `ProjectViewer`.

## Core Permission System Design (Node.js Backend with Prisma)

*   **Permission Definition:**
    *   Permissions are defined as a predefined list of strings within the backend, possibly enumerated or stored in a configuration file or a dedicated `Permission` table in PostgreSQL if dynamic permission creation by admins is needed.
    *   Convention: `[module_or_resource_area]:[action]` (e.g., `projects:create`, `workflows:execute`, `admin:manage_users`).
*   **Role Definition (Database-Driven):**
    *   `Role` table: Stores role names (e.g., `PlatformAdmin`, `Developer`) and descriptions.
        ```prisma
        // model Role {
        //   id          String       @id @default(cuid())
        //   name        String       @unique
        //   description String?
        //   permissions Permission[] @relation(references: [id]) // Many-to-many with Permission
        //   users       UserRole[]
        // }
        ```
    *   `Permission` table: Stores all available permission strings.
        ```prisma
        // model Permission {
        //   id          String   @id @default(cuid()) // Or just use the permission string as ID
        //   name        String   @unique // e.g., "projects:create"
        //   description String?
        //   roles       Role[]   @relation(references: [id])
        // }
        ```
    *   A many-to-many relation table (`_RoleToPermission`) would link roles to their assigned permissions.
*   **User-Role Assignment (Database-Driven):**
    *   `UserRole` table (or implicit many-to-many `_UserToRole`): Links users to their assigned roles. A user can have multiple roles.
        ```prisma
        // model User {
        //  // ... other fields
        //  roles UserRole[]
        // }
        // model UserRole {
        //   userId String
        //   roleId String
        //   user   User   @relation(fields: [userId], references: [id])
        //   role   Role   @relation(fields: [roleId], references: [id])
        //   @@id([userId, roleId])
        // }
        ```
*   **Checking Permissions (Node.js Backend Middleware & Services):**
    *   An Express middleware (e.g., `auth.middleware.js`) attached to protected routes verifies the JWT and loads the user's roles and effective permissions (cached for the request lifecycle).
    *   A helper function, e.g., `hasPermission(userPermissions: string[], requiredPermission: string, resourceContext?: any)`:
        *   Checks if `requiredPermission` (or a wildcard like `resource:*`) is in `userPermissions`.
        *   Optionally, `resourceContext` can be used for ownership checks (e.g., `if (requiredPermission === 'project:edit' && resourceContext.ownerId !== user.id) return false;`).
    *   This check is used within service methods or route handlers before performing sensitive operations.
        ```javascript
        // Example in a service:
        // async function updateProject(userId, projectId, data) {
        //   const user = await prisma.user.findUnique({ where: {id: userId}, include: { roles: { include: { role: { include: { permissions: true }}}}}});
        //   const effectivePermissions = getEffectivePermissions(user.roles); // Helper to flatten permissions
        //
        //   const project = await prisma.project.findUnique({ where: { id: projectId } });
        //   if (!project) throw new Error('Project not found');
        //
        //   // RBAC check + Ownership check
        //   if (!hasPermission(effectivePermissions, 'project:edit') || project.userId !== userId) {
        //     if (!hasPermission(effectivePermissions, 'project:edit_all')) { // Admin override
        //       throw new Error('Forbidden: Insufficient permissions to edit this project.');
        //     }
        //   }
        //   // ... proceed with update
        // }
        ```

## Default Roles and Permissions (Examples for Autonomous Coding Agent)

*   **`PlatformAdmin`:**
    *   Full control over the platform.
    *   Permissions: `admin:*` (wildcard for all admin actions), `users:manage_all`, `projects:manage_all`, `workflows:manage_all`, `system:view_logs`, `system:manage_settings`.
*   **`Developer` (Standard User):**
    *   Can create and manage their own projects, AI workflows, and API keys.
    *   Permissions: `projects:create`, `projects:read_own`, `projects:edit_own`, `projects:delete_own`, `workflows:create`, `workflows:execute_own`, `workflows:read_own`, `workflows:edit_own`, `workflows:delete_own`, `apikeys:manage_own`.
*   **`ProjectViewer` (Read-Only Collaborator - if collaboration is a feature):**
    *   Can view projects and workflows they are explicitly granted access to, but cannot modify them.
    *   Permissions: `projects:read_assigned`, `workflows:read_assigned`.

## Extending Roles and Permissions for New Modules/Integrations

When a new backend module (e.g., `CodeQualityAnalyzer`) is added:

### 1. Identifying New Permissions:
*   The module developer identifies new actions/resources.
    *   Actions: `code_quality:analyze`, `code_quality:view_report`, `code_quality:configure_rules`.
    *   Resource: `quality_report`, `analysis_ruleset`.
*   Permissions: `code_quality_analyzer:analyze`, `code_quality_analyzer:view_reports`, `code_quality_analyzer:manage_rulesets`.

### 2. Registering New Permissions with the System (Node.js Backend):
*   **Database-Driven Approach:**
    *   During module initialization (e.g., in its `index.js` called by the main app), the module ensures its required permissions exist in the `Permission` table.
    ```javascript
    // src/modules/codeQualityAnalyzer/index.js
    // async function ensurePermissionsExist(prisma) {
    //   const permissionsToRegister = [
    //     { name: 'code_quality_analyzer:analyze', description: 'Run code quality analysis.' },
    //     { name: 'code_quality_analyzer:view_reports', description: 'View quality analysis reports.' },
    //     { name: 'code_quality_analyzer:manage_rulesets', description: 'Manage quality analysis rulesets.' }
    //   ];
    //   for (const perm of permissionsToRegister) {
    //     await prisma.permission.upsert({ where: { name: perm.name }, update: {}, create: perm });
    //   }
    // }
    // module.exports = async function initializeCodeQualityModule(app, { prisma }) {
    //   await ensurePermissionsExist(prisma);
    //   // ... register routes, services for this module ...
    // };
    ```
    *   A Prisma migration might be needed if adding a new `Permission` table initially.

### 3. Assigning New Permissions to Roles:
*   **Default Assignment:** The module could suggest or programmatically (if careful) assign its new permissions to default roles during its initialization (e.g., `code_quality_analyzer:manage_rulesets` to `PlatformAdmin`).
*   **Admin UI (React Frontend & Node.js Backend):**
    *   A "Roles & Permissions" section in the React admin dashboard.
    *   Fetches all roles and all available permissions (including newly registered ones) from backend APIs.
    *   Allows `PlatformAdmin` users to:
        *   Create/edit custom roles.
        *   Assign/unassign permissions (including new ones like `code_quality_analyzer:analyze`) to roles using a multi-select UI.
    *   The backend API handles updating the `Role` and `_RoleToPermission` tables in PostgreSQL.

### 4. Enforcing New Permissions in Module Code (Node.js Backend):
The new module (`CodeQualityAnalyzer`) uses the platform's `hasPermission` check within its services/controllers:
```javascript
// src/modules/codeQualityAnalyzer/codeQuality.controller.js
// async function analyzeCodeHandler(req, res) {
//   // Assuming user and their effectivePermissions are on req by auth middleware
//   if (!hasPermission(req.user.effectivePermissions, 'code_quality_analyzer:analyze')) {
//     return res.status(403).json({ message: 'Forbidden' });
//   }
//   // ... proceed to call service for analysis ...
// }
```

### 5. Permissions for Third-Party Integrations:
*   Platform-side permissions control *who can use or configure the integration itself within your platform*.
    *   Example: `integration_jira:manage_connection` (to set up Jira OAuth).
    *   Example: `integration_jira:create_issue_via_agent` (to allow an AI workflow to create a Jira issue).
*   These are defined and managed like any other platform permission. The actual access to Jira is then governed by the stored OAuth token's scopes on Jira's side.

## Best Practices
*   **Granularity:** Define permissions like `module:resource:action` (e.g., `project:read`, `project:update`, `project:delete`).
*   **Admin UI (React):** Essential for managing custom roles and fine-tuning permissions.
*   **Documentation:** Module developers must document new permissions they introduce.
*   **Centralized Checking Logic:** Use shared middleware or service helpers for permission checks.
*   **Testing:** Write tests for permission enforcement in both core and new modules.

This RBAC system, centered around the Node.js backend and PostgreSQL database (managed with Prisma), provides a flexible way to manage user access and extend permissions as the Autonomous Coding Agent platform evolves with new modules and integrations.
