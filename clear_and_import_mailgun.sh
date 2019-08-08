#!/bin/bash

cd "$(dirname "$0")"
node migration/initialize_table.js
node migration/migrate_20190806.js
node migration/migrate_20190808.js
npx ts-node migration/prepare_data.ts
npx ts-node migration/import_mailgun_log.ts
npx ts-node migration/merge_users.ts