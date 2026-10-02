# LISD English attendance cloud prototype

This is a **manual-test-only prototype**. The schedule is commented out. It signs in afresh using two GitHub repository secrets, checks the current America/Chicago date against Canvas Grades, and stops on unfamiliar questions. It will not answer questions about the student's real participation.

## Set up

1. In this repository's Settings → Secrets and variables → Actions, add `LISD_USERNAME` and `LISD_PASSWORD`. Enter them there, never into chat or a repository file.
2. Open Actions → English attendance → Run workflow. Review the job summary. A school verification challenge or changed page may block it.
4. Only after a successful login and a safely verified run, uncomment the `schedule` lines. The configured time is 12:01 a.m. America/Chicago, though GitHub may delay a scheduled job.

The answer allowlist has four known factual questions. An unseen question is reported as blocked and not submitted. To achieve hands-off answers for new questions, this prototype needs a separately tested answer service; a generic guess would violate the attendance safeguards. The existing ChatGPT task should remain paused until a replacement is proven.
