# Installation

## Requirements

Before installing express-mcp-server, ensure you have:

- **Node.js** >= 18.0.0
- **npm** or **yarn** package manager
- **Express.js** >= 4.0.0 (peer dependency)
- **TypeScript** >= 5.0.0 (for TypeScript projects)

## Install the Library

### Using npm

```bash
npm install express-mcp-server
```

### Using yarn

```bash
yarn add express-mcp-server
```

### Using pnpm

```bash
pnpm add express-mcp-server
```

## Verify Installation

Create a simple test script to verify the installation:

```typescript
// test.ts
import { generateMcpServer } from 'express-mcp-server';

console.log('express-mcp-server installed successfully!');
```

Run it:

```bash
node test.ts
```

## TypeScript Setup

If you're using TypeScript, make sure your `tsconfig.json` is configured for ES modules:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true
  }
}
```

## Package.json Configuration

Your `package.json` should have `"type": "module"` for ES modules:

```json
{
  "name": "my-project",
  "type": "module",
  "dependencies": {
    "express": "^4.18.2",
    "express-mcp-server": "^1.0.0"
  }
}
```

## Development Dependencies

For TypeScript development, install these additional packages:

```bash
npm install -D @types/express @types/node typescript
```

## Peer Dependencies

Express MCP Server has Express.js as a peer dependency. If you don't have it installed:

```bash
npm install express
```

## Troubleshooting Installation

### Module Resolution Errors

If you see errors like "Cannot find module", ensure:

1. Your `package.json` has `"type": "module"`
2. You're using `.js` extensions in imports: `import { x } from './file.js'`
3. Your `tsconfig.json` has `"moduleResolution": "node"` or `"nodeNext"`

### TypeScript Compilation Errors

If TypeScript complains about types:

```bash
npm install -D @types/express @types/node
```

### Version Conflicts

Check for version compatibility:

```bash
npm ls express
npm ls typescript
```

## Next Steps

Now that you've installed the library, proceed to the [Quick Start Guide](./quick-start.md) to generate your first MCP server!
