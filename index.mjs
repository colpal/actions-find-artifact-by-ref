import { writeFile } from 'fs/promises';
import { getBooleanInput, getInput, setOutput } from '@actions/core';
import * as github from '@actions/github';

function flatten(xs) {
  return xs.flat();
}

async function main() {
  const token = getInput('github_token', { required: true });
  const artifact_name = getInput('artifact_name', { required: true });
  const ref = getInput('ref', { required: true });

  const octokit = github.getOctokit(token);

  const check_suites = await octokit.paginate(
    octokit.rest.checks.listSuitesForRef,
    {
      ...github.context.repo,
      ref,
      check_name: getInput('check_name'),
      status: 'completed',
    },
  );

  const workflow_runs = await Promise.all(check_suites.map(({ id }) => (
    octokit.paginate(octokit.rest.actions.listWorkflowRunsForRepo, {
      ...github.context.repo,
      check_suite_id: id,
    })
  ))).then(flatten);

  const artifacts = await Promise.all(workflow_runs.map(({ id }) => (
    octokit.paginate(octokit.rest.actions.listWorkflowRunArtifacts, {
      ...github.context.repo,
      run_id: id,
    })
  ))).then(flatten);

  const matching_artifacts = artifacts
    .filter(({ name }) => name === artifact_name);

  switch (matching_artifacts.length) {
    case 1: {
      const [artifact] = matching_artifacts;
      setOutput('artifact_id', artifact.id);
      if (getBooleanInput('download')) {
        const { data } = await octokit.rest.actions.downloadArtifact({
          ...github.context.repo,
          archive_format: 'zip',
          artifact_id: artifact.id,
        });
        await writeFile(`${artifact_name}.zip`, Buffer.from(data));
      }
      break;
    }
    case 0:
      throw new Error(`No artifacts found match the name: ${artifact_name}`);
    default: {
      const urls = matching_artifacts.map((a) => `'${a.url}'`).join(', ');
      throw new Error(`Multiple artifacts found: [ ${urls} ]`);
    }
  }
}

main();
