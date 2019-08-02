#!/bin/bash

cd "$(dirname "$0")"
node other/prepare_data.js
ts-node other/import_mailgun_log.js
