# Tool Schema Reference

Understanding how Express routes are converted to MCP tools with JSON schemas.

## Overview

Each Express route becomes an MCP tool with:
- **Name**: Generated from HTTP method and path
- **Description**: Human-readable description
- **Input Schema**: JSON Schema defining parameters

## Tool Naming

### Naming Rules

Express routes are converted to snake_case tool names:

| Express Route | Tool Name |
|---------------|-----------|
| `GET /users` | `get_users` |
| `POST /users` | `post_users` |
| `GET /users/:id` | `get_users_by_id` |
| `PUT /users/:id` | `put_users_by_id` |
| `DELETE /users/:id` | `delete_users_by_id` |
| `GET /api/v1/posts` | `get_api_v1_posts` |
| `GET /api/posts/:id` | `get_api_posts_by_id` |
| `GET /users/:userId/posts/:postId` | `get_users_by_userId_posts_by_postId` |

### Naming Algorithm

1. **Start with HTTP method** (lowercase): `get`, `post`, `put`, `delete`, `patch`
2. **Split path by `/`**: `/api/users/:id` → `['api', 'users', ':id']`
3. **Process each segment**:
   - Regular segment: keep as-is → `api`, `users`
   - Path parameter (`:id`): add `by_` prefix → `by_id`
4. **Join with underscores**: `get_api_users_by_id`
5. **Clean up**: Remove consecutive underscores

### Examples with Complex Paths

```typescript
// Nested resources
'GET /users/:userId/posts/:postId/comments'
→ 'get_users_by_userId_posts_by_postId_comments'

// Special characters (normalized)
'GET /api/v1.0/users'
→ 'get_api_v1_0_users'

// Multiple segments
'POST /api/v2/organization/projects'
→ 'post_api_v2_organization_projects'
```

## Input Schema Generation

### Schema Structure

Every tool has an input schema following JSON Schema Draft 7:

```typescript
{
  type: 'object',
  properties: {
    // Path parameters (required)
    // Query parameters (optional)
    // Request body (for POST/PUT/PATCH)
  },
  required: ['param1', 'param2']  // Only path params
}
```

### Path Parameters

Path parameters (`:id`, `:userId`, etc.) become **required** schema properties:

#### Express Route
```typescript
app.get('/users/:id', ...)
```

#### Generated Schema
```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Path parameter: id"
    },
    "query": {
      "type": "object",
      "description": "Query string parameters (optional)",
      "additionalProperties": true
    }
  },
  "required": ["id"]
}
```

#### Multiple Path Parameters

```typescript
app.get('/users/:userId/posts/:postId', ...)
```

```json
{
  "type": "object",
  "properties": {
    "userId": {
      "type": "string",
      "description": "Path parameter: userId"
    },
    "postId": {
      "type": "string",
      "description": "Path parameter: postId"
    },
    "query": {
      "type": "object",
      "description": "Query string parameters (optional)",
      "additionalProperties": true
    }
  },
  "required": ["userId", "postId"]
}
```

### Query Parameters

All tools include a `query` property for query string parameters:

```json
{
  "query": {
    "type": "object",
    "description": "Query string parameters (optional)",
    "additionalProperties": true
  }
}
```

This allows passing any query parameters:

```json
// Tool call
{
  "name": "get_users",
  "arguments": {
    "query": {
      "page": "1",
      "limit": "10",
      "sort": "name"
    }
  }
}

// HTTP Request
GET /users?page=1&limit=10&sort=name
```

### Request Body

For `POST`, `PUT`, and `PATCH` methods, a `body` property is added:

#### Express Route
```typescript
app.post('/users', express.json(), ...)
```

#### Generated Schema
```json
{
  "type": "object",
  "properties": {
    "body": {
      "type": "object",
      "description": "Request body"
    },
    "query": {
      "type": "object",
      "description": "Query string parameters (optional)",
      "additionalProperties": true
    }
  },
  "required": []
}
```

#### Tool Call Example

```json
{
  "name": "post_users",
  "arguments": {
    "body": {
      "name": "Alice",
      "email": "alice@example.com"
    }
  }
}
```

This sends:
```http
POST /users
Content-Type: application/json

{
  "name": "Alice",
  "email": "alice@example.com"
}
```

### Combined Parameters

Routes with path params and request bodies:

#### Express Route
```typescript
app.put('/users/:id', express.json(), ...)
```

#### Generated Schema
```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Path parameter: id"
    },
    "body": {
      "type": "object",
      "description": "Request body"
    },
    "query": {
      "type": "object",
      "description": "Query string parameters (optional)",
      "additionalProperties": true
    }
  },
  "required": ["id"]
}
```

#### Tool Call Example

```json
{
  "name": "put_users_by_id",
  "arguments": {
    "id": "123",
    "body": {
      "name": "Alice Updated",
      "email": "alice.new@example.com"
    }
  }
}
```

## Complete Examples

### Example 1: Simple GET

**Express:**
```typescript
app.get('/users', (req, res) => {
  res.json([{ id: 1, name: 'Alice' }]);
});
```

**Generated Tool:**
```json
{
  "name": "get_users",
  "description": "GET /users",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "object",
        "description": "Query string parameters (optional)",
        "additionalProperties": true
      }
    }
  }
}
```

**Tool Call:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "get_users",
    "arguments": {
      "query": { "page": "1" }
    }
  }
}
```

### Example 2: GET with Path Parameter

**Express:**
```typescript
app.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id, name: 'Alice' });
});
```

**Generated Tool:**
```json
{
  "name": "get_users_by_id",
  "description": "GET /users/:id",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "Path parameter: id"
      },
      "query": {
        "type": "object",
        "description": "Query string parameters (optional)",
        "additionalProperties": true
      }
    },
    "required": ["id"]
  }
}
```

**Tool Call:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "get_users_by_id",
    "arguments": {
      "id": "123"
    }
  }
}
```

### Example 3: POST with Body

**Express:**
```typescript
app.post('/users', express.json(), (req, res) => {
  res.status(201).json({ id: 2, ...req.body });
});
```

**Generated Tool:**
```json
{
  "name": "post_users",
  "description": "POST /users",
  "inputSchema": {
    "type": "object",
    "properties": {
      "body": {
        "type": "object",
        "description": "Request body"
      },
      "query": {
        "type": "object",
        "description": "Query string parameters (optional)",
        "additionalProperties": true
      }
    }
  }
}
```

**Tool Call:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "post_users",
    "arguments": {
      "body": {
        "name": "Bob",
        "email": "bob@example.com",
        "age": 30
      }
    }
  }
}
```

### Example 4: PUT with Path and Body

**Express:**
```typescript
app.put('/users/:id', express.json(), (req, res) => {
  res.json({ id: req.params.id, ...req.body });
});
```

**Generated Tool:**
```json
{
  "name": "put_users_by_id",
  "description": "PUT /users/:id",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "Path parameter: id"
      },
      "body": {
        "type": "object",
        "description": "Request body"
      },
      "query": {
        "type": "object",
        "description": "Query string parameters (optional)",
        "additionalProperties": true
      }
    },
    "required": ["id"]
  }
}
```

**Tool Call:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "put_users_by_id",
    "arguments": {
      "id": "123",
      "body": {
        "name": "Alice Updated"
      }
    }
  }
}
```

### Example 5: Nested Routes

**Express:**
```typescript
const router = express.Router();
router.get('/posts/:id', (req, res) => {
  res.json({ id: req.params.id, title: 'Post Title' });
});

app.use('/api/v1', router);
```

**Generated Tool:**
```json
{
  "name": "get_api_v1_posts_by_id",
  "description": "GET /api/v1/posts/:id",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "Path parameter: id"
      },
      "query": {
        "type": "object",
        "description": "Query string parameters (optional)",
        "additionalProperties": true
      }
    },
    "required": ["id"]
  }
}
```

## Customizing Schemas

The generated schemas are intentionally generic. You can customize them by editing the generated file:

### Before (Generated)
```typescript
{
  name: 'post_users',
  inputSchema: {
    type: 'object',
    properties: {
      body: {
        type: 'object',
        description: 'Request body'
      }
    }
  }
}
```

### After (Customized)
```typescript
{
  name: 'post_users',
  description: 'Create a new user account',
  inputSchema: {
    type: 'object',
    properties: {
      body: {
        type: 'object',
        description: 'User data',
        properties: {
          name: { 
            type: 'string', 
            description: 'Full name',
            minLength: 1 
          },
          email: { 
            type: 'string', 
            format: 'email',
            description: 'Email address'
          },
          age: { 
            type: 'number', 
            minimum: 18,
            description: 'Age (must be 18+)'
          }
        },
        required: ['name', 'email']
      }
    },
    required: ['body']
  }
}
```

## Schema Best Practices

✅ **DO:**
- Keep generated schemas as starting point
- Add validation rules in customization
- Document parameter meanings in descriptions
- Use appropriate JSON Schema types

❌ **DON'T:**
- Over-specify in the generator (customize after)
- Remove the `query` parameter (useful for filtering)
- Make body required for PATCH (partial updates)

## Next Steps

- [Generated Files](./generated-files.md) - Understanding the generated code
- [Customization](./customization.md) - How to customize tool schemas
- [Nested Routers](./nested-routers.md) - Working with complex routing
