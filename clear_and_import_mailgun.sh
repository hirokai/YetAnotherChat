#!/bin/bash

cd "$(dirname "$0")"
ts-node other/prepare_data.ts
ts-node other/import_mailgun_log.ts
