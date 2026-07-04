-- Remove the Tabs feature: drop the job->tab association and the Tab table.
ALTER TABLE "Job" DROP CONSTRAINT "Job_tabId_fkey";
ALTER TABLE "Job" DROP COLUMN "tabId";
DROP TABLE "Tab";
