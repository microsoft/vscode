# Contributing to CoCode

Thank you for your interest in contributing to CoCode!

## Development Setup

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd cocode
   ```

2. **Install dependencies**
   ```bash
   # Gateway service
   cd services/gateway && npm install

   # Yjs-WS service
   cd ../yjs-ws && npm install

   # Builder service
   cd ../builder && npm install

   # Collab extension
   cd ../collab-extension && npm install
   ```

3. **Run services locally**
   ```bash
   cd deploy
   docker compose up --build
   ```

## Code Standards

### TypeScript

- Use **tabs for indentation** (VS Code codebase convention)
- Prefer `async/await` over Promise chains
- Add JSDoc comments for public functions
- Run linter: `npm run lint`

### Commit Messages

Follow conventional commits:

```
feat: add Python syntax highlighting
fix: resolve cursor desync in collab
docs: update provisioning guide
chore: bump dependencies
```

## Architecture Guidelines

### Layered Services

- **Gateway:** Authentication, routing, session management
- **OpenVSCode:** Editor UI and language services
- **Yjs-WS:** CRDT sync server
- **Builder:** Isolated compilation/execution

Do not mix concerns across layers.

### Security First

- Never commit secrets
- Validate all user input
- Enforce timeouts on external processes
- Test resource limits

## Testing

### Manual Testing Checklist

- [ ] OAuth login (GitHub & Google)
- [ ] Two users collaborating on same file
- [ ] C++ multi-file CMake build
- [ ] Python script execution
- [ ] Session persistence across page reload

### Extension Testing

Test collab extension:

1. Open VS Code with extension loaded
2. Open a C++ file
3. Edit in two browser tabs
4. Verify cursors appear with correct colors

## Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make changes**
   - Keep commits focused and atomic
   - Update documentation as needed

3. **Test thoroughly**
   - Run `docker compose up` and test all features
   - Check for TypeScript errors

4. **Submit PR**
   - Title: Clear description of change
   - Body: Why this change is needed, what it does
   - Link to any related issues

## What to Work On

### High Priority

- [ ] Complete Welcome page extension with brand theming
- [ ] Add room management UI (create/join with link)
- [ ] Implement Yjs persistence (y-leveldb)
- [ ] Add file watcher for non-editor changes

### Nice-to-Have

- [ ] Presence panel UI (list of active users)
- [ ] Follow mode (click user to follow their viewport)
- [ ] Terminal sharing (collaborative terminal)
- [ ] Code review mode (comment threads)

## Questions?

Open an issue or discussion in the repository.
