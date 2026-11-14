#!/bin/bash
# Dựng lại CSDL thử nghiệm cục bộ t1 từ đầu (Postgres 16 ở /var/lib/postgresql/pgtest, cổng 5433)
set -e
D=/var/lib/postgresql/pgtest
pg_isready -h /tmp -p 5433 -q || su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $D/data -o '-k /tmp -p 5433' -l $D/log start" >/dev/null
for i in $(seq 1 20); do pg_isready -h /tmp -p 5433 -q && break; sleep 0.5; done
cd "$(dirname "$0")"
P="psql -h /tmp -p 5433 -U postgres -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists t1" -c "create database t1"
sed '/storage.buckets/d' ../../backend/schema.sql > /tmp/schema_old.sql
$P -d t1 -f stub_supabase.sql -f /tmp/schema_old.sql 2>&1 | grep -v WARNING || true
for f in ../migrations/*.sql; do
  case "$f" in *_run_migrate.sql|*_remigrate.sql) continue;; esac
  $P -d t1 -f "$f" 2>&1 | grep -v "NOTICE\|WARNING\|HINT" || true
done
echo "local db ready"
