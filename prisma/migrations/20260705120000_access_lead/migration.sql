-- Add a LEAD panel-access level between NONE and SUPERVISOR.
ALTER TYPE "AccessLevel" ADD VALUE IF NOT EXISTS 'LEAD' AFTER 'NONE';
