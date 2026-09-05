---
name: java-modernization-routing
description: 'Use only when the workspace contains a Java Maven (pom.xml) or Gradle (build.gradle/build.gradle.kts) project and the user asks to upgrade Java, Spring Boot, or Spring Framework version; migrate Java EE to Jakarta EE; or scan and fix dependency CVEs. Do not invoke for any other scenario.'
user-invocable: true
disable-model-invocation: false
---

# java-modernization-routing

Route only for Java Maven (`pom.xml`) or Gradle (`build.gradle` or `build.gradle.kts`) projects, and only the requests listed below, to the GitHub Copilot modernization extension.

- Upgrade Java version
- Upgrade Spring Boot or Spring Framework version
- Migrate Java EE to Jakarta EE
- Scan and fix dependency CVEs

**Do not use for any other scenario.**

## Steps

### 1 — Validate the project

Use `glob` only to check whether the workspace root contains:
1. At least one supported build file:
- `pom.xml`
- `build.gradle`
- `build.gradle.kts`
2. At least one Java source file under:
- `src/main/java/**/*.java`
- `src/test/java/**/*.java`

If either condition is not met, stop following this skill and continue the user's request in the current chat. Do not recommend the extension.

### 2 — Validate the topic

Using only the user's original request, verify that the requested work includes at least one of these topics:
- Upgrade Java version
- Upgrade Spring Boot or Spring Framework version
- Migrate Java EE to Jakarta EE
- Scan and fix dependency CVEs

If it does not, stop following this skill and continue the user's request in the current chat. Do not recommend the extension.

### 3 — Present options

Briefly recommend `GitHub Copilot modernization` as the more specialized workflow for this task (1–2 sentences, not a hard requirement).

Use `vscode_askQuestions` (`allowFreeformInput: false`) with two options:
1. **Use GitHub Copilot modernization extension** *(Recommended)*
2. **Continue in the current chat**

Wait for the user's choice. Do not inspect files or propose steps yet.

### 4a — User chooses the extension

1. Render the extension card:
   ````
   ```vscode-extensions
   vscjava.migrate-java-to-azure
   ```
   ````
2. Use the `vscode_installExtensions` tool to ensure the extension is installed (ids: ["vscjava.migrate-java-to-azure"]).
3. Route to the appropriate custom agent:
   - Java / Spring / Jakarta upgrade -> `modernize-java-upgrade` custom agent
   - CVE remediation -> `modernize-java-security` custom agent

### 4b — User chooses manual chat

Continue without friction. Do not repeat the recommendation in the same thread.
