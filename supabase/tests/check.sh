#!/bin/bash
# Kiểm tra nhanh toàn bộ trước khi push:  bash supabase/tests/check.sh        (≈1 phút)
#                                        bash supabase/tests/check.sh --ui   (thêm kiểm thử giao diện Playwright)
set -e
cd "$(dirname "$0")"
D=/var/lib/postgresql/pgtest
if [ ! -f $D/data/PG_VERSION ]; then   # máy mới: tạo cụm Postgres thử nghiệm
  mkdir -p $D/data && chown -R postgres $D
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $D/data -A trust -U postgres" >/dev/null
fi
echo "▶ JS syntax";  for f in ../../v2/js/*.js ../../v2/js/pages/*.js; do node --check "$f"; done
echo "▶ DB dựng lại + migrations"; bash reset_local.sh 2>&1 | grep -E "ERROR|ready" || true
echo "▶ So với luật bản cũ"; node compare_legacy.mjs | tail -1
P="psql -h /tmp -p 5433 -U postgres -d t1 -q -v ON_ERROR_STOP=1"
for t in rls_test.sql modules_test.sql scoring_test.sql x3_test.sql hot_test.sql tiktok_test.sql fund_test.sql tasks_test.sql zones_test.sql cum_test.sql todo_test.sql; do
  if $P -f $t > /tmp/$t.out 2>&1; then echo "  ✓ $t"; else echo "  ✗ $t"; tail -5 /tmp/$t.out; exit 1; fi
done
echo "▶ Khuôn tóm tắt công việc (AI)"; node --experimental-strip-types --no-warnings ai_summary_test.mjs
echo "▶ Chép quỹ cũ (dữ liệu giả)"; node import_quy_test.mjs | head -1
if [ "$1" = "--ui" ]; then
  echo "▶ Giao diện"; cd ui; pkill -f "node server.mjs" || true; (node server.mjs > /tmp/uiserver.log 2>&1 &); sleep 1
  for r in run3.mjs run4.mjs run5.mjs run6.mjs run7.mjs run8.mjs run9.mjs run10.mjs run11.mjs run12.mjs run13.mjs run14.mjs run15.mjs run16.mjs mobile.mjs; do timeout 240 node --experimental-strip-types --no-warnings $r 2>&1 | grep -E "error|ERROR|Timeout|toast|no browser|overflow|ảnh" | head -8; done
fi
echo "✅ OK"
