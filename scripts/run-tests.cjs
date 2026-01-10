#!/usr/bin/env node

const { spawnSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distMockApi = path.join(projectRoot, 'tests', '.dist', 'mockApi.js');
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: projectRoot, ...opts });
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

const canBuild = nodeMajor >= 14; // TypeScript CLI requires modern Node

if (canBuild) {
  run('npm', ['run', 'build:test', '--silent']);
} else {
  console.warn(
    `[tests] Skipping TypeScript build on Node ${process.versions.node}. Use Node >=14 (ideally >=18/20) for full test coverage.`,
  );
}

// Always run report state test (pure CJS)
run('node', ['tests/unit/reportState.cjs']);

// Run mockApi tests only on modern Node and when build artifact is present
if (nodeMajor >= 14) {
  if (existsSync(distMockApi)) {
    run('node', ['tests/unit/mockApi.mjs']);
  } else {
    console.warn(
      '[tests] Skipping mockApi.mjs because tests/.dist/mockApi.js is missing. Run build:test on Node >=14.',
    );
  }
} else {
  console.warn('[tests] Skipping mockApi.mjs on older Node. Use Node >=14 to run full suite.');
}
