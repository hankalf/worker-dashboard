-- Live fleet control: a one-shot command pushed to a screen, picked up and
-- cleared on its next heartbeat poll.
ALTER TABLE "Screen" ADD COLUMN "command" TEXT;
ALTER TABLE "Screen" ADD COLUMN "commandArg" TEXT;
ALTER TABLE "Screen" ADD COLUMN "commandAt" TIMESTAMP(3);
