# GitHub MCP Server

A Model Context Protocol (MCP) server implementation with comprehensive GitHub integration for Cursor IDE. This server provides a robust API for managing code contexts and performing GitHub operations.

## Features

- **MCP Protocol Support**: Full implementation of the Model Context Protocol
- **GitHub Integration**: Comprehensive GitHub API integration
- **Bulk Operations**: Support for multi-file operations in single commits
- **Docker Support**: Ready to run in containers
- **Automatic Content Handling**: Built-in content encoding/decoding
- **Error Handling**: Comprehensive error handling and logging
- **Health Monitoring**: Built-in health check endpoint

## Quick Start

### Using Docker

1. Build the image:
   ```bash
   docker build -t mcp-server .
   ```

2. Run with Docker Compose:
   ```bash
   docker-compose up -d
   ```

### Manual Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   ```bash
   GITHUB_TOKEN=your_github_token
   NODE_ENV=production
   PORT=3000
   ```

3. Start the server:
   ```bash
   npm start
   ```

## API Documentation

### MCP Protocol Endpoints

#### Context Management

- **Initialize Context**
  ```http
  POST /v1/init
  ```
  Creates a new context for managing files and operations.

- **Add File to Context**
  ```http
  POST /v1/add_file
  Content-Type: application/json

  {
    "context_id": "ctx_123",
    "path": "file.txt",
    "content": "file content",
    "repo": "optional_repo_name",
    "branch": "optional_branch_name"
  }
  ```

- **Remove File from Context**
  ```http
  POST /v1/remove_file
  Content-Type: application/json

  {
    "context_id": "ctx_123",
    "path": "file.txt"
  }
  ```

- **Get Context**
  ```http
  GET /v1/get_context?context_id=ctx_123
  ```

- **Search in Context**
  ```http
  POST /v1/search
  Content-Type: application/json

  {
    "context_id": "ctx_123",
    "query": "search term"
  }
  ```

#### GitHub Operations

- **Push Multiple Files**
  ```http
  POST /v1/push_files
  Content-Type: application/json

  {
    "repoName": "repo_name",
    "branch": "main",
    "files": [
      {
        "path": "file1.txt",
        "content": "content1"
      },
      {
        "path": "file2.txt",
        "content": "content2"
      }
    ],
    "message": "Commit message"
  }
  ```

- **Get Files from GitHub**
  ```http
  POST /v1/github_files
  Content-Type: application/json

  {
    "repo": "repo_name",
    "branch": "main",
    "path": "optional/path"
  }
  ```

### GitHub Management Endpoints

- **List Repositories**
  ```http
  GET /repos
  ```

- **Create Repository**
  ```http
  POST /repo
  Content-Type: application/json

  {
    "repoName": "new_repo",
    "description": "Repository description",
    "private": true
  }
  ```

- **Branch Operations**
  ```http
  POST /branch    # Create branch
  DELETE /branch  # Delete branch
  GET /branch     # Get branch info
  ```

- **Pull Request Operations**
  ```http
  POST /pullrequest        # Create PR
  POST /pullrequest/merge  # Merge PR
  ```

- **File Operations**
  ```http
  PUT /commit   # Commit file
  GET /readme   # Get README
  GET /files    # List files
  GET /commits  # List commits
  ```

## Error Handling

The server provides detailed error responses in the following format:
```json
{
  "error": "Error description",
  "details": "Detailed error information"
}
```

## Health Check

Monitor server health using:
```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "github_token": true,
  "contexts": 5
}
```

## Docker Support

The server includes Docker support with:
- Multi-stage builds
- Volume support for logs
- Environment variable configuration
- Health checks
- Automatic restart capability

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License
