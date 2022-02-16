import { writeFile } from 'fs/promises';
import { getBooleanInput, getInput, setOutput } from '@actions/core';
import * as github from '@actions/github';

function flatten(xs) {
  return xs.flat();
}

async function get_all_check_suites(octokit, ref) {
  return octokit.paginate(octokit.rest.checks.listSuitesForRef, {
    ...github.context.repo,
    ref,
    check_name: getInput('check_name'),
    status: 'completed',
  });
}

async function get_all_workflow_runs(octokit, check_suites) {
  return Promise.all(check_suites.map(({ id }) => (
    octokit.paginate(octokit.rest.actions.listWorkflowRunsForRepo, {
      ...github.context.repo,
      check_suite_id: id,
    })
  ))).then(flatten);
}

async function get_all_artifacts(octokit, workflow_runs) {
  return Promise.all(workflow_runs.map(({ id }) => (
    octokit.paginate(octokit.rest.actions.listWorkflowRunArtifacts, {
      ...github.context.repo,
      run_id: id,
    })
  ))).then(flatten);
}

async function download_artifact(octokit, { id, name }) {
  const { data } = await octokit.rest.actions.downloadArtifact({
    ...github.context.repo,
    archive_format: 'zip',
    artifact_id: id,
  });
  return writeFile(`${name}.zip`, Buffer.from(data));
}

async function main() {
  const token = getInput('github_token', { required: true });
  const artifact_name = getInput('artifact_name', { required: true });
  const ref = getInput('ref', { required: true });

  const octokit = github.getOctokit(token);

  const check_suites = await get_all_check_suites(octokit, ref);
  const workflow_runs = await get_all_workflow_runs(octokit, check_suites);
  const artifacts = await get_all_artifacts(octokit, workflow_runs);

  const matching_artifacts = artifacts.filter((a) => a.name === artifact_name);

  switch (matching_artifacts.length) {
    case 1: {
      const [artifact] = matching_artifacts;
      setOutput('artifact_id', artifact.id);
      if (getBooleanInput('download')) {
        await download_artifact(octokit, artifact);
      }
      break;
    }
    case 0:
      setOutput('error', 'no-artifacts');
      throw new Error(`No artifacts found match the name: ${artifact_name}`);
    default: {
      setOutput('error', 'multiple-artifacts');
      const urls = matching_artifacts.map((a) => `'${a.url}'`).join(', ');
      throw new Error(`Multiple artifacts found: [ ${urls} ]`);
    }
  }
}

main();
