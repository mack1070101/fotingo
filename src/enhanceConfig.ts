import { mergeDeepLeft } from 'ramda';
import { Config } from './config';
import { Git } from './git/Git';
import { GitErrorType } from './git/GitError';
import { getFileContent } from './io/file';

interface DefaultConfig {
  git: {
    baseBranch: string;
    branchTemplate: string;
    remote: string;
  };
  github: {
    baseBranch: string;
    pullRequestTemplate: string;
  };
  release: {
    template: string;
  };
}

const defaultConfig: DefaultConfig = {
  git: {
    baseBranch: 'master',
    branchTemplate: '{issue.shortName}/{issue.key}_{issue.sanitizedSummary}',
    remote: 'origin',
  },
  github: {
    baseBranch: 'master',
    pullRequestTemplate:
      '{firstIssue.summary}\n\n**Description**\n\n{firstIssue.description}\n\n{fixedIssues}\n\n**Changes**\n\n{changes}\n\n{fotingo.banner}',
  },
  release: {
    template:
      '{version}\n\n{fixedIssuesByCategory}\n\nSee [Jira release]({jira.release})\n\n{fotingo.banner}',
  },
};

/**
 * Enhance the current configuration with overrides from the CLI arguments
 * @param config Current config
 * @param data Program data (yargs)
 */
export function enhanceConfigWithRuntimeArgs(config: Config, data: { branch?: string }): Config {
  return mergeDeepLeft(
    data.branch !== undefined
      ? {
          git: {
            baseBranch: data.branch,
          },
          github: {
            baseBranch: data.branch,
          },
        }
      : {},
    config,
  ) as Config;
}

/**
 * Enhance the current configuration with some defaults and information that can be derived from
 * the running environment
 * @param config Current config
 */
export async function enhanceConfig(config: Config): Promise<Config> {
  const configWithDefaults = mergeDeepLeft(config, defaultConfig) as Config;
  try {
    const git = new Git(configWithDefaults.git);
    const rootDir = await git.getRootDir();
    const prTemplate = await getFileContent('PULL_REQUEST_TEMPLATE.md', rootDir, ['.', '.github']);
    return git.getRemote(configWithDefaults.git.remote).then(
      remote =>
        mergeDeepLeft(
          {
            github: {
              // TODO Fix this
              pullRequestTemplate: prTemplate || configWithDefaults.github.pullRequestTemplate,
            },
          },
          {
            ...configWithDefaults,
            github: {
              ...configWithDefaults.github,
              owner: remote.owner,
              repo: remote.name,
            },
          },
        ) as Config,
    );
  } catch (e) {
    if (e.code && e.code === GitErrorType.NOT_A_GIT_REPO) {
      // Ignore the error, as it means we are running fotingo outside a repo
      return configWithDefaults;
    }
    throw e;
  }
}
