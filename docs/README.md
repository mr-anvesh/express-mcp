# Express MCP Server Documentation

Welcome to the express-mcp-server documentation! This library automatically generates MCP (Model Context Protocol) servers from your Express.js applications.

## Table of Contents

### Getting Started
- [Installation](./installation.md) - How to install and set up the library
- [Quick Start](./quick-start.md) - Get up and running in 5 minutes
- [Basic Concepts](./concepts.md) - Understand how the library works

### Guides
- [API Reference](./api-reference.md) - Complete API documentation
- [Configuration](./configuration.md) - All configuration options explained
- [Generated Files](./generated-files.md) - Understanding the generated MCP server
- [Tool Schema](./tool-schema.md) - How Express routes become MCP tools

### Advanced Usage
- [Nested Routers](./nested-routers.md) - Working with sub-routers
- [Customization](./customization.md) - Customizing generated servers
- [Transports](./transports.md) - stdio vs Streamable HTTP transports
- [Authentication](./authentication.md) - Adding auth to MCP tools

### Examples
- [Simple API](./examples/simple-api.md) - Basic REST API example
- [Nested Routes](./examples/nested-routes.md) - Complex routing patterns
- [Production Setup](./examples/production.md) - Production deployment guide

### Reference
- [MCP Protocol](./mcp-protocol.md) - Understanding the Model Context Protocol
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions
- [FAQ](./faq.md) - Frequently asked questions

## Quick Links

- **Installation**: `npm install express-mcp-server`
- **GitHub**: [github.com/mr-anvesh/express-mcp](https://github.com/mr-anvesh/express-mcp)
- **Issues**: [Report a bug](https://github.com/mr-anvesh/express-mcp/issues)

## Overview

Express MCP Server bridges the gap between traditional REST APIs and AI assistants that use the Model Context Protocol. It automatically:

1. **Extracts routes** from your Express application
2. **Generates MCP tools** with proper JSON schemas
3. **Creates a standalone server** that can be customized
4. **Handles the protocol** so you don't have to

## Who is this for?

- **Express developers** who want to expose their APIs to AI assistants
- **MCP users** who want to quickly create MCP servers from existing APIs
- **Teams** looking to make their internal tools AI-accessible

## Features at a Glance

- Automatic route extraction from Express apps  
- Support for Express 4 and 5  
- Nested router support with correct path prefixes  
- Path parameters, query params, and request bodies  
- TypeScript and JavaScript output  
- stdio and Streamable HTTP transports
- Zero runtime dependencies in generated files  
- Fully customizable output  

## Need Help?

- Check the [Troubleshooting Guide](./troubleshooting.md)
- Review the [FAQ](./faq.md)
- Open an [issue on GitHub](https://github.com/mr-anvesh/express-mcp/issues)

---

**Next Steps**: Start with the [Quick Start Guide](./quick-start.md) to build your first MCP server!
