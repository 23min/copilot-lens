---
name: vscode-extensions
description: Guide for developing VS Code extensions. Use this when creating or modifying extension code, webviews, tree views, or commands.
---

# VS Code Extension Development

## Extension structure
- `extension.ts` — activation point, register commands and views
- `package.json` — contributes commands, views, configuration
- Webviews use message passing (`postMessage` / `onDidReceiveMessage`)

## Webview security
- Use `webview.asWebviewUri()` for local resources
- Set a restrictive Content-Security-Policy
- Bundle dependencies locally, never load from CDN

## Testing
- Use `@vscode/test-electron` for integration tests
- Unit test pure logic separately with vitest
