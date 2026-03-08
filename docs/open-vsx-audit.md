# Open VSX Extension Audit

## Purpose

Son of Anton uses Open VSX as its extension registry instead of the VS Marketplace. Before any extension can be installed, it must be verified against Open VSX and added to `extensions-allowlist.json`.

## Audit Process

### 1. Export installed extensions

```bash
code --list-extensions > extensions-list.txt
```

### 2. Check each extension against Open VSX

For each extension in the list, verify availability:

```bash
# Via the Open VSX API
curl -s https://open-vsx.org/api/{publisher}/{name} | jq '.name, .version'
```

Or visit `https://open-vsx.org/extension/{publisher}/{name}` in a browser.

### 3. Record results

Create or update the audit table below:

| Extension | VS Marketplace Publisher | Open VSX Available | Publisher Match | Action |
|---|---|---|---|---|
| vscodevim.vim | vscodevim | Yes | Yes | Allowlisted |
| esbenp.prettier-vscode | esbenp | Yes | Yes | Allowlisted |
| dbaeumer.vscode-eslint | dbaeumer | Yes | Yes | Allowlisted |
| eamodio.gitlens | eamodio | Yes | Yes | Allowlisted |
| rust-lang.rust-analyzer | rust-lang | Yes | Yes | Allowlisted |
| ms-python.python | ms-python | Yes | Yes | Allowlisted |

### 4. Flag issues

- **Missing from Open VSX:** Find an alternative or request the publisher to list it
- **Publisher mismatch:** Possible namespace squatting — investigate before allowing

## Adding New Extensions

1. Verify the extension exists on Open VSX with a matching publisher
2. Test the extension in Son of Anton to confirm it works
3. Add an entry to `extensions-allowlist.json`
4. Submit a PR with the change — requires team member review

## Automation

To batch-check extensions:

```bash
while IFS= read -r ext; do
  publisher=$(echo "$ext" | cut -d. -f1)
  name=$(echo "$ext" | cut -d. -f2-)
  status=$(curl -s -o /dev/null -w "%{http_code}" "https://open-vsx.org/api/$publisher/$name")
  echo "$ext: $status"
done < extensions-list.txt
```
