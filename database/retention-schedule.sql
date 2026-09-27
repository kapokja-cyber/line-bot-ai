-- Conversation messages are hidden immediately at expiry by the history API.
-- Physically remove expired messages every hour. Patient cards are not deleted.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('nongnadee-expired-conversations', '0 * * * *', 'select public.purge_expired_history();');
select jobname, schedule, active from cron.job where jobname = 'nongnadee-expired-conversations';
