# Extension Gallery

> Extension marketplace configuration and Open VSX support.

## Desired Outcome
mia-vscode connects to an extension marketplace that provides both standard VS Code extensions (via Open VSX) and curated mia-specific extensions, enabling developers to install community extensions alongside narrative tools.

## Current Reality
Code - OSS has no `extensionsGallery` configured in product.json. Users cannot browse or install extensions from any marketplace by default.

## Structural Tension
Access to extensions is essential for a functional IDE. Configuring the gallery transforms mia-vscode from a bare editor into a rich development platform.

---

## Components

### GalleryConfiguration
Extension marketplace service URLs in product.json.
- **Behavior:** Configure `extensionsGallery` in product.json to point to Open VSX Registry as the primary marketplace. This provides access to the vast ecosystem of open-source VS Code extensions.
- **Data:**
  ```json
  {
    "extensionsGallery": {
      "serviceUrl": "https://open-vsx.org/vscode/gallery",
      "itemUrl": "https://open-vsx.org/vscode/item",
      "resourceUrlTemplate": "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}",
      "controlUrl": "",
      "nlsBaseUrl": "",
      "publisherUrl": ""
    }
  }
  ```

### TrustedDomains
Link protection configuration.
- **Behavior:** Add mia-code domains to trusted list so links from extensions and notifications open without security prompts.
- **Data:**
  ```json
  {
    "linkProtectionTrustedDomains": [
      "https://*.mia-code.dev",
      "https://github.com/miadisabelle",
      "https://github.com/jgwill",
      "https://open-vsx.org"
    ]
  }
  ```

### RecommendedExtensions
Curated extension recommendations.
- **Behavior:** A `mia-recommended` list displayed in the Extensions sidebar when connected to mia-code-server. Recommendations fetched from server configuration (not hardcoded) via `/api/extensions/recommended`. Fallback: static list of known-good extensions for narrative development (YAML, Markdown, Git Graph, etc.).

---

## Supporting Structures
- All configuration in `product.json` — no source code changes
- Open VSX is the standard gallery for Code - OSS forks
- Future: custom gallery URL for mia-specific extensions if a private registry is deployed
- Fulfills: `mia-code-server/rispecs/mia-vscode/09-extension-marketplace.spec.md`
