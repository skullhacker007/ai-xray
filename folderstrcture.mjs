import { mkdir, rename, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const src = path.join(root, 'src');

// Move existing application folders into src/
const foldersToMove = [
  'app',
  'components',
  'hooks',
  'stores',
  'lib',
  'types',
  'server'
];

async function exists(location) {
  try {
    await access(location);
    return true;
  } catch {
    return false;
  }
}

console.log('\nAI X-RAY: Preparing project structure...\n');

await mkdir(src, { recursive: true });

for (const folder of foldersToMove) {
  const oldPath = path.join(root, folder);
  const newPath = path.join(src, folder);

  if (await exists(oldPath)) {
    if (await exists(newPath)) {
      console.log(`SKIPPED: ${folder} (destination already exists)`);
    } else {
      await rename(oldPath, newPath);
      console.log(`MOVED: ${folder} → src/${folder}`);
    }
  }
}

const directories = [
  // Next.js application
  'src/app/(workspace)/executions',
  'src/app/(workspace)/executions/[executionId]',
  'src/app/(workspace)/experiments',
  'src/app/(workspace)/providers',

  // API routes
  'src/app/api/health',
  'src/app/api/traces',
  'src/app/api/executions',
  'src/app/api/experiments',

  // UI components
  'src/components/layout',
  'src/components/flow/nodes',
  'src/components/flow/edges',
  'src/components/timeline',
  'src/components/inspector/tabs',
  'src/components/token-forensics',
  'src/components/resource-forensics',
  'src/components/comparison',
  'src/components/ui',

  // Frontend utilities
  'src/hooks',
  'src/stores',
  'src/lib/api',
  'src/lib/formatters',
  'src/lib/validation',
  'src/types',

  // TypeScript backend
  'src/server/services',
  'src/server/repositories',
  'src/server/trace',
  'src/server/events',
  'src/server/experiments',

  // AI provider integrations
  'integrations/providers/nvidia',
  'integrations/providers/anthropic',
  'integrations/providers/openai',
  'integrations/providers/codex',
  'integrations/providers/custom',

  // MCP and agent integrations
  'integrations/mcp/client',
  'integrations/mcp/server',
  'integrations/agents',

  // Inference integrations
  'integrations/inference/vllm',
  'integrations/inference/llama-cpp',

  // Shared packages
  'packages/event-schema/src',
  'packages/trace-contracts/src',

  // Protocols
  'protocols/protobuf',
  'protocols/json-schema',

  // Rust core engine
  'engines/rust-core/src/collector',
  'engines/rust-core/src/tracing',
  'engines/rust-core/src/event_processor',
  'engines/rust-core/src/token_ledger',
  'engines/rust-core/src/resource_monitor',
  'engines/rust-core/src/storage',
  'engines/rust-core/tests',

  // Python AI instrumentation
  'engines/python-ai/xray/tokenizers',
  'engines/python-ai/xray/embeddings',
  'engines/python-ai/xray/transformer',
  'engines/python-ai/xray/attention',
  'engines/python-ai/xray/activations',
  'engines/python-ai/xray/kv_cache',
  'engines/python-ai/xray/gpu_profiler',
  'engines/python-ai/xray/experiments',
  'engines/python-ai/tests',

  // Database
  'database/migrations',
  'database/seeds',

  // Infrastructure
  'infrastructure/docker',
  'infrastructure/observability',
  'infrastructure/scripts',

  // Tests
  'tests/unit',
  'tests/integration',
  'tests/e2e',
  'tests/fixtures',

  // Documentation
  'docs/architecture',
  'docs/event-schema',
  'docs/instrumentation',
  'docs/providers',
  'docs/experiments'
];

for (const directory of directories) {
  await mkdir(path.join(root, directory), { recursive: true });
}

console.log('\n===================================');
console.log(' AI X-RAY STRUCTURE CREATED');
console.log('===================================');
console.log(`Directories processed: ${directories.length}`);
console.log(`Project root: ${root}`);
console.log('Application source: src/');
console.log('Existing destination folders were preserved.');
console.log('===================================\n');