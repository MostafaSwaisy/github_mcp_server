import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import { Octokit } from '@octokit/rest';

dotenv.config();

const app = express();
app.use(bodyParser.json({ limit: '50mb' }));  // Increased limit for larger code contexts

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const OWNER = 'MostafaSwaisy';

// Store context information
const contextStore = new Map();

// MCP Protocol endpoints
// 1. Initialize context
app.post('/v1/init', (req, res) => {
  const contextId = `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  contextStore.set(contextId, {
    created: new Date(),
    files: {},
    repoInfo: null
  });
  res.json({ context_id: contextId });
});

// 2. Add file to context
app.post('/v1/add_file', (req, res) => {
  const { context_id, path, content, repo, branch } = req.body;
  
  if (!contextStore.has(context_id)) {
    return res.status(404).json({ error: 'Context not found' });
  }
  
  const context = contextStore.get(context_id);
  context.files[path] = { content, added: new Date() };
  
  if (repo) {
    context.repoInfo = { repo, branch: branch || 'main' };
  }
  
  res.json({ success: true });
});

// 3. Remove file from context
app.post('/v1/remove_file', (req, res) => {
  const { context_id, path } = req.body;
  
  if (!contextStore.has(context_id)) {
    return res.status(404).json({ error: 'Context not found' });
  }
  
  const context = contextStore.get(context_id);
  if (context.files[path]) {
    delete context.files[path];
  }
  
  res.json({ success: true });
});

// 4. Get context
app.get('/v1/get_context', (req, res) => {
  const { context_id } = req.query;
  
  if (!contextStore.has(context_id)) {
    return res.status(404).json({ error: 'Context not found' });
  }
  
  const context = contextStore.get(context_id);
  res.json({
    files: Object.entries(context.files).map(([path, data]) => ({
      path,
      content: data.content
    })),
    repo_info: context.repoInfo
  });
});

// 5. Search in context
app.post('/v1/search', async (req, res) => {
  const { context_id, query } = req.body;
  
  if (!contextStore.has(context_id)) {
    return res.status(404).json({ error: 'Context not found' });
  }
  
  const context = contextStore.get(context_id);
  const results = [];
  
  for (const [path, data] of Object.entries(context.files)) {
    if (data.content.includes(query)) {
      results.push({
        path,
        matches: data.content.split('\n')
          .map((line, idx) => ({ line: idx + 1, content: line }))
          .filter(item => item.content.includes(query))
      });
    }
  }
  
  res.json({ results });
});

// Original GitHub operations endpoints (kept for compatibility)
app.get('/', (req, res) => {
  res.send(`
    <h2>MCP Server for Cursor IDE - GitHub Operations</h2>
    <p>This server implements the Model Context Protocol for Cursor IDE and also allows GitHub operations:</p>
    <h3>MCP Endpoints:</h3>
    <ul>
      <li>POST /v1/init - Initialize a new context</li>
      <li>POST /v1/add_file - Add a file to the context</li>
      <li>POST /v1/remove_file - Remove a file from the context</li>
      <li>GET /v1/get_context - Get the current context</li>
      <li>POST /v1/search - Search in the context</li>
    </ul>
    <h3>GitHub Operations:</h3>
    <ul>
      <li>GET /repos - List repositories</li>
      <li>POST /repo - Create repository</li>
      <li>POST /branch - Create branch</li>
      <li>DELETE /branch - Delete branch</li>
      <li>POST /pullrequest - Create Pull Request</li>
      <li>POST /pullrequest/merge - Merge Pull Request</li>
      <li>PUT /commit - Commit or update a file</li>
      <li>GET /readme - Read README file</li>
      <li>GET /commits - List commits</li>
      <li>GET /branch - Get branch info</li>
      <li>GET /files - List files in repo</li>
    </ul>
  `);
});

// 1. List repositories for owner
app.get('/repos', async (req, res) => {
  try {
    const repos = await octokit.repos.listForUser({ username: OWNER });
    res.json(repos.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create repository
app.post('/repo', async (req, res) => {
  const { repoName, description, private: isPrivate } = req.body;
  try {
    const repo = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      description: description || '',
      private: !!isPrivate,
    });
    res.json(repo.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: get sha of branch ref
async function getRefSha(repo, ref) {
  const refData = await octokit.git.getRef({
    owner: OWNER,
    repo,
    ref,
  });
  return refData.data.object.sha;
}

// 3. Create branch
app.post('/branch', async (req, res) => {
  const { repoName, newBranchName, fromBranch = 'main' } = req.body;
  try {
    const sha = await getRefSha(repoName, `heads/${fromBranch}`);

    const newBranch = await octokit.git.createRef({
      owner: OWNER,
      repo: repoName,
      ref: `refs/heads/${newBranchName}`,
      sha,
    });
    res.json(newBranch.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete branch
app.delete('/branch', async (req, res) => {
  const { repoName, branchName } = req.body;
  try {
    await octokit.git.deleteRef({
      owner: OWNER,
      repo: repoName,
      ref: `heads/${branchName}`,
    });
    res.json({ message: `Branch ${branchName} deleted.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Create Pull Request
app.post('/pullrequest', async (req, res) => {
  const { repoName, title, headBranch, baseBranch = 'main', body } = req.body;
  try {
    const pr = await octokit.pulls.create({
      owner: OWNER,
      repo: repoName,
      title,
      head: headBranch,
      base: baseBranch,
      body: body || '',
    });
    res.json(pr.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Merge Pull Request
app.post('/pullrequest/merge', async (req, res) => {
  const { repoName, pullNumber, commitTitle, commitMessage } = req.body;
  try {
    const merge = await octokit.pulls.merge({
      owner: OWNER,
      repo: repoName,
      pull_number: pullNumber,
      commit_title: commitTitle || `Merge PR #${pullNumber}`,
      commit_message: commitMessage || '',
    });
    res.json(merge.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Commit or update a file
app.put('/commit', async (req, res) => {
  const { repoName, branch = 'main', path, content, message } = req.body;
  try {
    // Get SHA of existing file if any
    let sha;
    try {
      const file = await octokit.repos.getContent({
        owner: OWNER,
        repo: repoName,
        path,
        ref: branch,
      });
      sha = file.data.sha;
    } catch {
      // file doesn't exist yet
      sha = undefined;
    }

    // Encode content to base64
    const encodedContent = Buffer.from(content).toString('base64');

    const commit = await octokit.repos.createOrUpdateFileContents({
      owner: OWNER,
      repo: repoName,
      path,
      message,
      content: encodedContent,
      branch,
      sha,
    });
    res.json(commit.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Read README file
app.get('/readme', async (req, res) => {
  const { repoName, branch = 'main' } = req.query;
  try {
    const readme = await octokit.repos.getReadme({
      owner: OWNER,
      repo: repoName,
      ref: branch,
    });
    // Decode content from base64
    const content = Buffer.from(readme.data.content, 'base64').toString();
    res.send(content);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. List commits
app.get('/commits', async (req, res) => {
  const { repoName, branch = 'main' } = req.query;
  try {
    const commits = await octokit.repos.listCommits({
      owner: OWNER,
      repo: repoName,
      sha: branch,
    });
    res.json(commits.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Get branch info
app.get('/branch', async (req, res) => {
  const { repoName, branchName } = req.query;
  try {
    const branch = await octokit.repos.getBranch({
      owner: OWNER,
      repo: repoName,
      branch: branchName,
    });
    res.json(branch.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. List files in repo root or specific path
app.get('/files', async (req, res) => {
  const { repoName, path = '', branch = 'main' } = req.query;
  try {
    const files = await octokit.repos.getContent({
      owner: OWNER,
      repo: repoName,
      path,
      ref: branch,
    });
    res.json(files.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MCP endpoint to get files from GitHub repo
app.post('/v1/github_files', async (req, res) => {
  const { repo, branch = 'main', path = '' } = req.body;
  
  try {
    const files = await octokit.repos.getContent({
      owner: OWNER,
      repo,
      path,
      ref: branch,
    });
    
    const result = [];
    
    // Process array of files or a single file
    const fileItems = Array.isArray(files.data) ? files.data : [files.data];
    
    for (const item of fileItems) {
      if (item.type === 'file') {
        const content = await octokit.repos.getContent({
          owner: OWNER,
          repo,
          path: item.path,
          ref: branch,
        });
        
        result.push({
          path: item.path,
          content: Buffer.from(content.data.content, 'base64').toString('utf-8')
        });
      }
    }
    
    res.json({ files: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add cleanup mechanism for old contexts (run every hour)
setInterval(() => {
  const now = new Date();
  for (const [contextId, context] of contextStore.entries()) {
    // Remove contexts older than 24 hours
    if ((now - context.created) > 24 * 60 * 60 * 1000) {
      contextStore.delete(contextId);
    }
  }
}, 60 * 60 * 1000);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP GitHub server running on port ${PORT}`);
  console.log(`Model Context Protocol enabled for Cursor IDE`);
});