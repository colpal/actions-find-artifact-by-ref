import { writeFile } from 'fs/promises';
import { getBooleanInput, getInput, setOutput } from '@actions/core';
import { context, getOctokit } from '@actions/github';

function flatten(xs) {
  return xs.flat();
}

async function queryWorkflowIDsForCommit(octokit, ref) {
  const response = await octokit.graphql(
    `
      query ($owner: String!, $repo: String!, $ref: String!) {
        repository(owner: $owner, name: $repo) {
          object(expression: $ref) {
            ... on Commit {
              checkSuites(last: 100) {
                nodes {
                  workflowRun {
                    databaseId
                  }
                }
              }
            }
          }
        }
      }
    `,
    { ...context.repo, ref },
  );
  return response
    .repository
    .object
    .checkSuites
    .nodes
    .map((n) => n?.workflowRun?.databaseId)
    .filter(Boolean);
}

async function getAllArtifacts(octokit, workflowIDs) {
  return Promise.all(workflowIDs.map((id) => (
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

  const workflowIDs = await queryWorkflowIDsForCommit(octokit, ref);
  const artifacts = await getAllArtifacts(octokit, workflowIDs);

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
