import program from 'commander';
import R from 'ramda';

import { getProject } from './git/util';
import config from './config';
import { handleError } from './error';
import init from './init';
import reporter from './reporter';
import { wrapInPromise } from './util';


try {
  program
    .option('-n, --no-branch-issue', 'Do not pick issue from branch name')
    .option('-s, --simple', 'Do not use any issue tracker')
    .parse(process.argv);

  const shouldGetIssue = R.partial(R.both(
    R.compose(R.equals(true), R.prop('branchIssue')),
    R.compose(R.not, R.equals(true), R.prop('simple'))
  ), [program]);
  const { step, stepCurried } = reporter.stepFactory(shouldGetIssue() ? 7 : 4);
  const stepOffset = shouldGetIssue ? 0 : 2;
  const project = getProject(process.cwd());
  step(1, 'Initializing services', 'rocket');
  init(config, program)
    .then(({ git, github, issueTracker }) =>
      wrapInPromise(stepCurried(2, 'Pushing current branch to Github', 'arrow_up'))
        .then(git.pushBranchToGithub(config))
        .then(R.ifElse(
          shouldGetIssue,
          R.compose(
            issueTracker.getIssue,
            stepCurried(4, `Getting issue from ${issueTracker.name}`, 'bug'),
            git.extractIssueFromCurrentBranch,
            stepCurried(3, 'Extracting issue from current branch', 'mag_right')
          ),
          R.always(undefined),
        ))
        .then(issue => {
          step(5 - stepOffset, 'Getting your commit history', 'books');
          return git.getBranchInfo()
            .then(step(6 - stepOffset, 'Creating pull request', 'speaker'))
            .then(github.createPullRequest(config, project, issue, issueTracker.issueRoot));
        })
        .then(R.ifElse(
          R.partial(R.compose(R.not, R.propEq('simple', true)), [program]),
          ({ issues, pullRequest }) =>
            R.compose(
              promises => Promise.all(promises),
              R.map(R.composeP(
                R.partial(
                  issueTracker.setIssueStatus,
                  [{ status: issueTracker.status.IN_PROGRESS, comment: `PR: ${pullRequest.html_url}` }]
                ),
                issueTracker.getIssue,
                R.compose(wrapInPromise, R.prop('key'))
              )),
              stepCurried(7 - stepOffset, `Setting issues to code review on ${issueTracker.name}`, 'bookmark')
            )(issues),
          R.identity
        )))
    .then(reporter.footer)
    .catch(handleError);
} catch (e) {
  handleError(e);
  program.help();
}
