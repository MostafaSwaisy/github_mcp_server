import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import { Octokit } from '@octokit/rest';
import winston from 'winston';
import Joi from 'joi';

dotenv.config();

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

const app = express();
app.use(bodyParser.json({ limit: '50mb' }));

// Validate GitHub token presence
if (!process.env.GITHUB_TOKEN) {
  logger.error('GITHUB_TOKEN not found in environment variables');
  process.exit(1);
}

const OWNER = process.env.GITHUB_USERNAME || 'MostafaSwaisy';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// Context store for MCP protocol
const contextStore = new Map();

// Joi validation schemas
const schemas = {
  createRepo: Joi.object({
    repoName: Joi.string().required().min(1),
    description: Joi.string().allow('').default(''),
    private: Joi.boolean().default(false)
  }),

  createBranch: Joi.object({
    repoName: Joi.string().required(),
    newBranchName: Joi.string().required(),
    fromBranch: Joi.string().default('main')
  }),

  deleteBranch: Joi.object({
    repoName: Joi.string().required(),
    branchName: Joi.string().required()
  }),

  createPR: Joi.object({
    repoName: Joi.string().required(),
    title: Joi.string().required(),
    headBranch: Joi.string().required(),
    baseBranch: Joi.string().default('main'),
    body: Joi.string().allow('').default('')
  }),

  mergePR: Joi.object({
    repoName: Joi.string().required(),
    pullNumber: Joi.number().required(),
    commitTitle: Joi.string().optional(),
    commitMessage: Joi.string().allow('').default('')
  }),

  commit: Joi.object({
    repoName: Joi.string().required(),
    branch: Joi.string().default('main'),
    path: Joi.string().required(),
    content: Joi.string().required(),
    message: Joi.string().required()
  }),

  addFile: Joi.object({
    context_id: Joi.string().required(),
    path: Joi.string().required(),
    content: Joi.string().required(),
    repo: Joi.string().optional(),
    branch: Joi.string().default('main')
  }),

  pushFiles: Joi.object({
    repoName: Joi.string().required(),
    branch: Joi.string().default('main'),
    files: Joi.array().items(Joi.object({
      path: Joi.string().required(),
      content: Joi.string().required()
    })).required(),
    message: Joi.string().required()
  }),

  githubFiles: Joi.object({
    repo: Joi.string().required(),
    branch: Joi.string().default('main'),
    path: Joi.string().default('')
  })
};

// Middleware: input validation with Joi
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      logger.error('Validation error:', error.details);
      return res.status(400).json({ error: 'Validation error', details: error.details[0].message });
    }
    req.body = value;
    next();
  };
};

// Helpers for encoding/decoding content base64
const encodeContent = (content) => Buffer.from(content, 'utf8').toString('base64');
const decodeContent = (content) => Buffer.from(content, 'base64').toString('utf8');

// Helper to get ref SHA of a branch
async function getRefSha(repo, ref) {
  try {
    const refData = await octokit.git.getRef({ owner: OWNER, repo, ref: `heads/${ref}` });
    return refData.data.object.sha;
  } catch (err) {
    logger.error(`Failed to get SHA for ${repo}/${ref}: ${err.message}`);
    throw err;
  }
}

// Helper to check repo existence
async function checkRepoExists(repoName) {
  try {
    await octokit.repos.get({ owner: OWNER, repo: repoName });
    return true;
  } catch (err) {
    if (err.status === 404) return false;
    throw err;
  }
}

// Helper to generate commit messages
const generateCommitMessage = (files) => {
  if (files.length === 1) return `Update ${files[0].path}`;
  if (files.length <= 3) return `Update ${files.map(f => f.path).join(', ')}`;
  return `Update ${files.length} files`;
};

// === MCP Protocol endpoints ===

// Init new context
app.post('/v1/init', (req, res) => {
  try {
    const contextId = `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    contextStore.set(contextId, { created: new Date(), files: {}, repoInfo: null });
    logger.info(`Created context ${contextId}`);
    res.json({ success: true, context_id: contextId, message: 'Context initialized successfully' });
  } catch (err) {
    logger.error('Error initializing context:', err);
    res.status(500).json({ error: 'Failed to initialize context' });
  }
});

// Add file to context
app.post('/v1/add_file', validateInput(schemas.addFile), (req, res) => {
  const { context_id, path, content, repo, branch } = req.body;
  if (!contextStore.has(context_id)) return res.status(404).json({ error: 'Context not found' });
  const context = contextStore.get(context_id);
  context.files[path] = { content: encodeContent(content), added: new Date(), size: Buffer.byteLength(content, 'utf8') };
  if (repo) context.repoInfo = { repo, branch: branch || 'main' };
  logger.info(`Added file ${path} to context ${context_id}`);
  res.json({ success: true, message: `File ${path} added`, file_count: Object.keys(context.files).length });
});

// Remove file from context
app.post('/v1/remove_file', (req, res) => {
  const { context_id, path } = req.body;
  if (!context_id || !path) return res.status(400).json({ error: 'context_id and path required' });
  if (!contextStore.has(context_id)) return res.status(404).json({ error: 'Context not found' });
  const context = contextStore.get(context_id);
  if (context.files[path]) {
    delete context.files[path];
    logger.info(`Removed file ${path} from context ${context_id}`);
    res.json({ success: true, message: `File ${path} removed` });
  } else {
    res.status(404).json({ error: 'File not found in context' });
  }
});

// Get context info
app.get('/v1/get_context', (req, res) => {
  const { context_id } = req.query;
  if (!context_id) return res.status(400).json({ error: 'context_id required' });
  if (!contextStore.has(context_id)) return res.status(404).json({ error: 'Context not found' });
  const context = contextStore.get(context_id);
  res.json({
    context_id,
    created: context.created,
    files: Object.entries(context.files).map(([path, data]) => ({
      path,
      content: decodeContent(data.content),
      added: data.added,
      size: data.size
    })),
    repo_info: context.repoInfo,
    file_count: Object.keys(context.files).length
  });
});

// Search in context files
app.post('/v1/search', (req, res) => {
  const { context_id, query } = req.body;
  if (!context_id || !query) return res.status(400).json({ error: 'context_id and query required' });
  if (!contextStore.has(context_id)) return res.status(404).json({ error: 'Context not found' });
  const context = contextStore.get(context_id);
  const results = [];
  for (const [path, data] of Object.entries(context.files)) {
    const content = decodeContent(data.content);
    const lines = content.split('\n');
    const matches = [];
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes(query.toLowerCase())) {
        matches.push({ line: i + 1, content: line, preview: line.length > 100 ? line.slice(0, 100) + '...' : line });
      }
    });
    if (matches.length > 0) {
      results.push({ path, matches, match_count: matches.length });
    }
  }
  res.json({ results, total_matches: results.reduce((a, b) => a + b.match_count, 0), files_searched: Object.keys(context.files).length });
});

// Get files from GitHub repo (path can be folder or file)
app.post('/v1/github_files', validateInput(schemas.githubFiles), async (req, res) => {
  const { repo, branch, path } = req.body;
  try {
    if (!await checkRepoExists(repo)) return res.status(404).json({ error: `Repository ${repo} not found` });

    const response = await octokit.repos.getContent({ owner: OWNER, repo, path, ref: branch });
    const fileItems = Array.isArray(response.data) ? response.data : [response.data];
    const result = [];

    for (const item of fileItems) {
      if (item.type === 'file') {
        try {
          const fileContent = await octokit.repos.getContent({ owner: OWNER, repo, path: item.path, ref: branch });
          result.push({
            path: item.path,
            content: decodeContent(fileContent.data.content),
            size: item.size,
            sha: item.sha
          });
        } catch (e) {
          logger.warn(`Failed to get content for ${item.path}: ${e.message}`);
          result.push({ path: item.path, error: 'Failed to read content', size: item.size, sha: item.sha });
        }
      } else if (item.type === 'dir') {
        result.push({ path: item.path, type: 'directory', size: 0 });
      }
    }

    res.json({ files: result, repo, branch, path: path || 'root' });
  } catch (err) {
    logger.error(`Error fetching GitHub files: ${err.message}`);
    res.status(500).json({ error: 'Failed to get files from repository', details: err.message });
  }
});

// Push multiple files in a single commit
app.post('/v1/push_files', validateInput(schemas.pushFiles), async (req, res) => {
  const { repoName, branch, files, message } = req.body;
  try {
    if (!await checkRepoExists(repoName)) return res.status(404).json({ error: `Repository ${repoName} not found` });

    // Get ref and latest commit
    const ref = await octokit.git.getRef({ owner: OWNER, repo: repoName, ref: `heads/${branch}` });
    const latestCommitSha = ref.data.object.sha;
    const latestCommit = await octokit.git.getCommit({ owner: OWNER, repo: repoName, commit_sha: latestCommitSha });

    // Create blobs for files
    const blobs = await Promise.all(files.map(async (file) => {
      const blob = await octokit.git.createBlob({
        owner: OWNER,
        repo: repoName,
        content: encodeContent(file.content),
        encoding: 'base64'
      });
      return { path: file.path, mode: '100644', type: 'blob', sha: blob.data.sha };
    }));

    // Create tree
    const tree = await octokit.git.createTree({
      owner: OWNER,
      repo: repoName,
      base_tree: latestCommit.data.tree.sha,
      tree: blobs
    });

    // Create commit
    const commit = await octokit.git.createCommit({
      owner: OWNER,
      repo: repoName,
      message,
      tree: tree.data.sha,
      parents: [latestCommit.data.sha]
    });

    // Update ref to new commit
    await octokit.git.updateRef({ owner: OWNER, repo: repoName, ref: `heads/${branch}`, sha: commit.data.sha });

    logger.info(`Pushed ${files.length} files to ${repoName}/${branch}`);
    res.json({
      success: true,
      commit: { sha: commit.data.sha, message: commit.data.message, url: commit.data.html_url },
      files: blobs.map(b => ({ path: b.path, sha: b.sha })),
      repository: `${OWNER}/${repoName}`,
      branch
    });
  } catch (err) {
    logger.error('Error pushing files:', err);
    res.status(500).json({ error: 'Failed to push files', details: err.message });
  }
});

// Generate commit message from files and type
app.post('/v1/generate_commit_message', (req, res) => {
  const { files, type = 'update' } = req.body;
  if (!files || !Array.isArray(files)) return res.status(400).json({ error: 'files array required' });
  const fileNames = files.map(f => f.path || f);

  let message;
  switch (type) {
    case 'feat':
      message = files.length === 1 ? `feat: add ${fileNames[0]}` : `feat: add ${files.length} new files`;
      break;
    case 'fix':
      message = files.length === 1 ? `fix: resolve issue in ${fileNames[0]}` : `fix: resolve issues in ${files.length} files`;
      break;
    case 'docs':
      message = files.length === 1 ? `docs: update ${fileNames[0]}` : `docs: update documentation`;
      break;
    case 'refactor':
      message = files.length === 1 ? `refactor: improve ${fileNames[0]}` : `refactor: improve code structure`;
      break;
    default:
      message = generateCommitMessage(fileNames.map(name => ({ path: name })));
  }

  res.json({
    message,
    type,
    files: fileNames,
    suggestions: [
      generateCommitMessage(fileNames.map(name => ({ path: name }))),
      `${type}: ${files.length === 1 ? fileNames[0] : `${files.length} files`}`,
      `Update project files (${files.length} files modified)`
    ]
  });
});

// === GitHub Operations endpoints ===

// List all repositories for authenticated user
app.get('/repos', async (req, res) => {
  try {
    const { type = 'all', sort = 'updated', per_page = 30 } = req.query;
    const repos = await octokit.repos.listForAuthenticatedUser({ type, sort, per_page: parseInt(per_page) });
    const repoData = repos.data.map(r => ({
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      private: r.private,
      html_url: r.html_url,
      clone_url: r.clone_url,
      ssh_url: r.ssh_url,
      default_branch: r.default_branch,
      created_at: r.created_at,
      updated_at: r.updated_at,
      size: r.size,
      stargazers_count: r.stargazers_count,
      language: r.language
    }));
    res.json({ total: repoData.length, repositories: repoData });
  } catch (err) {
    logger.error('Error listing repositories:', err);
    res.status(500).json({ error: 'Failed to list repositories', details: err.message });
  }
});

// Create new repository
app.post('/repo', validateInput(schemas.createRepo), async (req, res) => {
  const { repoName, description, private: isPrivate } = req.body;
  try {
    const repo = await octokit.repos.createForAuthenticatedUser({ name: repoName, description, private: isPrivate, auto_init: true });
    logger.info(`Created repository: ${repoName}`);
    res.json({
      success: true,
      repository: {
        name: repo.data.name,
        full_name: repo.data.full_name,
        description: repo.data.description,
        private: repo.data.private,
        html_url: repo.data.html_url,
        clone_url: repo.data.clone_url,
        ssh_url: repo.data.ssh_url
      }
    });
  } catch (err) {
    logger.error(`Error creating repo ${repoName}:`, err);
    res.status(500).json({ error: 'Failed to create repository', details: err.message });
  }
});

// Get repository info
app.get('/repo/:repoName', async (req, res) => {
  const { repoName } = req.params;
  try {
    const repo = await octokit.repos.get({ owner: OWNER, repo: repoName });
    res.json({
      name: repo.data.name,
      full_name: repo.data.full_name,
      description: repo.data.description,
      private: repo.data.private,
      html_url: repo.data.html_url,
      clone_url: repo.data.clone_url,
      ssh_url: repo.data.ssh_url,
      default_branch: repo.data.default_branch,
      created_at: repo.data.created_at,
      updated_at: repo.data.updated_at,
      size: repo.data.size,
      stargazers_count: repo.data.stargazers_count,
      watchers_count: repo.data.watchers_count,
      forks_count: repo.data.forks_count,
      language: repo.data.language,
      topics: repo.data.topics
    });
  } catch (err) {
    if (err.status === 404) {
      res.status(404).json({ error: 'Repository not found' });
    } else {
      logger.error(`Error fetching repo info for ${repoName}:`, err);
      res.status(500).json({ error: 'Failed to get repository info', details: err.message });
    }
  }
});

// Create a new branch
app.post('/branch', validateInput(schemas.createBranch), async (req, res) => {
  const { repoName, newBranchName, fromBranch } = req.body;
  try {
    if (!await checkRepoExists(repoName)) return res.status(404).json({ error: 'Repository not found' });
    // Get base branch SHA
    const baseRef = await octokit.git.getRef({ owner: OWNER, repo: repoName, ref: `heads/${fromBranch}` });
    // Create new branch ref
    await octokit.git.createRef({ owner: OWNER, repo: repoName, ref: `refs/heads/${newBranchName}`, sha: baseRef.data.object.sha });
    logger.info(`Created branch ${newBranchName} in repo ${repoName} from ${fromBranch}`);
    res.json({ success: true, message: `Branch ${newBranchName} created from ${fromBranch}` });
  } catch (err) {
    logger.error('Error creating branch:', err);
    if (err.status === 422) {
      return res.status(422).json({ error: `Branch ${newBranchName} already exists` });
    }
    res.status(500).json({ error: 'Failed to create branch', details: err.message });
  }
});

// Delete a branch
app.delete('/branch', validateInput(schemas.deleteBranch), async (req, res) => {
  const { repoName, branchName } = req.body;
  try {
    if (!await checkRepoExists(repoName)) return res.status(404).json({ error: 'Repository not found' });
    if (branchName === 'main' || branchName === 'master') {
      return res.status(400).json({ error: 'Cannot delete main or master branch' });
    }
    await octokit.git.deleteRef({ owner: OWNER, repo: repoName, ref: `heads/${branchName}` });
    logger.info(`Deleted branch ${branchName} from repo ${repoName}`);
    res.json({ success: true, message: `Branch ${branchName} deleted` });
  } catch (err) {
    if (err.status === 422 || err.status === 404) {
      res.status(404).json({ error: `Branch ${branchName} not found` });
    } else {
      logger.error('Error deleting branch:', err);
      res.status(500).json({ error: 'Failed to delete branch', details: err.message });
    }
  }
});

// List all branches in a repository
app.get('/branches', async (req, res) => {
  const repoName = req.query.repoName;
  if (!repoName) return res.status(400).json({ error: 'repoName query parameter required' });
  try {
    if (!await checkRepoExists(repoName)) return res.status(404).json({ error: 'Repository not found' });
    const branches = await octokit.repos.listBranches({ owner: OWNER, repo: repoName });
    res.json({ total: branches.data.length, branches: branches.data.map(b => ({ name: b.name, commit_sha: b.commit.sha })) });
  } catch (err) {
    logger.error('Error listing branches:', err);
    res.status(500).json({ error: 'Failed to list branches', details: err.message });
  }
});

// Create pull request
app.post('/pullrequest', validateInput(schemas.createPR), async (req, res) => {
  const { repoName, title, headBranch, baseBranch, body } = req.body;
  try {
    if (!await checkRepoExists(repoName)) return res.status(404).json({ error: 'Repository not found' });
    const pr = await octokit.pulls.create({
      owner: OWNER,
      repo: repoName,
      title,
      head: headBranch,
      base: baseBranch,
      body
    });
    logger.info(`Created PR #${pr.data.number} in ${repoName}`);
    res.json({ success: true, pull_request: pr.data });
  } catch (err) {
    logger.error('Error creating pull request:', err);
    res.status(500).json({ error: 'Failed to create pull request', details: err.message });
  }
});

// Merge pull request
app.post('/pullrequest/merge', validateInput(schemas.mergePR), async (req, res) => {
  const { repoName, pullNumber, commitTitle, commitMessage } = req.body;
  try {
    if (!await checkRepoExists(repoName)) return res.status(404).json({ error: 'Repository not found' });
    const merge = await octokit.pulls.merge({
      owner: OWNER,
      repo: repoName,
      pull_number: pullNumber,
      commit_title: commitTitle,
      commit_message: commitMessage,
      merge_method: 'merge'
    });
    logger.info(`Merged PR #${pullNumber} in ${repoName}`);
    res.json({ success: true, merge });
  } catch (err) {
    logger.error('Error merging pull request:', err);
    res.status(500).json({ error: 'Failed to merge pull request', details: err.message });
  }
});

// Commit or update a single file in repo
app.put('/commit', validateInput(schemas.commit), async (req, res) => {
  const { repoName, branch = 'main', path, content, message } = req.body;
  try {
    if (!await checkRepoExists(repoName)) return res.status(404).json({ error: 'Repository not found' });

    // Get latest commit sha
    const ref = await octokit.git.getRef({ owner: OWNER, repo: repoName, ref: `heads/${branch}` });
    const latestCommitSha = ref.data.object.sha;

    // Get tree SHA of latest commit
    const latestCommit = await octokit.git.getCommit({ owner: OWNER, repo: repoName, commit_sha: latestCommitSha });
    const baseTreeSha = latestCommit.data.tree.sha;

    // Create blob for new content
    const blob = await octokit.git.createBlob({
      owner: OWNER,
      repo: repoName,
      content: encodeContent(content),
      encoding: 'base64'
    });

    // Create new tree including this file
    const newTree = await octokit.git.createTree({
      owner: OWNER,
      repo: repoName,
      base_tree: baseTreeSha,
      tree: [{
        path,
        mode: '100644',
        type: 'blob',
        sha: blob.data.sha
      }]
    });

    // Create new commit
    const commit = await octokit.git.createCommit({
      owner: OWNER,
      repo: repoName,
      message,
      tree: newTree.data.sha,
      parents: [latestCommitSha]
    });

    // Update ref to point to new commit
    await octokit.git.updateRef({ owner: OWNER, repo: repoName, ref: `heads/${branch}`, sha: commit.data.sha });

    logger.info(`Committed single file ${path} to ${repoName}/${branch}`);
    res.json({ success: true, commit_sha: commit.data.sha, message: commit.data.message, url: commit.data.html_url });
  } catch (err) {
    logger.error('Error committing single file:', err);
    res.status(500).json({ error: 'Failed to commit file', details: err.message });
  }
});

// List files in repo or path
app.get('/files', async (req, res) => {
  const { repoName, path = '', branch = 'main' } = req.query;
  if (!repoName) return res.status(400).json({ error: 'repoName required' });
  try {
    if (!await checkRepoExists(repoName)) return res.status(404).json({ error: 'Repository not found' });
    const response = await octokit.repos.getContent({ owner: OWNER, repo: repoName, path, ref: branch });
    res.json({ files: response.data });
  } catch (err) {
    logger.error('Error listing files:', err);
    res.status(500).json({ error: 'Failed to list files', details: err.message });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test GitHub token by fetching user
    const user = await octokit.users.getAuthenticated();
    res.json({ status: 'ok', user: user.data.login, server_uptime_seconds: process.uptime() });
  } catch (err) {
    logger.error('Health check failed:', err);
    res.status(500).json({ status: 'error', error: 'GitHub token invalid or API unreachable' });
  }
});

// List all endpoints
app.get('/endpoints', (req, res) => {
  const endpoints = [
    // MCP Protocol
    { method: 'POST', path: '/v1/init', description: 'Initialize a new context' },
    { method: 'POST', path: '/v1/add_file', description: 'Add file to context' },
    { method: 'POST', path: '/v1/remove_file', description: 'Remove file from context' },
    { method: 'GET', path: '/v1/get_context', description: 'Get current context' },
    { method: 'POST', path: '/v1/search', description: 'Search in context' },
    { method: 'POST', path: '/v1/push_files', description: 'Push multiple files' },
    { method: 'POST', path: '/v1/github_files', description: 'Get files from GitHub repo' },
    { method: 'POST', path: '/v1/generate_commit_message', description: 'Generate commit messages' },
    // GitHub Operations
    { method: 'GET', path: '/repos', description: 'List repositories' },
    { method: 'POST', path: '/repo', description: 'Create repository' },
    { method: 'GET', path: '/repo/:repoName', description: 'Get repository info' },
    { method: 'POST', path: '/branch', description: 'Create branch' },
    { method: 'DELETE', path: '/branch', description: 'Delete branch' },
    { method: 'GET', path: '/branches', description: 'List branches' },
    { method: 'POST', path: '/pullrequest', description: 'Create pull request' },
    { method: 'POST', path: '/pullrequest/merge', description: 'Merge pull request' },
    { method: 'PUT', path: '/commit', description: 'Commit single file' },
    { method: 'GET', path: '/files', description: 'List files in repository' },
    { method: 'GET', path: '/health', description: 'Health check' },
    { method: 'GET', path: '/endpoints', description: 'List all endpoints' },
  ];

  res.json({
    total: endpoints.length,
    endpoints,
    server_info: {
      owner: OWNER,
      contexts: contextStore.size,
      uptime_seconds: process.uptime()
    }
  });
});
// API Documentation
app.get('/apidocs', (req, res) => {
  const endpoints = [
    // MCP Protocol
    { category: 'MCP Protocol', method: 'POST', path: '/v1/init', description: 'Initialize a new context', body: '{}', query: '' },
    { category: 'MCP Protocol', method: 'POST', path: '/v1/add_file', description: 'Add file to context', body: `{
  "context_id": "string (required)",
  "path": "string (required) - file path",
  "content": "string (required) - file content",
  "repo": "string (optional) - repo name",
  "branch": "string (optional, default main)"
}`, query: '' },
    { category: 'MCP Protocol', method: 'POST', path: '/v1/remove_file', description: 'Remove file from context', body: `{
  "context_id": "string (required)",
  "path": "string (required)"
}`, query: '' },
    { category: 'MCP Protocol', method: 'GET', path: '/v1/get_context', description: 'Get current context', body: '', query: 'context_id=string (required)' },
    { category: 'MCP Protocol', method: 'POST', path: '/v1/search', description: 'Search in context', body: `{
  "context_id": "string (required)",
  "query": "string (required)"
}`, query: '' },
    { category: 'MCP Protocol', method: 'POST', path: '/v1/push_files', description: 'Push multiple files', body: `{
  "repoName": "string (required)",
  "branch": "string (optional, default main)",
  "files": "[{ path: string, content: string }] (required)",
  "message": "string (required) - commit message"
}`, query: '' },
    { category: 'MCP Protocol', method: 'POST', path: '/v1/github_files', description: 'Get files from GitHub repo', body: `{
  "repo": "string (required)",
  "branch": "string (optional, default main)",
  "path": "string (optional)"
}`, query: '' },
    { category: 'MCP Protocol', method: 'POST', path: '/v1/generate_commit_message', description: 'Generate commit messages', body: `{
  "files": "[{ path: string }] (required)",
  "type": "string (optional) - feat, fix, docs, refactor, update"
}`, query: '' },

    // GitHub Operations
    { category: 'GitHub Operations', method: 'GET', path: '/repos', description: 'List repositories', body: '', query: `type=all|owner|member (optional)
sort=created|updated|pushed|full_name (optional)
per_page=number (optional)` },
    { category: 'GitHub Operations', method: 'POST', path: '/repo', description: 'Create repository', body: `{
  "repoName": "string (required)",
  "description": "string (optional)",
  "private": "boolean (optional, default false)"
}`, query: '' },
    { category: 'GitHub Operations', method: 'GET', path: '/repo/:repoName', description: 'Get repository info', body: '', query: '' },
    { category: 'GitHub Operations', method: 'POST', path: '/branch', description: 'Create branch', body: `{
  "repoName": "string (required)",
  "newBranchName": "string (required)",
  "fromBranch": "string (optional, default main)"
}`, query: '' },
    { category: 'GitHub Operations', method: 'DELETE', path: '/branch', description: 'Delete branch', body: `{
  "repoName": "string (required)",
  "branchName": "string (required)"
}`, query: '' },
    { category: 'GitHub Operations', method: 'GET', path: '/branches', description: 'List branches', body: '', query: 'repoName=string (required)' },
    { category: 'GitHub Operations', method: 'POST', path: '/pullrequest', description: 'Create pull request', body: `{
  "repoName": "string (required)",
  "title": "string (required)",
  "headBranch": "string (required)",
  "baseBranch": "string (optional, default main)",
  "body": "string (optional)"
}`, query: '' },
    { category: 'GitHub Operations', method: 'POST', path: '/pullrequest/merge', description: 'Merge pull request', body: `{
  "repoName": "string (required)",
  "pullNumber": "number (required)",
  "commitTitle": "string (optional)",
  "commitMessage": "string (optional)"
}`, query: '' },
    { category: 'GitHub Operations', method: 'PUT', path: '/commit', description: 'Commit single file', body: `{
  "repoName": "string (required)",
  "branch": "string (optional, default main)",
  "path": "string (required) - file path",
  "content": "string (required) - file content",
  "message": "string (required) - commit message"
}`, query: '' },
    { category: 'GitHub Operations', method: 'GET', path: '/files', description: 'List files in repository', body: '', query: `repoName=string (required)
path=string (optional)
branch=string (optional, default main)` },
    { category: 'GitHub Operations', method: 'GET', path: '/health', description: 'Health check', body: '', query: '' },
    { category: 'GitHub Operations', method: 'GET', path: '/endpoints', description: 'List all endpoints', body: '', query: '' }
  ];

  // Group by category
  const grouped = {};
  endpoints.forEach(ep => {
    if (!grouped[ep.category]) grouped[ep.category] = [];
    grouped[ep.category].push(ep);
  });

  let html = `
  <html>
  <head>
    <title>MCP Server API Documentation</title>
    <style>
      body { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; margin: 40px; background: #f9fafb; color: #222; }
      h1 { color: #2c3e50; }
      .tabs { display: flex; margin-bottom: 20px; cursor: pointer; user-select: none; }
      .tab {
        padding: 12px 20px;
        margin-right: 4px;
        background: #ddd;
        border-radius: 6px 6px 0 0;
        font-weight: bold;
        color: #444;
      }
      .tab.active {
        background: #2980b9;
        color: white;
      }
      .endpoint-table {
        border-collapse: collapse;
        width: 100%;
        box-shadow: 0 2px 10px rgb(0 0 0 / 0.1);
        border-radius: 6px;
        overflow: hidden;
        margin-bottom: 40px;
      }
      th, td {
        padding: 12px 15px;
        border-bottom: 1px solid #eee;
        text-align: left;
        font-size: 14px;
      }
      th {
        background: #2980b9;
        color: white;
        font-weight: 600;
        letter-spacing: 0.03em;
      }
      tr:hover {
        background: #f0f7ff;
      }
      code {
        background: #eee;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: Consolas, "Courier New", monospace;
      }
      pre {
        background: #f4f7f8;
        padding: 10px;
        border-radius: 5px;
        overflow-x: auto;
        font-size: 13px;
        line-height: 1.4em;
        max-height: 160px;
      }
    </style>
  </head>
  <body>
    <h1>MCP Server API Documentation</h1>
    <p>Browse all API endpoints grouped by categories. Click the tabs to switch sections.</p>

    <div class="tabs" id="tabs">
  `;

  // Tabs buttons
  Object.keys(grouped).forEach((category, i) => {
    html += `<div class="tab${i === 0 ? ' active' : ''}" data-tab="${i}">${category}</div>`;
  });

  html += `</div>`;

  // Tab contents
  Object.keys(grouped).forEach((category, i) => {
    html += `<div class="tab-content" id="tab-content-${i}" style="display: ${i === 0 ? 'block' : 'none'};">`;
    html += `<table class="endpoint-table">
      <thead>
        <tr>
          <th>Method</th>
          <th>URL</th>
          <th>Description</th>
          <th>Query Parameters</th>
          <th>Request Body (JSON)</th>
        </tr>
      </thead>
      <tbody>`;

    grouped[category].forEach(ep => {
      html += `<tr>
        <td><code>${ep.method}</code></td>
        <td><code>${ep.path}</code></td>
        <td>${ep.description}</td>
        <td><pre>${ep.query || '-'}</pre></td>
        <td><pre>${ep.body || '-'}</pre></td>
      </tr>`;
    });

    html += `</tbody></table></div>`;
  });

  // JS for tabs
  html += `
  <script>
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const idx = tab.dataset.tab;
        contents.forEach((c, i) => c.style.display = i == idx ? 'block' : 'none');
      });
    });
  </script>
  `;

  html += `</body></html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// Global error handler middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`MCP Server running on port ${PORT}, owner=${OWNER}`);
});
