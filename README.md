# MCP GitHub Server
This server implements the Model Context Protocol (MCP) for Cursor IDE with GitHub integration.

# Features
1. Full Model Context Protocol implementation for Cursor IDE
2. GitHub operations API (repositories, branches, PRs, commits, etc.)
3. Dockerized for easy deployment
# Setup
### Prerequisites
Docker and Docker Compose
GitHub Personal Access Token
### Running with Docker
1. Clone this repository:
>bash git clone <your-repo-url>
>cd <your-repo-directory>
2. Set your GitHub token:
>bashexport GITHUB_TOKEN=your_github_personal_access_token
3. Start the server:
>bash docker-compose up -d
The server will be running at http://localhost:3000
Running Locally (without Docker)
4. Install dependencies:
>bash npm install
>Create a .env file with:
GITHUB_TOKEN=your_github_personal_access_token
PORT=3000
### Start the server:
>bash npm start
# API Endpoints
## MCP Endpoints
1. POST /v1/init - Initialize a new context
2. POST /v1/add_file - Add a file to context
3. POST /v1/remove_file - Remove a file from context
4. GET /v1/get_context - Get the current context
11. POST /v1/search - Search within context
12. POST /v1/github_files - Get files from GitHub repo
13. GitHub Operations
14. GET /repos - List repositories
15. POST /repo - Create repository
16. POST /branch - Create branch
17. DELETE /branch - Delete branch
18. POST /pullrequest - Create Pull Request
19. POST /pullrequest/merge - Merge Pull Request
20. PUT /commit - Commit or update a file
21. GET /readme - Read README file
22. GET /commits - List commits
23. GET /branch - Get branch info
24. GET /files - List files in repo
## Configuring Cursor IDE
In Cursor settings, set the MCP URL to: http://localhost:3000/v1

### Important Notes
Make sure to replace your_github_personal_access_token with your actual GitHub token
Update the OWNER constant in server.js to match your GitHub username
Contexts are stored in memory and will be lost if the server restarts
