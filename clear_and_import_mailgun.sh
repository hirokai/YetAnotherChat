#!/bin/bash

cd "$(dirname "$0")"
npx ts-node other/prepare_data.ts
npx ts-node other/import_mailgun_log.ts
