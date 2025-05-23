# 🚀 GitHub MCP Server

> A powerful Model Context Protocol server that seamlessly integrates with GitHub, making your Cursor IDE experience smoother than ever.

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/MostafaSwaisy/github_mcp_server/blob/main/LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://github.com/MostafaSwaisy/github_mcp_server/blob/main/docker-compose.yml)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?logo=node.js)](https://nodejs.org)

## ✨ Why Choose This Server?

- 🔄 **Seamless GitHub Integration** - Push, pull, and manage your code with zero friction
- 🎯 **Built for Cursor IDE** - Perfect companion for your favorite IDE
- 🛡️ **Rock-solid Reliability** - Enterprise-grade error handling and logging
- 🐳 **Docker Ready** - Deploy anywhere in seconds
- 🔍 **Smart Context Management** - Efficient code organization and search
- 🚦 **Health Monitoring** - Always know your server's status

## 🚀 Quick Start

### 🐳 Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/MostafaSwaisy/github_mcp_server.git

# Navigate to the project
cd github_mcp_server

# Start with Docker Compose
docker-compose up -d
```

That's it! Your server is running at http://localhost:3000 🎉

### 🛠️ Manual Setup

```bash
# Install dependencies
npm install

# Set your GitHub token
export GITHUB_TOKEN=your_github_token

# Start the server
npm start
```

## 🎯 Key Features

### 🔗 GitHub Integration
- Create and manage repositories
- Handle multiple files in single commits
- Manage branches and pull requests
- Access repository content seamlessly

### 📦 Context Management
- Create and manage code contexts
- Add/remove files from contexts
- Search within contexts
- Bulk operations support

### 🛡️ Enterprise Ready
- Comprehensive error handling
- Detailed logging system
- Health monitoring
- Docker support with auto-restart

## 🔌 API Examples

### Create a New Context
```http
POST /v1/init
```

### Push Multiple Files
```http
POST /v1/push_files
Content-Type: application/json

{
  "repoName": "awesome-project",
  "branch": "main",
  "files": [
    {
      "path": "src/app.js",
      "content": "console.log('Hello, World!');"
    }
  ],
  "message": "Add main application file"
}
```

### Search in Context
```http
POST /v1/search
Content-Type: application/json

{
  "context_id": "ctx_123",
  "query": "function main"
}
```

## 🔧 Configuration

### Environment Variables
```env
GITHUB_TOKEN=your_github_token    # Required
NODE_ENV=production              # Optional (default: development)
PORT=3000                       # Optional (default: 3000)
```

## 📊 Health Monitoring

Check server status:
```http
GET /health

Response:
{
  "status": "healthy",
  "github_token": true,
  "contexts": 5
}
```

## 🤝 Contributing

We love contributions! Here's how you can help:

1. 🍴 Fork the repository
2. 🌿 Create your feature branch
3. 💻 Make your changes
4. 🚀 Push to your branch
5. 📬 Open a Pull Request

## 📝 License

This project is licensed under the MIT License - making it perfect for both personal and commercial use.

## 🌟 Support

Love this project? Give it a star ⭐️ on GitHub!

---
Made with ❤️ for the Cursor IDE community
