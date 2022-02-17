import { writeFile } from 'fs/promises';
import { getBooleanInput, getInput, setOutput } from '@actions/core';
import { context, getOctokit } from '@actions/github';

function flatten(xs) {
  return xs.flat();
}

async function getAllCheckSuites(octokit, ref) {
  return octokit.paginate(octokit.rest.checks.listSuitesForRef, {
    ...context.repo,
    ref,
    check_name: getInput('check_name'),
    status: 'completed',
  });
}

async function getAllWorkflowRuns(octokit, checkSuites) {
  return Promise.all(checkSuites.map(({ id }) => (
    octokit.paginate(octokit.rest.actions.listWorkflowRunsForRepo, {
      ...context.repo,
      check_suite_id: id,
    })
  ))).then(flatten);
}

async function getAllArtifacts(octokit, workflowRuns) {
  return Promise.all(workflowRuns.map(({ id }) => (
    octokit.paginate(octokit.rest.actions.listWorkflowRunArtifacts, {
      ...context.repo,
      run_id: id,
    })
  ))).then(flatten);
}

async function downloadArtifact(octokit, { id, name }) {
  const { data } = await octokit.rest.actions.downloadArtifact({
    ...context.repo,
    archive_format: 'zip',
    artifact_id: id,
  });
  return writeFile(`${name}.zip`, Buffer.from(data));
}

async function main() {
  const token = getInput('github_token', { required: true });
  const artifactName = getInput('artifact_name', { required: true });
  const ref = getInput('ref', { required: true });

  const octokit = getOctokit(token);

  const checkSuites = await getAllCheckSuites(octokit, ref);
  const workflowRuns = await getAllWorkflowRuns(octokit, checkSuites);
  const artifacts = await getAllArtifacts(octokit, workflowRuns);

  const matchingArtifacts = artifacts.filter((a) => a.name === artifactName);

  switch (matchingArtifacts.length) {
    case 1: {
      const [artifact] = matchingArtifacts;
      setOutput('artifact_id', artifact.id);
      if (getBooleanInput('download')) {
        await downloadArtifact(octokit, artifact);
      }
      break;
    }
    case 0:
      setOutput('error', 'no-artifacts');
      throw new Error(`No artifacts found match the name: ${artifactName}`);
    default: {
      setOutput('error', 'multiple-artifacts');
      const urls = matchingArtifacts.map((a) => `'${a.url}'`).join(', ');
      throw new Error(`Multiple artifacts found: [ ${urls} ]`);
    }
  }
}

main();
