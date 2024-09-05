# actions-find-artifact-by-ref

Search all workflows associated with a particular ref (commit/tag/branch) to
find (and possibly download) a specific artifact. Will fail if zero or more than
one matching artifacts are found.

## Usage

```yaml
- uses: colpal/actions-find-artifact-by-ref@v2
  with:
    # The git ref for which the workflows should be searched
    # Required
    ref: string

    # The name of the artifact to match
    # Required
    artifact_name: string

    # The name of the run that generated the artifact. This can help narrow the
    # number of workflow runs that are considered, reducing the chance of
    # artifact name collisions and reducing the number of necessary API calls.
    # If not provided, all workflow runs for the provided ref will be considered.
    # The run name will generally match the job name, but can include additional
    # text if the job run was part of a `matrix` or a reusable workflow
    # Optional
    # Default: ""
    run_name: string

    # If true, will download the artifact to the current working directory
    # Optional
    # Default: false
    download: boolean

    # The token to use to authenticate to the GitHub API
    # Optional
    # Default: ${{ github.token }}
    github_token: string
```

## Outputs

```yaml
# The GitHub API Artifact ID associated with the matched artifact
artifact_id: string

# The error code (if an error is encountered)
error: string
```

## Examples

### Downloading a Terraform plan upon PR close

```yaml
# plan.yaml
on: pull_request

concurrency: terraform

jobs:
  plan:
    runs-on: # ...
    steps:
      - uses: actions/checkout@v2

      - uses: hashicorp/setup-terraform@v1
        with:
          terraform_version: 1.1.6

      - run: terraform init -input=false

      - run: terraform plan -input=false -out=tfplan

      - uses: actions/upload-artifact@v2
        with:
          name: tfplan
          path: tfplan
```

```yaml
# apply.yaml
on:
  pull_request:
    types:
      - closed
    branches:
      - main

concurrency: terraform

jobs:
  apply:
    if: github.event.pull_request.merged == 'true'
    runs-on: # ...
    steps:
      - uses: actions/checkout@v2

      - uses: hashicorp/setup-terraform@v1
        with:
          terraform_version: 1.1.6

      - run: terraform init -input=false

      - uses: colpal/action-find-artifact-by-ref@v2
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          artifact_name: tfplan
          run_name: plan
          download: true

      - run: unzip tfplan.zip

      - run: terraform apply tfplan
```
