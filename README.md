# LISD English attendance

The GitHub workflow runs on weekdays at 12:06 a.m. America/Chicago. It signs in afresh using two GitHub repository secrets, checks the current local date against Canvas Grades, and stops on unfamiliar questions. It will not answer questions about the student's actual participation.

## Set up

1. In this repository's Settings → Secrets and variables → Actions, add `LISD_USERNAME` and `LISD_PASSWORD`. Enter them there, never into chat or a repository file.
2. Open Actions → English attendance to review each run. A school verification challenge or changed page may block it. GitHub may delay a scheduled job.

Four known factual questions are in `attendance.mjs`. An unseen question is reported with its choices and is not submitted. The companion ChatGPT task checks at 12:15 a.m. Central on weekdays. If no GitHub run started, it triggers one by updating `answers.json`. It may read a private run log, add a carefully checked factual answer to `answers.json`, and trigger a second GitHub run. If the question asks about participation, the answer is unclear, or access fails, the task reports the blocker.

GitHub Actions and an AI reviewer cannot guarantee a successful submission every day. Check the run result and Canvas Grades when an issue is reported.
