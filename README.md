# Release Linker

A GitHub Action for linking a release to its corresponding Linear tasks. This action streamlines your release workflow by associating GitHub releases with Linear issues, optionally moving them to the 'Done' state.

## Purpose

This action is designed to:
- Link a GitHub release to related Linear tasks by attaching the release's URL and/or adding a label with the version name.
- Optionally move processed Linear issues to the 'Done' state.

## Inputs

| Name            | Description                                                        | Required | Default   |
|-----------------|--------------------------------------------------------------------|----------|-----------|
| `VERSION_NAME`  | The version of the new release in format `1.2.3`.                  | Yes      | N/A       |
| `LINEAR_API_KEY`| The Linear API key used to authenticate requests.                  | Yes      | N/A       |
| `GITHUB_TOKEN`  | The GitHub token used to authenticate requests.                    | Yes      | N/A       |
| `GITHUB_ORG`    | The GitHub organization.                                           | Yes      | N/A       |
| `GITHUB_REPO`   | The GitHub repository name.                                        | Yes      | N/A       |
| `MODE`          | Mode of operation: `'link'`, `'attach'`, or `'both'`.              | Yes      | N/A       |
| `MOVE_TO_DONE`  | If set, moves the Linear issues to the 'Done' state after linking. | No       | `""`      |

## Outputs

| Name     | Description                  |
|----------|------------------------------|
| `result` | The result of the action.    |

## Example Usage

Add the following to your workflow YAML file (e.g. `.github/workflows/release-linker.yml`):

```yaml
name: Link Release to Linear

on:
  release:
    types: [published]

jobs:
  link-release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Link Release to Linear Tasks
        uses: Luscii/gha-release-linker@v1
        with:
          VERSION_NAME: ${{ github.event.release.tag_name }}
          LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_ORG: your-org
          GITHUB_REPO: your-repo
          MODE: both
          MOVE_TO_DONE: true
```

## Notes

- Ensure your Linear API key and GitHub token are stored securely as secrets.
- The action supports three modes: `'link'`, `'attach'`, or `'both'`.
- For more configuration options, see the [action.yml](./action.yml) file.

## Local Development & Testing

To set up the project locally:

1. Install dependencies:
  ```bash
  npm install
  ```

2. Copy the example environment file and update values as needed:
  ```bash
  cp .env.example .env
  ```

3. To test the action locally, use [`@github/local-action`](https://github.com/github/local-action):
  ```bash
  npx @github/local-action . src/main.ts .env
  ```

This will execute the action using your local environment variables.

## Generating a New Release

To create a new release, use the provided `script/release` script. This script automates version bumping, changelog generation, and tagging.

1. Run the release script:
  ```bash
  ./script/release
  ```

2. Follow the prompts to select the release type (major, minor, patch).

3. The script will:
  - Update the version in `package.json`
  - Generate or update the changelog
  - Commit changes and create a new git tag

4. Push the changes and tags to GitHub:
  ```bash
  git push && git push --tags
  ```

